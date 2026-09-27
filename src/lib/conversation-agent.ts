import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { leads, contacts, conversations, messages } from "../../drizzle/schema";
import crypto from "crypto";

export interface InboundPayload {
  workspaceId: string;
  contactId: string;
  platform: string;
  content: string;
}

export type Intent = "interested" | "not_interested" | "opt_out" | "needs_human" | "unknown";

/**
 * Basic intent interpreter using keyword matching.
 */
function analyzeIntent(content: string): Intent {
  const text = content.toLowerCase();

  // Opt-out signals
  if (
    text.includes("stop") ||
    text.includes("unsubscribe") ||
    text.includes("opt out") ||
    text.includes("remove me") ||
    text.includes("do not contact")
  ) {
    return "opt_out";
  }

  // Not interested signals
  if (
    text.includes("not interested") ||
    text.includes("no thanks") ||
    text.includes("take me off") ||
    text.includes("stop emailing")
  ) {
    return "not_interested";
  }

  // Interested signals
  if (
    text.includes("interested") ||
    text.includes("tell me more") ||
    text.includes("pricing") ||
    text.includes("demo") ||
    text.includes("yes") ||
    text.includes("sure") ||
    text.includes("meeting") ||
    text.includes("call")
  ) {
    return "interested";
  }

  // Needs human / complex questions
  if (
    text.includes("support") ||
    text.includes("help") ||
    text.includes("human") ||
    text.includes("talk to someone")
  ) {
    return "needs_human";
  }

  return "unknown";
}

/**
 * Prepares a draft response based on intent.
 */
function generateDraftResponse(intent: Intent, contactName: string): string | null {
  const firstName = contactName.split(" ")[0] || "there";

  switch (intent) {
    case "interested":
      return `Hi ${firstName}, I'm glad to hear you're interested! I'll have a specialist reach out to you shortly to discuss next steps.`;
    case "needs_human":
      return `Hi ${firstName}, I've escalated your message to our human team. Someone will be in touch ASAP.`;
    case "not_interested":
      return `Understood, ${firstName}. Thank you for your time, and we won't bother you again.`;
    case "opt_out":
      return null; // Do not respond to opt-outs, just respect them
    case "unknown":
    default:
      return `Hi ${firstName}, thanks for reaching out. Let me pass this to the right person on our team who can best assist you.`;
  }
}

/**
 * Processes an incoming message, identifies intent, maintains conversation state,
 * and generates a context-aware dry-run response.
 */
export async function handleInboundMessage(payload: InboundPayload): Promise<boolean> {
  const { workspaceId, contactId, platform, content } = payload;

  if (!workspaceId || !contactId || !content) {
    console.error("Malformed payload: Missing required fields");
    return false;
  }

  try {
    return await db.transaction(async (tx) => {
      // 1. Identify the contact and lead safely
      const contactRows = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.workspace_id, workspaceId)))
        .limit(1);

      const contact = contactRows[0];
      if (!contact) {
        throw new Error(`Contact ${contactId} not found in workspace ${workspaceId}`);
      }

      // 2. Identify or create the conversation
      let conversationId = "";
      const existingConv = await tx
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.contact_id, contact.id),
            eq(conversations.workspace_id, workspaceId),
            eq(conversations.platform, platform),
          ),
        )
        .limit(1);

      if (existingConv.length > 0 && existingConv[0]) {
        conversationId = existingConv[0].id;
      } else {
        conversationId = crypto.randomUUID();
        await tx.insert(conversations).values({
          id: conversationId,
          workspace_id: workspaceId,
          contact_id: contact.id,
          platform,
          status: "open",
        });
      }

      // 3. Record the inbound message
      const inboundMessageId = crypto.randomUUID();
      await tx.insert(messages).values({
        id: inboundMessageId,
        workspace_id: workspaceId,
        conversation_id: conversationId,
        direction: "inbound",
        content,
      });

      // 4. Analyze intent
      const intent = analyzeIntent(content);
      console.log(`[Conversation Agent] Detected intent: ${intent} for contact ${contact.id}`);

      // 5. Update Conversation / Contact / Lead state based on intent
      let newConvStatus = "open";

      if (intent === "opt_out" || intent === "not_interested") {
        newConvStatus = "closed";

        // Respect opt-out / not interested
        await tx.update(contacts).set({ status: "opt_out" }).where(eq(contacts.id, contact.id));

        if (contact.lead_id) {
          await tx
            .update(leads)
            .set({ status: "unqualified" })
            .where(eq(leads.id, contact.lead_id));
        }
      } else if (intent === "interested") {
        newConvStatus = "needs-attention";

        // Handoff to qualification (Issue #8) via status flag
        if (contact.lead_id) {
          await tx
            .update(leads)
            .set({ status: "qualification_pending" })
            .where(eq(leads.id, contact.lead_id));
        }
      } else if (intent === "needs_human") {
        newConvStatus = "needs-attention";
      }

      // Update conversation status
      await tx
        .update(conversations)
        .set({ status: newConvStatus })
        .where(eq(conversations.id, conversationId));

      // 6. Prepare and dry-run draft response
      const draft = generateDraftResponse(intent, contact.name);

      if (draft) {
        // Record draft outbound message (we assume 'outbound' direction, but ideally we'd have a 'status' field for draft)
        const outboundMsgId = crypto.randomUUID();
        await tx.insert(messages).values({
          id: outboundMsgId,
          workspace_id: workspaceId,
          conversation_id: conversationId,
          direction: "outbound",
          content: draft,
        });

        console.log(
          `[DRY RUN - DRAFT RESPONSE] Would reply to ${contact.email || "unknown"} on ${platform}:`,
        );
        console.log(draft);
      } else {
        console.log(`[DRY RUN] No response generated (Intent: ${intent}).`);
      }

      return true;
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Conversation Agent] Failed to process message: ${msg}`);
    return false;
  }
}
