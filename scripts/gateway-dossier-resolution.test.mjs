import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/gateway-chat.js', import.meta.url), 'utf8');

const aliasStart = source.indexOf('function gwDossierAlias(');
const resolverStart = source.indexOf('function gwResolveDossierName(', aliasStart);
const resolverEnd = source.indexOf('function gwLandingLabel(', resolverStart);
assert.notEqual(aliasStart, -1, 'gwDossierAlias must exist');
assert.notEqual(resolverStart, -1, 'gwResolveDossierName must exist');
assert.notEqual(resolverEnd, -1, 'gwLandingLabel must follow dossier resolution');
const aliasAndResolver = source.slice(aliasStart, resolverEnd);
const resolver = source.slice(resolverStart, resolverEnd);

assert.match(
  aliasAndResolver,
  /global\.senseContactDossierDisplayName\(name\)/,
  'alias normalization must follow the shared dossier display convention'
);
assert.match(
  aliasAndResolver,
  /replace\(\/\[\\s_-\]\*sense\$\/i/,
  'legacy separator variants must retain a safe fallback alias'
);
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
