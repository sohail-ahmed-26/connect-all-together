import fs from "fs";
import path from "path";
import url from "url";

// Load .env BEFORE any other imports to ensure index.ts has access to HOSTINGER_DB_URL
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch (e) {
    console.warn("Failed to load .env via process.loadEnvFile, falling back to manual parsing.", e);
    // basic fallback just in case node version doesn't support loadEnvFile or has a bug
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && match[1]) {
        let val = match[2] || "";
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    }
  }
}

export async function verifyConnection() {
  console.log("Attempting read-only connection to Hostinger MySQL...");

  let poolConnection;

  try {
    // Dynamically import to ensure env vars are populated first
    const { db, poolConnection: pool } = await import("./index");
    const { sql } = await import("drizzle-orm");
    poolConnection = pool;

    // Execute SELECT 1
    const result = await db.execute(sql`SELECT 1 as test`);

    if (result && result.length > 0) {
      console.log("SUCCESS: Database connection established and SELECT 1 executed successfully.");
      console.log("Result:", result[0]);
    } else {
      console.log("ERROR: SELECT 1 did not return expected result.");
    }
  } catch (error) {
    console.error("ERROR: Database connection verification failed.");
    console.error(error);
  } finally {
    if (poolConnection) {
      console.log("Closing connection pool cleanly...");
      await poolConnection.end();
    }
  }
}

// Ensure the script runs directly
const __filename = url.fileURLToPath(import.meta.url);
if (process.argv[1] && (process.argv[1] === __filename || process.argv[1].endsWith("test.ts"))) {
  verifyConnection();
}
