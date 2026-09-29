import { poolConnection } from "../src/db/index";

async function checkColumns() {
  try {
    const [rows] = await poolConnection.query("DESCRIBE session;");
    console.log("Columns in session table:", rows);
  } catch (error) {
    console.error("Database query failed:", error);
  } finally {
    process.exit(0);
  }
}

checkColumns();
