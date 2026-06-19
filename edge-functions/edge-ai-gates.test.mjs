import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sensei = readFileSync(new URL('./sensei-chat.edge.ts', import.meta.url), 'utf8');
const whatsapp = readFileSync(new URL('./whatsapp-webhook.edge.ts', import.meta.url), 'utf8');

function assertBefore(source, before, after, label) {
  const beforeAt = source.indexOf(before);
  const afterAt = source.indexOf(after);
  assert.notEqual(beforeAt, -1, `${label}: missing ${before}`);
  assert.notEqual(afterAt, -1, `${label}: missing ${after}`);
  assert.ok(beforeAt < afterAt, `${label}: expected ${before} before ${after}`);
}

assertBefore(
  sensei,
  'reserveAiRateLog(userId, purpose)',
  'fetch("https://api.anthropic.com/v1/messages"',
  'sensei-chat reserves quota before Claude',
);
assert.match(
  sensei,
  /if \(counted\.count == null\)[\s\S]*AI_RATE_LIMIT_UNAVAILABLE/,
  'sensei-chat must fail closed when quota count is unavailable',
);
assert.doesNotMatch(
  sensei,
  /then\(\(\{ error: logError \}\)/,
  'sensei-chat must not log AI usage only after Claude succeeds',
);

assertBefore(
  whatsapp,
  'if (!ownUser?.user_id)',
  'let reply = await callClaude',
  'WhatsApp blocks unlinked numbers before Claude',
);
assertBefore(
  whatsapp,
  'mayUseWhatsappAi(linkedUserId)',
  'let reply = await callClaude',
  'WhatsApp checks AI access before Claude',
);
assertBefore(
  whatsapp,
  'reserveWhatsappRate(linkedUserId)',
  'let reply = await callClaude',
  'WhatsApp reserves quota before Claude',
);
assert.doesNotMatch(
  whatsapp,
  /ai_rate_log"\)\.insert\(\{ user_id: ownUser\.user_id \}\)\.then/,
  'WhatsApp must not log AI usage only after Claude succeeds',
);

console.log('edge AI gate invariants passed');
