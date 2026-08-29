/**
 * FriendSense boot/ensureP must not convert FamilySense `fs` dossiers to `fr`.
 * Opening FriendSense after creating a family contact (often before a role is
 * filled) used to hide that contact from FamilySense.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'friendsense.html'), 'utf8');

function extractFunction(src, name) {
  var start = src.indexOf('async function ' + name + '(');
  if (start < 0) start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  var i = src.indexOf('{', start);
  var depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const sandbox = {
  S: { pdata: {} },
  getFriendRol: function () { return ''; },
  getFriendRelatie: function () { return ''; },
  normalizeAppScopeList: function (meta) {
    var raw = (meta || {}).app_scope;
    var list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(/[,\s]+/) : []);
    return list.map(function (v) { return String(v || '').toLowerCase().trim(); }).filter(Boolean);
  }
};
sandbox.window = sandbox;
const ctx = createContext(sandbox);
runInContext(extractFunction(html, 'isFriendSenseTaggedMeta'), ctx);
runInContext(extractFunction(html, 'shouldMigrateFsOnlyToFriendScope'), ctx);
runInContext(extractFunction(html, 'isFriendSenseVisibleContact'), ctx);

sandbox.S.pdata = {
  MamaSense: { meta: { app_scope: ['fs'] } },
  PapaSense: { meta: { app_scope: ['fs'], familie_rol: 'vader' } },
  LisaSense: { meta: { app_scope: ['ds'] } },
  EmmaSense: { meta: { app_scope: ['fr'] } },
  MixSense: { meta: { app_scope: ['fr', 'ds'] } }
};

assert.equal(
  sandbox.shouldMigrateFsOnlyToFriendScope({ app_scope: ['fs'] }),
  false,
  'fs-only without a friend role is FamilySense, not a FriendSense leftover'
);
assert.equal(sandbox.isFriendSenseVisibleContact('MamaSense'), false);
assert.equal(
  sandbox.isFriendSenseVisibleContact('PapaSense'),
  false,
  'a filled family role still must not appear in FriendSense without fr'
);
assert.equal(sandbox.isFriendSenseVisibleContact('LisaSense'), false);
assert.equal(sandbox.isFriendSenseVisibleContact('EmmaSense'), true);
assert.equal(sandbox.isFriendSenseVisibleContact('MixSense'), true);
assert.equal(sandbox.isFriendSenseVisibleContact('OWN Sense'), false);

const vis = extractFunction(html, 'isFriendSenseVisibleContact');
assert.equal(vis.includes('shouldMigrateFsOnlyToFriendScope'), false);

const norm = extractFunction(html, 'normalizeLegacyFriendScopes');
assert.equal(norm.includes('shouldMigrateFsOnlyToFriendScope'), false);
assert.ok(norm.includes('isFriendSenseTaggedMeta'));

const ensure = extractFunction(html, 'ensureP');
assert.ok(ensure.includes('isFriendSenseTaggedMeta'));
assert.ok(ensure.includes('senseNewDossierHiddenCollision'));
assert.match(ensure, /filter\(function\(s\)\{return s!=='fs'&&s!=='ds';\}\)/);

console.log('friendsense-fs-scope-steal: ok');
