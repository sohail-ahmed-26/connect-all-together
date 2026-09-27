import { db } from "../src/db";

async function applyMigration() {
  try {
    console.log("Altering target_profiles table...");
    await db.execute(
      `ALTER TABLE target_profiles MODIFY COLUMN target_location varchar(255) NULL;`,
    );
    console.log("Migration applied.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

applyMigration();
