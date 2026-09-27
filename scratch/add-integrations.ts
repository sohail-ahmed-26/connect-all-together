import { db } from "../src/db";

async function applyIntegrationsTable() {
  try {
    console.log("Applying integrations table...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS \`integrations\` (
        \`id\` varchar(36) NOT NULL,
        \`workspace_id\` varchar(36) NOT NULL,
        \`provider\` varchar(50) NOT NULL,
        \`status\` varchar(50) NOT NULL DEFAULT 'active',
        \`metadata\` json,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON DELETE CASCADE
      )
    `);
    console.log("Created integrations table successfully.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

applyIntegrationsTable();
