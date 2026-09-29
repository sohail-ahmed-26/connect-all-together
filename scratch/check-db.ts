import { db, poolConnection } from "../src/db/index";

async function check() {
  try {
    const [rows] = await poolConnection.query("SHOW TABLES;");
    console.log("Tables:", rows);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

check();
