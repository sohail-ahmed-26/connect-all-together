import fs from "fs";
import path from "path";

// Load .env
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

async function main() {
  console.log("Checking Supabase for existing users...");
  try {
    const { supabaseAdmin } = await import("../src/integrations/supabase/client.server.js");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      console.error("Error fetching users from Supabase:", error.message);
      process.exit(1);
    }

    console.log(`Total users in Supabase: ${data.users.length}`);
    if (data.users.length > 0) {
      console.log("Users exist. Migration will be required if they are active.");
    } else {
      console.log("No users found. Safe to proceed without user data migration.");
    }
  } catch (error) {
    console.error("Failed to connect or fetch from Supabase:", error);
  }
}

main();
