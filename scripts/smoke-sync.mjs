import { connect } from '@tursodatabase/sync';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'gitenv-turso-native-smoke-'));
let db;
try {
  db = await connect({ path: join(directory, 'smoke.db') });
  await db.exec('CREATE TABLE smoke (value TEXT NOT NULL)');
  await db.exec("INSERT INTO smoke (value) VALUES ('ok')");
  const rows = await (await db.prepare('SELECT value FROM smoke')).all();
  if (rows.length !== 1 || rows[0]?.value !== 'ok') throw new Error('native local query failed');
  console.log('patched Turso Sync 0.6.1 native package loaded and queried');
} finally {
  await db?.close();
  rmSync(directory, { recursive: true, force: true });
}
