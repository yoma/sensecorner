import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const edgeDir = join(here, '..', 'edge-functions');

const files = {
  sensei: readFileSync(join(edgeDir, 'sensei-chat.edge.ts'), 'utf8'),
  whatsapp: readFileSync(join(edgeDir, 'whatsapp-webhook.edge.ts'), 'utf8'),
  selfAandacht: readFileSync(join(edgeDir, 'selfsense-aandachtspunten-detect.edge.ts'), 'utf8'),
  crossApp: readFileSync(join(edgeDir, 'cross-app-pattern-detect.edge.ts'), 'utf8'),
};

function assertBefore(source, before, after, label) {
  const beforeAt = source.indexOf(before);
  const afterAt = source.indexOf(after);
  assert.notEqual(beforeAt, -1, `${label}: missing ${before}`);
  assert.notEqual(afterAt, -1, `${label}: missing ${after}`);
  assert.ok(beforeAt < afterAt, `${label}: expected ${before} before ${after}`);
}

assertBefore(
  files.sensei,
  'await reserveAiRateLog(userId, purpose)',
  'fetch("https://api.anthropic.com/v1/messages"',
  'sensei-chat reserves quota before Claude',
);
assert.match(
  files.sensei,
  /if \(counted\.count == null\)[\s\S]*AI_RATE_LIMIT_UNAVAILABLE/,
  'sensei-chat must fail closed when quota count is unavailable',
);
assert.doesNotMatch(
  files.sensei,
  /then\(\(\{ error: logError \}\)/,
  'sensei-chat must not log AI usage only after Claude succeeds',
);

assertBefore(
  files.whatsapp,
  'if (!ownUser?.user_id)',
  'let reply = await callClaude',
  'WhatsApp blocks unlinked numbers before Claude',
);
assertBefore(
  files.whatsapp,
  'mayUseWhatsappAi(linkedUserId)',
  'let reply = await callClaude',
  'WhatsApp checks AI access before Claude',
);
assertBefore(
  files.whatsapp,
  'await reserveWhatsappRate(linkedUserId)',
  'let reply = await callClaude',
  'WhatsApp reserves quota before Claude',
);
assert.doesNotMatch(
  files.whatsapp,
  /ai_rate_log"\)\.insert\(\{ user_id: ownUser\.user_id \}\)\.then/,
  'WhatsApp must not log AI usage only after Claude succeeds',
);

for (const [label, source, aiCall] of [
  ['self attention detector', files.selfAandacht, 'fetch("https://api.anthropic.com/v1/messages"'],
  ['cross-app detector', files.crossApp, 'const detectRaw = await callClaude'],
]) {
  assertBefore(
    source,
    'await reserveRate(userId)',
    aiCall,
    `${label} reserves quota before Claude`,
  );
  assert.match(
    source,
    /if \(counted == null\)[\s\S]*rate_unavailable/,
    `${label} must fail closed when quota count is unavailable`,
  );
  assert.doesNotMatch(
    source,
    /if \(!isAdmin\) await logRate\(userId\);/,
    `${label} must not log AI usage only after Claude succeeds`,
  );
}

console.log('edge AI gate invariants passed');
