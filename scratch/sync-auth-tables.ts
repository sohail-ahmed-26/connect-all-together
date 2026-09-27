import { db, poolConnection } from "../src/db";

async function applyAuthMigrations() {
  console.log("DB URL defined?:", !!process.env.HOSTINGER_DB_URL);
  try {
    console.log("Applying auth schema updates...");

    // 1. Rename users to user if it exists
    const [rows] = await db.execute("SHOW TABLES LIKE 'users'");
    if ((rows as any[]).length > 0) {
      await db.execute("RENAME TABLE `users` TO `user`");
      console.log("Renamed users -> user");
    }

    // 2. Modify email_verified to boolean (tinyint) in user
    await db.execute("ALTER TABLE `user` MODIFY COLUMN `email_verified` boolean NOT NULL DEFAULT false");
    console.log("Updated email_verified in user");

    // 3. Add id_token to account
    try {
      await db.execute("ALTER TABLE `account` ADD COLUMN `id_token` text");
      console.log("Added id_token to account");
    } catch (e: any) {
      if (!e.message.includes("Duplicate column name")) {
        throw e;
      }
    }

    // 4. Create verification table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS \`verification\` (
        \`id\` varchar(36) NOT NULL,
        \`identifier\` text NOT NULL,
        \`value\` text NOT NULL,
        \`expires_at\` timestamp NOT NULL,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      )
    `);
    console.log("Created verification table");

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

applyAuthMigrations();
