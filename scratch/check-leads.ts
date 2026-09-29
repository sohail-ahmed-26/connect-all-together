import { poolConnection } from "../src/db/index";

async function checkLeads() {
  try {
    const [rows] = await poolConnection.query("SELECT * FROM leads ORDER BY created_at DESC LIMIT 5;");
    console.log("Recent leads in DB:", rows);
  } catch (error) {
    console.error("Database query failed:", error);
  } finally {
    process.exit(0);
  }
}

checkLeads();
