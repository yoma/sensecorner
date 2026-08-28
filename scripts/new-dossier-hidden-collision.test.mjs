/**
 * Guards create-by-name so Date/Family/Friend cannot silently reuse a
 * dossier that this app hides (other app_scope, family/friend tags, mirrors).
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
  senseNewDossierHiddenCollision,
  senseNewDossierHiddenCollisionMessage,
  senseIsBlockedNewDossierLabel
} = sandbox;

function visibleOnly(allowed) {
  const set = new Set(allowed);
  return function (name) {
    return set.has(name);
  };
}

const familyEmma = {
  EmmaSense: { meta: { app_scope: ['fs'], familie_rol: 'zus' } }
};
const dateLisa = {
  LisaSense: { meta: { app_scope: ['ds'] } }
};

assert.equal(
  senseNewDossierHiddenCollision('EmmaSense', familyEmma, visibleOnly([])),
  true,
  'DateSense create Emma must refuse hidden FamilySense EmmaSense'
);
assert.equal(
  senseNewDossierHiddenCollision('LisaSense', dateLisa, visibleOnly(['LisaSense'])),
  false,
  'reusing a visible same-app dossier is allowed'
);
assert.equal(
  senseNewDossierHiddenCollision('LisaSense', dateLisa, visibleOnly([])),
  true,
  'FamilySense create Lisa must refuse hidden DateSense LisaSense'
);
assert.equal(
  senseNewDossierHiddenCollision('NoraSense', dateLisa, visibleOnly(['LisaSense'])),
  false,
  'a name that does not exist yet is allowed'
);
assert.equal(
  senseNewDossierHiddenCollision('OWN Sense', { 'OWN Sense': { meta: {} } }, function () { return false; }),
  false,
  'OWN Sense is never treated as a hidden contact collision'
);
assert.equal(
  senseNewDossierHiddenCollision('DateSense', { DateSense: { meta: {} } }, visibleOnly([])),
  true,
  'system mirror names that exist in pdata are hidden collisions'
);

const msg = senseNewDossierHiddenCollisionMessage('EmmaSense');
assert.match(msg, /Emma/);
assert.match(msg, /andere Sense-app/);

assert.equal(senseIsBlockedNewDossierLabel('Date'), true);
assert.equal(senseIsBlockedNewDossierLabel('Emma'), false);

const htmlFiles = ['datesense.html', 'familysense.html', 'friendsense.html'];
const visibleFns = {
  'datesense.html': 'isDateSenseVisibleContact',
  'familysense.html': 'isFamilySenseVisibleContact',
  'friendsense.html': 'isFriendSenseVisibleContact'
};
for (const file of htmlFiles) {
  const html = readFileSync(join(root, file), 'utf8');
  const createCount = (html.match(/senseNewDossierHiddenCollision\(/g) || []).length;
  assert.ok(createCount >= 3, file + ' must guard createNewDossierFromPick, newSenseFromDrawer, and confirmNewPersonWA');
  assert.ok(html.includes('confirmNewPersonWA'), file + ' must keep WhatsApp new-person create');
  assert.ok(/function confirmNewPersonWA\([\s\S]*?senseNewDossierHiddenCollision\(/.test(html), file + ' must guard confirmNewPersonWA');
  assert.ok(html.includes(visibleFns[file]), file + ' must use its own visibility helper');
  if (file === 'familysense.html' || file === 'friendsense.html') {
    const promptCreate = html.match(/async function maakNieuwDossierEnOpslaan\([\s\S]*?\nasync function _doOpslaan/);
    assert.ok(promptCreate, file + ' must keep Vertel prompt create-by-name');
    assert.ok(promptCreate[0].includes('senseNewDossierHiddenCollision('), file + ' must guard maakNieuwDossierEnOpslaan before ensureP/_doOpslaan');
    assert.ok(createCount >= 4, file + ' must also guard maakNieuwDossierEnOpslaan');
  }
}

console.log('new-dossier-hidden-collision: ok');
