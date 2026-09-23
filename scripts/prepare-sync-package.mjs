import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , target, binaryPath, outputDir] = process.argv;
const platforms = {
  'x86_64-unknown-linux-gnu': { suffix: 'linux-x64-gnu', os: 'linux', cpu: 'x64', libc: 'glibc' },
  'aarch64-unknown-linux-gnu': { suffix: 'linux-arm64-gnu', os: 'linux', cpu: 'arm64', libc: 'glibc' },
  'x86_64-pc-windows-msvc': { suffix: 'win32-x64-msvc', os: 'win32', cpu: 'x64' },
  'aarch64-apple-darwin': { suffix: 'darwin-arm64', os: 'darwin', cpu: 'arm64' },
  'x86_64-apple-darwin': { suffix: 'darwin-x64', os: 'darwin', cpu: 'x64' },
};

const platform = platforms[target];
if (!platform || !binaryPath || !outputDir) {
  throw new Error('expected a supported target, native binary path, and output directory');
}

const binaryName = `sync.${platform.suffix}.node`;
mkdirSync(outputDir, { recursive: true });
copyFileSync(binaryPath, join(outputDir, binaryName));
const manifest = {
  name: `@tursodatabase/sync-${platform.suffix}`,
  version: '0.6.1',
  cpu: [platform.cpu],
  os: [platform.os],
  ...(platform.libc ? { libc: [platform.libc] } : {}),
  main: binaryName,
  files: [binaryName],
  license: 'MIT',
  repository: { type: 'git', url: 'https://github.com/tursodatabase/turso' },
};
writeFileSync(join(outputDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
