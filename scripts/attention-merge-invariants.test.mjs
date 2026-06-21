import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const selfsense = readFileSync(new URL('../selfsense.html', import.meta.url), 'utf8');
const ownsense = readFileSync(new URL('../ownsense.html', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `missing body for ${name}`);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

const selfMergeHelpers = [
  'parseAandachtspuntEvidence',
  'parseAandachtspuntMovement',
  'aandachtspuntIdStr',
  'aandachtspuntEvidenceMergeKey',
  'mergeAandachtspuntEvidence',
  'mergeAandachtspuntTipsAdvice',
  'mergeAandachtspuntMovement',
].map((name) => extractFunction(selfsense, name)).join('\n');

vm.runInNewContext(`${selfMergeHelpers}
  const keep = {
    id: 'keep',
    evidence: [{ checkin_id: 'c1', created_at: '2026-06-01T10:00:00Z' }],
    tips_advice: 'Blijf klein beginnen.',
    movement: [{ note: 'Vandaag aan gewerkt', at: '2026-06-03T10:00:00Z' }]
  };
  const remove = {
    id: 'remove',
    soft_name: 'Grenzen voelen in werk',
    evidence: [
      { checkin_id: 'c1', created_at: '2026-06-01T10:00:00Z' },
      { type: 'eigen', created_at: '2026-06-02T10:00:00Z' }
    ],
    tips_advice: 'Plan een concrete pauze.',
    movement: [{ note: 'Eerder geoefend', at: '2026-06-02T12:00:00Z' }]
  };

  const mergedEvidence = mergeAandachtspuntEvidence(keep.evidence, remove.evidence);
  assert.equal(mergedEvidence.length, 2, 'dedupes existing evidence and keeps source-only evidence');
  assert.ok(mergedEvidence.some((it) => it.type === 'eigen'), 'keeps user-created source evidence without an id');

  const mergedTips = mergeAandachtspuntTipsAdvice(keep.tips_advice, remove);
  assert.ok(mergedTips.includes(keep.tips_advice), 'keeps original advice');
  assert.ok(mergedTips.includes(remove.soft_name), 'preserves merged attention-point label');
  assert.ok(mergedTips.includes(remove.tips_advice), 'preserves merged advice');

  const mergedMovement = mergeAandachtspuntMovement(keep, remove, '2026-06-04T10:00:00Z');
  assert.equal(mergedMovement.length, 3, 'keeps both histories plus an audit note');
  const audit = mergedMovement.find((it) => it && it.type === 'merge');
  assert.ok(audit, 'adds merge audit movement');
  assert.equal(audit.merged_id, remove.id);
  assert.equal(audit.merged_name, remove.soft_name);
`, { assert });

assert.match(
  selfsense,
  /evidence:mergeAandachtspuntEvidence\(keepRow\.evidence,removeRow\.evidence\)/,
  'SelfSense confirmed merge must copy source evidence into kept row',
);
assert.match(
  selfsense,
  /tips_advice:mergeAandachtspuntTipsAdvice\(keepRow\.tips_advice,removeRow\)/,
  'SelfSense confirmed merge must preserve source advice/context',
);
assert.match(
  selfsense,
  /\.select\('id'\)\s*\.maybeSingle\(\)/,
  'SelfSense confirmed merge must verify the source row update matched a row',
);
assert.match(
  ownsense,
  /if\(!updated\)throw new Error\('Bestaand aandachtspunt niet bijgewerkt\.'\);/,
  'OWNSense proposal merge must fail closed if destination update fails',
);
assert.match(
  ownsense,
  /if\(!rejected\)throw new Error\('Voorstel niet bijgewerkt\.'\);/,
  'OWNSense proposal merge must fail closed if source rejection fails',
);

console.log('attention merge invariants passed');
