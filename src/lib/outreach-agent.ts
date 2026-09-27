import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import {
  agentTasks,
  leads,
  contacts,
  conversations,
  messages,
  integrations,
} from "../../drizzle/schema";
import crypto from "crypto";

export async function processOutreachTask(taskId: string): Promise<boolean> {
  // 1. Fetch and lock the task safely
  const task = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(agentTasks)
      .where(and(eq(agentTasks.id, taskId), eq(agentTasks.status, "pending")))
      .limit(1);

    if (rows.length === 0) return null;

    const t = rows[0];
    if (!t) return null;

    await tx
      .update(agentTasks)
      .set({
        status: "processing",
        locked_at: new Date(),
        attempts: (t.attempts || 0) + 1,
      })
      .where(eq(agentTasks.id, t.id));

    return t;
  });

  if (!task) {
    console.log(`Task ${taskId} is not available for processing.`);
    return false;
  }

  try {
    const payload = task.payload as { leadId?: string; contactId?: string };
    const leadId = payload?.leadId || task.target_id;

    if (!leadId) {
      throw new Error("No leadId provided in task payload or target_id");
    }

    // 2. Fetch Lead & Contact with workspace isolation
    const leadRows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.workspace_id, task.workspace_id)))
      .limit(1);

    const lead = leadRows[0];
    if (!lead) throw new Error("Lead not found or unauthorized");

    let contact = null;
    if (lead.contact_id) {
      const contactRows = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, lead.contact_id), eq(contacts.workspace_id, task.workspace_id)))
        .limit(1);
      contact = contactRows[0];
    } else if (payload?.contactId) {
      const contactRows = await db
        .select()
        .from(contacts)
        .where(
          and(eq(contacts.id, payload.contactId), eq(contacts.workspace_id, task.workspace_id)),
        )
        .limit(1);
      contact = contactRows[0];
    }

    if (!contact) throw new Error("No contact associated with lead");

    // 3. Respect Consent / Opt-Out
    // Note: We are relying on contact.status for now, but a migration was generated for opted_out
    if (
      contact.status === "opt_out" ||
      contact.status === "unsubscribed" ||
      contact.status === "do_not_contact"
    ) {
      console.log(`Contact ${contact.id} has opted out. Skipping outreach.`);
      await db.update(agentTasks).set({ status: "completed" }).where(eq(agentTasks.id, task.id));
      return true; // Successfully processed by ignoring
    }

    // 4. Fetch Active Integration (e.g., Gmail)
    const integrationRows = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.workspace_id, task.workspace_id),
          eq(integrations.provider, "gmail"),
          eq(integrations.status, "active"),
        ),
      )
      .limit(1);

    const gmailIntegration = integrationRows[0];
    if (!gmailIntegration) {
      throw new Error("No active Gmail integration found for outreach.");
    }

    // 5. Personalize Message
    // (In a real app, you'd fetch company data here, but it's currently missing in schema)
    const nameToUse = contact.name || "there";
    const personalizedBody = `Hi ${nameToUse},\n\nWe noticed your great work and would love to connect to discuss how we can help your team.\n\nBest regards,\nThe Team`;

    // 6. Persist Outreach Records (Dry Run the actual send)
    await db.transaction(async (tx) => {
      // Find or create conversation
      let conversationId = "";
      const existingConv = await tx
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.contact_id, contact.id),
            eq(conversations.workspace_id, task.workspace_id),
            eq(conversations.platform, "email"),
          ),
        )
        .limit(1);

      if (existingConv.length > 0 && existingConv[0]) {
        conversationId = existingConv[0].id;
      } else {
        conversationId = crypto.randomUUID();
        await tx.insert(conversations).values({
          id: conversationId,
          workspace_id: task.workspace_id,
          contact_id: contact.id,
          platform: "email",
          status: "open",
        });
      }

      // Record the message
      const messageId = crypto.randomUUID();
      await tx.insert(messages).values({
        id: messageId,
        workspace_id: task.workspace_id,
        conversation_id: conversationId,
        direction: "outbound",
        content: personalizedBody,
      });

      // (DRY RUN ONLY) - Do not actually send the email via an external API here
      console.log(`[DRY RUN] Would send email to ${contact.email}:`);
      console.log(personalizedBody);

      // Update task to completed
      await tx.update(agentTasks).set({ status: "completed" }).where(eq(agentTasks.id, task.id));

      // Update lead status to contacted
      await tx.update(leads).set({ status: "contacted" }).where(eq(leads.id, lead.id));
    });

    return true;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Outreach task failed: ${errorMessage}`);
    await db
      .update(agentTasks)
      .set({
        status: "failed",
        error: errorMessage || "Unknown error",
      })
      .where(eq(agentTasks.id, task.id));
    return false;
  }
}
