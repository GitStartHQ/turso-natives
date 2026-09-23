import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , stockPrefix, patchedPrefix, serverBinary] = process.argv;
if (!stockPrefix || !patchedPrefix || !serverBinary) {
  throw new Error('expected stock prefix, patched prefix, and local Turso 0.6.1 server binary');
}

async function connectFrom(prefix, options) {
  const modulePath = join(prefix, 'node_modules/@tursodatabase/sync/dist/promise.js');
  const { connect } = await import(pathToFileURL(modulePath).href);
  return connect(options);
}

const directory = mkdtempSync(join(tmpdir(), 'gitenv-sync-061-large-'));
let server;
let db;
let stage = 'start';
try {
  const portProbe = createServer();
  await new Promise((resolve, reject) =>
    portProbe.listen(0, '127.0.0.1', resolve).once('error', reject),
  );
  const address = portProbe.address();
  if (!address || typeof address === 'string') throw new Error('port probe failed');
  await new Promise((resolve) => portProbe.close(resolve));

  const url = `http://127.0.0.1:${address.port}`;
  server = spawn(serverBinary, [
    join(directory, 'remote.db'), '--sync-server', `127.0.0.1:${address.port}`,
  ], { stdio: 'ignore' });
  let ready = false;
  for (let retry = 0; retry < 100; retry++) {
    try {
      await fetch(url);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (!ready) throw new Error('local sync server did not start');
  const path = join(directory, 'replica.db');
  const options = { path, url, authToken: 'local-test-token' };

  stage = 'stock-create';
  db = await connectFrom(stockPrefix, options);
  await db.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY, payload BLOB NOT NULL)');
  await db.exec("INSERT INTO probe VALUES (1, x'01')");
  await db.push();
  await db.checkpoint();
  await db.close();
  db = undefined;

  stage = 'patched-large-push';
  let maxRequestBytes = 0;
  db = await connectFrom(patchedPrefix, {
    ...options,
    pushOperationsThreshold: 128,
    fetch: (input, init) => {
      if (init?.method === 'POST' && init.body instanceof Uint8Array) {
        maxRequestBytes = Math.max(maxRequestBytes, init.body.byteLength);
      }
      return fetch(input, init);
    },
  });
  const insert = await db.prepare('INSERT INTO probe VALUES (?, randomblob(4096))');
  await db.transaction(async () => {
    for (let id = 2; id <= 44359; id++) await insert.run(id);
  })();
  await db.push();
  await db.checkpoint();
  await db.close();
  db = undefined;

  stage = 'stock-reopen';
  db = await connectFrom(stockPrefix, options);
  const rows = await (await db.prepare(
    'SELECT count(*) AS rowCount, sum(length(payload)) AS payloadBytes FROM probe',
  )).all();
  const result = rows[0];
  if (maxRequestBytes <= 223_000_000 || result?.rowCount !== 44359 ||
      result?.payloadBytes !== 44358 * 4096 + 1) {
    throw new Error(`large sync mismatch: request=${maxRequestBytes}, rows=${result?.rowCount}, bytes=${result?.payloadBytes}`);
  }
  console.log(`stock 0.6.1 reopened patched file after ${maxRequestBytes}-byte push and 44,358-row transaction`);
} catch (error) {
  console.error(`${stage}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await db?.close().catch(() => undefined);
  server?.kill();
  rmSync(directory, { recursive: true, force: true });
}
