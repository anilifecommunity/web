import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Schema = Record<string, unknown>;

const root = process.cwd();
const readJson = (relativePath: string): Json =>
  JSON.parse(readFileSync(path.join(root, relativePath), 'utf8')) as Json;
const schema = readJson('contracts/cloud-sync.v1.schema.json') as Schema;

function referenced(ref: string): Schema {
  assert.match(ref, /^#\//);
  return ref.slice(2).split('/').reduce<unknown>((value, key) => {
    assert(value && typeof value === 'object' && key in value);
    return (value as Record<string, unknown>)[key];
  }, schema) as Schema;
}

function valid(value: unknown, rule: Schema): boolean {
  if (typeof rule.$ref === 'string') return valid(value, referenced(rule.$ref));
  if ('const' in rule && !Object.is(value, rule.const)) return false;
  if (Array.isArray(rule.enum) && !rule.enum.some((entry) => Object.is(entry, value))) return false;
  if (Array.isArray(rule.oneOf) && rule.oneOf.filter((entry) => valid(value, entry as Schema)).length !== 1) return false;
  if (Array.isArray(rule.allOf) && rule.allOf.some((entry) => !valid(value, entry as Schema))) return false;
  if (rule.not && valid(value, rule.not as Schema)) return false;

  const allowedTypes = Array.isArray(rule.type) ? rule.type : rule.type ? [rule.type] : [];
  if (allowedTypes.length > 0) {
    const actual = value === null
      ? 'null'
      : Array.isArray(value)
        ? 'array'
        : Number.isInteger(value)
          ? 'integer'
          : typeof value;
    if (!allowedTypes.includes(actual) && !(actual === 'integer' && allowedTypes.includes('number'))) return false;
  }

  if (typeof value === 'string') {
    if (typeof rule.minLength === 'number' && value.length < rule.minLength) return false;
    if (typeof rule.maxLength === 'number' && value.length > rule.maxLength) return false;
    if (typeof rule.pattern === 'string' && !new RegExp(rule.pattern).test(value)) return false;
    if (rule.format === 'date-time' && Number.isNaN(Date.parse(value))) return false;
  }
  if (typeof value === 'number') {
    if (typeof rule.minimum === 'number' && value < rule.minimum) return false;
    if (typeof rule.maximum === 'number' && value > rule.maximum) return false;
    if (typeof rule.exclusiveMinimum === 'number' && value <= rule.exclusiveMinimum) return false;
  }
  if (Array.isArray(value)) {
    if (typeof rule.minItems === 'number' && value.length < rule.minItems) return false;
    if (typeof rule.maxItems === 'number' && value.length > rule.maxItems) return false;
    if (rule.uniqueItems === true && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) return false;
    if (rule.items && value.some((entry) => !valid(entry, rule.items as Schema))) return false;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties = (rule.properties ?? {}) as Record<string, Schema>;
    if (Array.isArray(rule.required) && rule.required.some((key) => !(String(key) in record))) return false;
    if (rule.additionalProperties === false && Object.keys(record).some((key) => !(key in properties))) return false;
    if (Object.entries(properties).some(([key, child]) => key in record && !valid(record[key], child))) return false;
  }
  return true;
}

const fixtures = new Map([
  ['account-delete-request.json', 'AccountDeleteRequest'],
  ['bootstrap-response.json', 'BootstrapResponse'],
  ['conflict-response.json', 'ConflictResponse'],
  ['cursor-expired-response.json', 'CursorExpiredResponse'],
  ['device-revoke-request.json', 'DeviceRevokeRequest'],
  ['export-response.json', 'ExportResponse'],
  ['sync-request.json', 'SyncRequest'],
  ['sync-response.json', 'SyncResponse'],
]);

test('all Cloud Sync fixtures match their v1 schema definitions', () => {
  for (const [file, definition] of fixtures) {
    const value = readJson(`contracts/fixtures/cloud-sync/v1/${file}`);
    assert.equal(valid(value, referenced(`#/$defs/${definition}`)), true, file);
  }
});

test('requests reject unknown, secret and delete-value fields', () => {
  const request = readJson('contracts/fixtures/cloud-sync/v1/sync-request.json') as Record<string, Json>;
  const requestRule = referenced('#/$defs/SyncRequest');
  assert.equal(valid({ ...request, accountId: 'foreign' }, requestRule), false);

  const secret = structuredClone(request);
  ((secret.ops as Json[])[0] as Record<string, Json>).value = { oauthToken: 'secret' };
  assert.equal(valid(secret, requestRule), false);

  const wrongType = structuredClone(request);
  ((wrongType.ops as Json[])[0] as Record<string, Json>).entityType = 'profile';
  assert.equal(valid(wrongType, requestRule), false);

  const deletion = structuredClone(request);
  const operation = (deletion.ops as Json[])[0] as Record<string, Json>;
  operation.action = 'delete';
  assert.equal(valid(deletion, requestRule), false);
  delete operation.value;
  assert.equal(valid(deletion, requestRule), true);
});

test('media identity is typed and agrees with the released Media Index key', () => {
  const request = readJson('contracts/fixtures/cloud-sync/v1/sync-request.json') as Record<string, Json>;
  const operation = (request.ops as Json[])[0] as Record<string, Json>;
  const value = operation.value as Record<string, Json>;
  const media = value.media as Record<string, Json>;
  const aliases = media.aliases as Record<string, Json>;
  assert.equal(media.mediaKey, `al-${aliases.anilist}`);
  assert.match(String(operation.entityKey), new RegExp(`^${media.kind}:${media.mediaKey}`));
});

test('OpenAPI exposes only the bounded v1 account surface', () => {
  const openapi = readJson('contracts/cloud-sync.v1.openapi.json') as Record<string, Json>;
  const paths = openapi.paths as Record<string, Json>;
  assert.deepEqual(Object.keys(paths).sort(), [
    '/api/v1/account',
    '/api/v1/bootstrap',
    '/api/v1/devices/revoke',
    '/api/v1/export',
    '/api/v1/sync',
  ]);
  assert.equal(JSON.stringify(openapi).includes('accountId'), false);
  assert.equal(JSON.stringify((paths['/api/v1/sync'] as Record<string, Json>).post).includes('csrfHeader'), true);

  const resolvePointer = (document: Json, pointer: string): unknown =>
    pointer.slice(2).split('/').reduce<unknown>((value, key) => {
      assert(value && typeof value === 'object' && key in value, pointer);
      return (value as Record<string, unknown>)[key];
    }, document);
  const visit = (value: Json): void => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && typeof value.$ref === 'string') {
      if (value.$ref.startsWith('#/')) resolvePointer(openapi, value.$ref);
      if (value.$ref.startsWith('./cloud-sync.v1.schema.json#/')) {
        resolvePointer(schema as Json, value.$ref.slice('./cloud-sync.v1.schema.json'.length));
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(openapi);
});

test('the Android handoff bundle is deterministic and current', () => {
  execFileSync(process.execPath, ['scripts/build_cloud_sync_contract.mjs', '--check'], {
    cwd: root,
    stdio: 'pipe',
  });
  const bundle = readJson('contracts/android/anilife-cloud-sync-v1.bundle.json') as Record<string, Json>;
  assert.equal(bundle.contract, 'anilife.cloud.sync');
  assert.equal(bundle.protocolVersion, 1);
  assert.equal((bundle.files as Json[]).length, 10);
});
