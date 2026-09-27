import fs from "fs";
import path from "path";
import { migrate } from "drizzle-orm/mysql2/migrator";

// Load .env
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

async function runMigrations() {
  try {
    const { db, poolConnection } = await import("./index.js");
    console.log("Running migrations...");
    await migrate(db, { migrationsFolder: "./drizzle/migrations" });
    console.log("Migrations applied successfully!");

    // Check tables after migration
    const { sql } = await import("drizzle-orm");
    const [tablesRow] = await db.execute(sql`SHOW TABLES`);
    console.log(
      "Current tables:",
      Object.values(tablesRow).map((row) => Object.values(row as object)[0]),
    );

    await poolConnection.end();
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigrations();
