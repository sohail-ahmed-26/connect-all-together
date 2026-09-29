import { poolConnection } from "../src/db/index";

async function checkTables() {
  try {
    console.log("Connecting to DB...");
    const [rows] = await poolConnection.query("SHOW TABLES;");
    console.log("Tables in database:", rows);
  } catch (error) {
    console.error("Database query failed:", error);
  } finally {
    process.exit(0);
  }
}

checkTables();
