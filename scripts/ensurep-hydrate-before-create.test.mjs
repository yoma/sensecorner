/**
 * ensureP must not upsert a seed row over an other-app dossier when
 * S.pdata is still empty (FamilySense first open / fast-paint cache miss).
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js/sense-common.js'), 'utf8');
const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
runInContext(src, createContext(sandbox));

const {
  senseProfileCellFromRow,
  senseHydrateProfileIfMissing,
  senseIsProfileUniqueConflict,
  senseShouldStampContactScope,
  senseNewDossierHiddenCollision
} = sandbox;

function visibleOnly(allowed) {
  const set = new Set(allowed);
  return function (name) { return set.has(name); };
}

const cell = senseProfileCellFromRow({
  name: 'LisaSense',
  props: { meta: { app_scope: ['ds'] }, categories: { notes: { a0: 'date' } } },
  bericht_count: 7,
  summary: 'dating notes',
  last_active: '2026-08-28T10:00:00Z'
});
assert.equal(cell.count, 7);
assert.equal(cell.summary, 'dating notes');
assert.deepEqual(cell.meta.app_scope, ['ds']);
assert.equal(cell.categories.notes.a0, 'date');

assert.equal(senseIsProfileUniqueConflict({ code: '23505' }), true);
assert.equal(senseIsProfileUniqueConflict({ message: 'duplicate key value violates unique constraint' }), true);
assert.equal(senseIsProfileUniqueConflict({ message: 'timeout' }), false);

const dateLisa = { LisaSense: { meta: { app_scope: ['ds'] } } };
assert.equal(senseShouldStampContactScope('LisaSense', dateLisa, visibleOnly([])), false);
assert.equal(senseShouldStampContactScope('LisaSense', dateLisa, visibleOnly(['LisaSense'])), true);
assert.equal(senseShouldStampContactScope('NoraSense', dateLisa, visibleOnly(['LisaSense'])), true);
assert.equal(senseShouldStampContactScope('OWN Sense', dateLisa, visibleOnly([])), false);

const rows = {
  LisaSense: {
    name: 'LisaSense',
    props: { meta: { app_scope: ['ds'] } },
    bericht_count: 4,
    summary: '',
    last_active: null
  }
};
const fakeSb = {
  from: function () {
    return {
      select: function () { return this; },
      eq: function (col, val) {
        if (col === 'name') this._name = val;
        return this;
      },
      maybeSingle: async function () {
        const row = rows[this._name];
        return { data: row || null, error: null };
      }
    };
  }
};

const emptyState = { pdata: {}, profiles: ['OWN Sense'] };
assert.equal(
  await senseHydrateProfileIfMissing(fakeSb, 'user-1', 'LisaSense', emptyState),
  true
);
assert.equal(emptyState.pdata.LisaSense.meta.app_scope[0], 'ds');
assert.equal(emptyState.pdata.LisaSense.count, 4);
assert.ok(emptyState.profiles.includes('LisaSense'));
assert.equal(
  senseNewDossierHiddenCollision('LisaSense', emptyState.pdata, visibleOnly([])),
  true,
  'after hydrate, FamilySense must see DateSense Lisa as a hidden collision'
);

assert.equal(
  await senseHydrateProfileIfMissing(fakeSb, 'user-1', 'LisaSense', emptyState),
  false,
  'already in pdata is a no-op'
);
assert.equal(
  await senseHydrateProfileIfMissing(fakeSb, 'user-1', 'GhostSense', { pdata: {}, profiles: [] }),
  false
);

for (const file of ['datesense.html', 'familysense.html', 'friendsense.html']) {
  const html = readFileSync(join(root, file), 'utf8');
  const start = html.indexOf('async function ensureP(name)');
  assert.ok(start >= 0, file + ' missing ensureP');
  const brace = html.indexOf('{', start);
  let depth = 0;
  let end = brace;
  for (; end < html.length; end++) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const ensure = html.slice(start, end + 1);
  assert.ok(ensure.includes('senseHydrateProfileIfMissing'), file + ' ensureP must look up DB when pdata is empty');
  assert.ok(ensure.includes(".insert("), file + ' ensureP must insert, not upsert a seed over an existing row');
  assert.equal(ensure.includes("onConflict:'user_id,name'"), false, file + ' ensureP create must not upsert on name');
  assert.ok(ensure.includes('senseIsProfileUniqueConflict'), file + ' ensureP must recover a unique conflict via hydrate');
  assert.ok(html.includes('senseShouldStampContactScope'), file + ' saveP must not stamp scope on a hidden other-app row');
}

console.log('ensurep-hydrate-before-create: ok');
