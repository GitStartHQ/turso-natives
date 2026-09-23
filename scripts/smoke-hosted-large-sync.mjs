import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , stockPrefix, patchedPrefix] = process.argv;
const url = process.env.TURSO_HOSTED_QA_URL;
const authToken = process.env.TURSO_HOSTED_QA_TOKEN;
const rowCount = Number(process.env.TURSO_HOSTED_QA_ROWS ?? 44358);
if (!stockPrefix || !patchedPrefix || !url || !authToken ||
    !Number.isInteger(rowCount) || rowCount < 1) {
  throw new Error('expected stock/patched prefixes, TURSO_HOSTED_QA_URL, TURSO_HOSTED_QA_TOKEN, and a positive row count');
}

async function connectFrom(prefix, options) {
  const modulePath = join(prefix, 'node_modules/@tursodatabase/sync/dist/promise.js');
  const { connect } = await import(pathToFileURL(modulePath).href);
  return connect(options);
}

const directory = mkdtempSync(join(tmpdir(), 'gitenv-hosted-sync-061-'));
const path = join(directory, 'replica.db');
const options = { path, url, authToken };
let db;
let stage = 'stock-create';
let maxRequestBytes = 0;
const responseStatuses = [];
try {
  console.log('stock-create');
  db = await connectFrom(stockPrefix, options);
  await db.exec('CREATE TABLE IF NOT EXISTS probe (id INTEGER PRIMARY KEY, payload BLOB NOT NULL)');
  await db.exec('DELETE FROM probe');
  await db.exec("INSERT INTO probe VALUES (1, x'01')");
  await db.push();
  await db.checkpoint();
  await db.close();
  db = undefined;

  stage = 'patched-large-push';
  console.log(`patched-large-push: ${rowCount} rows`);
  db = await connectFrom(patchedPrefix, {
    ...options,
    pushOperationsThreshold: 128,
    fetch: async (input, init) => {
      const requestBytes = init?.body instanceof Uint8Array ? init.body.byteLength : 0;
      if (init?.method === 'POST') maxRequestBytes = Math.max(maxRequestBytes, requestBytes);
      const response = await fetch(input, init);
      if (init?.method === 'POST') {
        responseStatuses.push({ requestBytes, status: response.status });
        console.log(`push response: ${response.status}, ${requestBytes} bytes`);
      }
      return response;
    },
  });
  const insert = await db.prepare('INSERT INTO probe VALUES (?, randomblob(4096))');
  await db.transaction(async () => {
    for (let id = 2; id <= rowCount + 1; id++) await insert.run(id);
  })();
  console.log('local transaction committed; pushing to hosted database');
  await db.push();
  await db.checkpoint();
  await db.close();
  db = undefined;

  stage = 'stock-reopen';
  console.log('stock-reopen');
  db = await connectFrom(stockPrefix, options);
  const rows = await (await db.prepare(
    'SELECT count(*) AS rowCount, sum(length(payload)) AS payloadBytes FROM probe',
  )).all();
  const result = rows[0];
  if (rowCount === 44358 && maxRequestBytes <= 223_000_000) {
    throw new Error(`large sync request was too small: ${maxRequestBytes} bytes`);
  }
  if (result?.rowCount !== rowCount + 1 ||
      result?.payloadBytes !== rowCount * 4096 + 1) {
    throw new Error(`row mismatch: rows=${result?.rowCount}, bytes=${result?.payloadBytes}`);
  }
  console.log(JSON.stringify({ stage: 'passed', maxRequestBytes, responseStatuses,
    rows: result.rowCount, payloadBytes: result.payloadBytes }));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ stage, maxRequestBytes, responseStatuses,
    error: message.replaceAll(authToken, '[REDACTED]') }));
  process.exitCode = 1;
} finally {
  await db?.close().catch(() => undefined);
  rmSync(directory, { recursive: true, force: true });
}
