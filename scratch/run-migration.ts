import fs from 'fs';
import path from 'path';
import '../src/db/index.ts';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

async function main() {
  const sqlFile = fs.readFileSync(path.resolve('./scratch/migration_v1.sql'), 'utf8');
  const statements = sqlFile.split(';').map(s => s.trim()).filter(Boolean);
  
  for (const statement of statements) {
    console.log('Executing:', statement);
    await db.execute(sql.raw(statement));
  }
  console.log('Migration complete!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
