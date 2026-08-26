/**
 * WhatsApp import to an existing contact must keep the button index until
 * click, and must not treat an empty detected name as a match for every dossier.
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
  senseFillWhatsAppContactIndex,
  senseMatchWhatsAppImportDossier,
  senseMatchWhatsAppImportDossierInText,
  senseContactDossierDisplayName
} = sandbox;

function dn(name) {
  return senseContactDossierDisplayName(name);
}

const index = senseFillWhatsAppContactIndex(['LisaSense', 'EmmaSense']);
assert.equal(index.length, 2);
assert.equal(index[0], 'LisaSense', 'click handler must still see the first contact');
assert.equal(index[1], 'EmmaSense');
assert.equal(senseFillWhatsAppContactIndex([]).length, 0);
assert.equal(senseFillWhatsAppContactIndex(null).length, 0);

assert.equal(
  senseMatchWhatsAppImportDossier('', ['LisaSense', 'EmmaSense'], dn),
  '',
  'empty suggestion must not mark the last profile as herkend'
);
assert.equal(
  senseMatchWhatsAppImportDossier('   ', ['LisaSense'], dn),
  '',
  'whitespace-only suggestion is not a match'
);
assert.equal(
  senseMatchWhatsAppImportDossier('Lisa', ['LisaSense', 'EmmaSense'], dn),
  'LisaSense'
);
assert.equal(
  senseMatchWhatsAppImportDossier('Emma', ['LisaSense'], dn),
  '',
  'names not in the visible list must not match'
);
assert.equal(
  senseMatchWhatsAppImportDossierInText('gisteren met Lisa afgesproken', ['LisaSense', 'EmmaSense'], dn),
  'LisaSense'
);
assert.equal(
  senseMatchWhatsAppImportDossierInText('geen namen hier', ['LisaSense'], dn),
  ''
);

const htmlFiles = ['datesense.html', 'familysense.html', 'friendsense.html', 'selfsense.html'];
for (const file of htmlFiles) {
  const html = readFileSync(join(root, file), 'utf8');
  const dialog = html.match(/function showWhatsAppDialog\([\s\S]*?\nfunction askNewPersonWA/);
  assert.ok(dialog, file + ' must keep showWhatsAppDialog');
  assert.ok(
    dialog[0].includes('senseFillWhatsAppContactIndex'),
    file + ' must fill _waContacts via senseFillWhatsAppContactIndex'
  );
  assert.ok(
    !/window\._waContacts\s*=\s*\[\s*\]/.test(dialog[0]),
    file + ' must not wipe _waContacts after building import buttons'
  );
  assert.ok(
    /function startWhatsAppImport\([\s\S]*?if\s*\(!dosName\)/.test(html),
    file + ' must refuse WhatsApp import without a dossier name'
  );
  assert.ok(
    html.includes('senseMatchWhatsAppImportDossier('),
    file + ' must match WhatsApp names via the shared helper'
  );
}

console.log('whatsapp-import-contact-index: ok');
