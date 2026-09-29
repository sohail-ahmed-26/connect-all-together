import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../drizzle/schema";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env manually so SSR server functions get non-VITE_ vars ─────────────
// Vite only injects VITE_* env vars into SSR. We read .env ourselves so that
// HOSTINGER_DB_URL and PROSPEO_API_KEY are always available on process.env.
try {
  const envPath = resolve(process.cwd(), ".env");
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
} catch {
  // .env not present (production uses real env vars) — ignore
}

// Ensure environment variable is provided
const dbUrl = process.env["HOSTINGER_DB_URL"];
if (!dbUrl && process.env["NODE_ENV"] === "production") {
  throw new Error("HOSTINGER_DB_URL environment variable is not set");
}

/**
 * Safely parse a MySQL connection URL that may contain special characters
 * (including @ and * ) in the password. Node's URL class uses the LAST @ as
 * the user-info / host delimiter, so we extract each part explicitly.
 *
 * Format: mysql://user:password@host:port/database
 */
function parseMysqlUrl(rawUrl: string) {
  // Strip scheme
  const withoutScheme = rawUrl.replace(/^mysql:\/\//, "");

  // Split on the LAST @ to isolate userinfo from host
  const lastAt = withoutScheme.lastIndexOf("@");
  const userinfo = withoutScheme.slice(0, lastAt);
  const hostpart = withoutScheme.slice(lastAt + 1);

  // userinfo = "user:password" — split on FIRST colon only
  const colonIdx = userinfo.indexOf(":");
  const user = userinfo.slice(0, colonIdx);
  const password = userinfo.slice(colonIdx + 1);

  // hostpart = "host:port/database"
  const slashIdx = hostpart.indexOf("/");
  const hostport = hostpart.slice(0, slashIdx);
  const database = hostpart.slice(slashIdx + 1);
  const [host, portStr] = hostport.split(":");
  const port = portStr ? parseInt(portStr, 10) : 3306;

  return { host, port, user, password, database };
}

const fallbackConfig = {
  host: "localhost",
  port: 3306,
  user: "user",
  password: "pass",
  database: "db",
};
const connConfig = dbUrl ? parseMysqlUrl(dbUrl) : fallbackConfig;

const globalForDb = globalThis as unknown as { poolConnection: mysql.Pool };

// Create the connection pool using discrete parameters (safe for special chars in password)
export const poolConnection =
  globalForDb.poolConnection ||
  mysql.createPool({
    host: connConfig.host as string,
    port: connConfig.port,
    user: connConfig.user,
    password: connConfig.password,
    database: connConfig.database,
    waitForConnections: true,
    connectionLimit: process.env["NODE_ENV"] === "production" ? 10 : 2,
    maxIdle: process.env["NODE_ENV"] === "production" ? 10 : 1,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: process.env["NODE_ENV"] === "production",
    keepAliveInitialDelay: 0,
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForDb.poolConnection = poolConnection;
  
  // Try to gracefully close connections when Vite/Nitro restarts the worker
  const cleanup = async () => {
    try {
      await poolConnection.end();
    } catch (err) {}
  };
  
  process.on('beforeExit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

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
