/**
 * Vertel "Altijd opslaan bij" must stay inside the current app.
 * Shared ds_force_dossier + S.profiles.includes let DateSense
 * "Praat over Lisa" auto-save FamilySense Vertel into LisaSense.
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
  senseForcedDossierStorageKey,
  senseForcedDossierAllowed,
  senseReadForcedDossier,
  senseWriteForcedDossier,
  senseNewDossierHiddenCollision
} = sandbox;

function memStore(init) {
  const data = Object.assign({}, init || {});
  return {
    data,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; }
  };
}

function visibleOnly(allowed) {
  const set = new Set(allowed);
  return function (name) { return set.has(name); };
}

assert.equal(senseForcedDossierStorageKey('familysense'), 'familysense_force_dossier');
assert.equal(senseForcedDossierAllowed('LisaSense', visibleOnly(['LisaSense'])), true);
assert.equal(senseForcedDossierAllowed('LisaSense', visibleOnly(['MamaSense'])), false);
assert.equal(senseForcedDossierAllowed('OWN Sense', visibleOnly(['OWN Sense'])), false);
assert.equal(senseForcedDossierAllowed('', visibleOnly(['LisaSense'])), false);

const store = memStore({ ds_force_dossier: 'LisaSense' });
assert.equal(
  senseReadForcedDossier('familysense', visibleOnly(['MamaSense']), store),
  '',
  'FamilySense must ignore a DateSense forced dossier in the shared legacy key'
);
assert.equal(store.data.ds_force_dossier, 'LisaSense', 'legacy key must stay for the owning app');
assert.equal(store.data.familysense_force_dossier, undefined);

assert.equal(
  senseReadForcedDossier('datesense', visibleOnly(['LisaSense']), store),
  'LisaSense',
  'DateSense may inherit its own legacy force key'
);
assert.equal(store.data.datesense_force_dossier, 'LisaSense');

senseWriteForcedDossier('familysense', 'MamaSense', store);
assert.equal(senseReadForcedDossier('familysense', visibleOnly(['MamaSense']), store), 'MamaSense');
assert.equal(
  senseReadForcedDossier('datesense', visibleOnly(['LisaSense']), store),
  'LisaSense',
  'per-app keys must not overwrite each other'
);

senseWriteForcedDossier('selfsense', '', store);
assert.equal(
  senseReadForcedDossier('selfsense', visibleOnly([]), store),
  '',
  'SelfSense has no contact dossiers to force'
);
assert.equal(store.data.ds_force_dossier, 'LisaSense', 'SelfSense must not wipe another app force key');

const dateLisa = { LisaSense: { meta: { app_scope: ['ds'] } } };
assert.equal(
  senseNewDossierHiddenCollision('LisaSense', dateLisa, visibleOnly([])),
  true,
  'FamilySense ensureP must treat hidden DateSense Lisa as a collision'
);

const htmlFiles = {
  'datesense.html': 'isDateSenseVisibleContact',
  'familysense.html': 'isFamilySenseVisibleContact',
  'friendsense.html': 'isFriendSenseVisibleContact',
  'selfsense.html': 'isSelfSenseVisibleContact'
};
for (const [file, vis] of Object.entries(htmlFiles)) {
  const html = readFileSync(join(root, file), 'utf8');
  assert.ok(html.includes('senseReadForcedDossier(VERTEL_APP_SLUG'), file + ' must read a per-app force key');
  assert.ok(html.includes(vis), file + ' must gate force on its own visibility helper');
  assert.equal((html.match(/localStorage\.getItem\('ds_force_dossier'\)/g) || []).length, 0, file + ' must not read the shared force key directly');
  assert.equal((html.match(/localStorage\.setItem\('ds_force_dossier'/g) || []).length, 0, file + ' must not write the shared force key');
  assert.equal((html.match(/localStorage\.removeItem\('ds_force_dossier'\)/g) || []).length, 0, file + ' must not delete the shared force key');
}

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
  assert.ok(ensure.includes('senseNewDossierHiddenCollision'), file + ' ensureP must refuse hidden other-app rows');
  assert.ok(ensure.includes('senseHydrateProfileIfMissing'), file + ' ensureP must hydrate from DB when pdata is empty');
}

const familyHtml = readFileSync(join(root, 'familysense.html'), 'utf8');
assert.ok(familyHtml.includes('var contacts=getFamilySenseContactNames();'));
assert.ok(/function settingsAction\([\s\S]*?await delP\(contacts\[i\]\)/.test(familyHtml));
assert.equal((familyHtml.match(/deleteSense\(/g) || []).length, 0);

const friendHtml = readFileSync(join(root, 'friendsense.html'), 'utf8');
assert.ok(friendHtml.includes('var contacts=getFriendSenseContactNames();'));
assert.ok(/function settingsAction\([\s\S]*?await delP\(contacts\[i\]\)/.test(friendHtml));

console.log('forced-dossier-cross-app: ok');
