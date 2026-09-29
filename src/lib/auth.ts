import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import * as schema from "../../drizzle/schema.js";

const BETTER_AUTH_SECRET = process.env["BETTER_AUTH_SECRET"] || "fallback-secret-for-dev-only";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "mysql",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: BETTER_AUTH_SECRET,
  baseURL: process.env["VITE_APP_URL"] || "http://localhost:8080",
  trustedOrigins: ["https://*.lovable.cloud", "https://*.lovable.dev", "http://localhost:8080", "http://localhost:8081"],
});
