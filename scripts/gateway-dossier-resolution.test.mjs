import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/gateway-chat.js', import.meta.url), 'utf8');

const resolverStart = source.indexOf('function gwResolveDossierName(');
const resolverEnd = source.indexOf('function gwLandingLabel(', resolverStart);
assert.notEqual(resolverStart, -1, 'gwResolveDossierName must exist');
assert.notEqual(resolverEnd, -1, 'gwLandingLabel must follow dossier resolution');
const resolver = source.slice(resolverStart, resolverEnd);

assert.match(
  resolver,
  /gwDossierAlias\(c\) === hintAlias/,
  'dossier hints must match an exact normalized alias'
);
assert.doesNotMatch(
  resolver,
  /indexOf\(h\.toLowerCase\(\)\)/,
  'partial dossier hints must not prefix-match a different contact'
);
assert.doesNotMatch(
  source,
  /gwDetectUnknownPersonName\(gwRecentUserBlob\(\)\)/,
  'proposal targets must not be inferred from older turns'
);
assert.ok(
  (source.match(/gwDetectUnknownPersonName\(gwRecentUserBlob\(1\)\)/g) || []).length >= 2,
  'proposal fallbacks must use only the current user turn'
);

console.log('Gateway dossier resolution invariants passed.');
