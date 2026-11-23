import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const fixtureDir = 'contracts/fixtures/cloud-sync/v1';
const sourcePaths = [
  'contracts/cloud-sync.v1.openapi.json',
  'contracts/cloud-sync.v1.schema.json',
  `${fixtureDir}/account-delete-request.json`,
  `${fixtureDir}/bootstrap-response.json`,
  `${fixtureDir}/conflict-response.json`,
  `${fixtureDir}/cursor-expired-response.json`,
  `${fixtureDir}/device-revoke-request.json`,
  `${fixtureDir}/export-response.json`,
  `${fixtureDir}/sync-request.json`,
  `${fixtureDir}/sync-response.json`,
];
const outputPath = path.join(root, 'contracts/android/anilife-cloud-sync-v1.bundle.json');

async function build() {
  const files = [];
  for (const relativePath of sourcePaths) {
    const text = await readFile(path.join(root, relativePath), 'utf8');
    files.push({
      path: relativePath.replaceAll('\\', '/'),
      sha256: createHash('sha256').update(text).digest('hex'),
      content: JSON.parse(text),
    });
  }
  return `${JSON.stringify({ contract: 'anilife.cloud.sync', protocolVersion: 1, files }, null, 2)}\n`;
}

const output = await build();
if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8').catch(() => '');
  if (current !== output) {
    console.error('Cloud Sync Android bundle is stale. Run npm run contracts:sync.');
    process.exitCode = 1;
  }
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
}
