import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../drizzle/schema";

// Ensure environment variable is provided
const dbUrl = process.env["HOSTINGER_DB_URL"];
if (!dbUrl && process.env["NODE_ENV"] === "production") {
  throw new Error("HOSTINGER_DB_URL environment variable is not set");
}

// Create the connection pool
export const poolConnection = mysql.createPool({
  uri: dbUrl || "mysql://user:pass@localhost:3306/db",
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
  idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// Export the drizzle instance
export const db = drizzle(poolConnection, { schema, mode: "default" });

export async function testConnection() {
  try {
    const connection = await poolConnection.getConnection();
    console.log("Database connection successful");
    connection.release();
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}
