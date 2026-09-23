/**
 * Locks WhatsApp dossier matching: a name must be its own word.
 * «januari» must not select JanSense; a later «ja» would otherwise
 * mirror the whole WhatsApp thread into that contact dossier.
 */
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const src = readFileSync(new URL('../edge-functions/whatsapp-webhook.edge.ts', import.meta.url), 'utf8');
const start = src.indexOf('function tokenizeWordsForProfileMatch');
const end = src.indexOf('/** Eén contactdossier uit bericht');
if (start < 0 || end < start) throw new Error('match helpers not found in whatsapp-webhook.edge.ts');
const chunk = stripTypeScriptTypes(src.slice(start, end));
const sandbox = { norm(v) { return String(v || '').trim(); } };
// eslint-disable-next-line no-new-func
const fn = new Function('norm', `${chunk}\nreturn { matchWhatsappDossierName };`);
const { matchWhatsappDossierName } = fn(sandbox.norm);

const names = ['JanSense', 'EvaSense', 'EmmaSense', 'MarcSense', 'PascaleSense', 'OWN Sense'];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(matchWhatsappDossierName(names, 'In januari wil ik minder werken.') === null, 'januari must not match JanSense');
assert(matchWhatsappDossierName(names, 'Ik had een evaluatie op het werk.') === null, 'evaluatie must not match EvaSense');
assert(matchWhatsappDossierName(names, 'Dit is een dilemma.') === null, 'dilemma must not match EmmaSense');
assert(matchWhatsappDossierName(names, 'In maart ga ik verhuizen.') === null, 'maart must not match MarcSense');
assert(matchWhatsappDossierName(names, 'Ik sprak met Jan over het weekend.') === 'JanSense', 'whole word Jan matches');
assert(matchWhatsappDossierName(names, 'Zet dit onder JanSense.') === 'JanSense', 'full dossier name matches');
assert(matchWhatsappDossierName(names, 'pascal komt morgen langs') === 'PascaleSense', 'pascal still matches PascaleSense');
assert(matchWhatsappDossierName(names, 'Pascale en Jan komen allebei.') === null, 'two names stay ambiguous');
assert(matchWhatsappDossierName(['OWN Sense'], 'januari') === null, 'OWN Sense is never a contact hit');

console.log('whatsapp-dossier-match: ok');
