import './src/db/index.ts';
import { db } from './src/db/index.ts';
import { leads } from './drizzle/schema.ts';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db.select({ count: sql`count(*)` }).from(leads);
  console.log(`There are ${result[0].count} leads saved in the database.`);
  process.exit(0);
}
main().catch(console.error);
