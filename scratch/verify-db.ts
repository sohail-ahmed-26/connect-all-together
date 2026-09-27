import { db } from "../src/db";
import { targetProfiles } from "../drizzle/schema";
import { eq } from "drizzle-orm";

async function runTest() {
  try {
    const runId = crypto.randomUUID();
    const workspaceId = "default-workspace";
    console.log("Inserting test profile...");

    await db.insert(targetProfiles).values({
      id: runId,
      workspace_id: workspaceId,
      name: "AI Startups (11–50)",
      industry: "AI Startups",
      target_location: "Global",
      employee_min: 11,
      employee_max: 50,
      keywords: "Founders, CEOs",
    });

    console.log("Inserted!");

    const result = await db.query.targetProfiles.findFirst({
      where: eq(targetProfiles.workspace_id, workspaceId),
    });

    console.log("Fetched profile:", result?.name);

    await db.delete(targetProfiles).where(eq(targetProfiles.id, runId));
    console.log("Cleaned up test profile.");
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

runTest();
