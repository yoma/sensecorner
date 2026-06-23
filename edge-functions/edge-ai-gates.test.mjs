import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function indexOfOrThrow(source, needle, label = needle) {
  const idx = source.indexOf(needle);
  assert.notEqual(idx, -1, `Missing ${label}`);
  return idx;
}

function assertBefore(source, beforeNeedle, afterNeedle, label) {
  const before = indexOfOrThrow(source, beforeNeedle, `${label} before marker`);
  const after = indexOfOrThrow(source, afterNeedle, `${label} after marker`);
  assert.ok(before < after, `${label}: expected "${beforeNeedle}" before "${afterNeedle}"`);
}

{
  const source = read('edge-functions/sensei-chat.edge.ts');
  assertBefore(
    source,
    'const rateBlock = await reserveAiRateOrResponse(userId, isOwnsenseHub);',
    'fetch("https://api.anthropic.com/v1/messages"',
    'sensei-chat reserves quota before Claude',
  );
  assert.ok(source.includes('code: "AI_RATE_UNAVAILABLE"'), 'sensei-chat fails closed when quota cannot be checked');
  assert.ok(!source.includes('Loggen mislukt'), 'sensei-chat must not rely on post-Claude async usage logging');
}

{
  const source = read('edge-functions/whatsapp-webhook.edge.ts');
  const claudeCall = 'let reply = await callClaude(system, [...history, { role: "user", content: body }]);';
  assertBefore(source, 'if (!ownUser?.user_id) {', claudeCall, 'WhatsApp blocks unlinked phones before Claude');
  assertBefore(source, 'const accessOk = await hasWhatsappAiAccess(ownUser.user_id);', claudeCall, 'WhatsApp checks AI access before Claude');
  assertBefore(source, 'const rateStatus = await reserveWhatsappAiRate(ownUser.user_id);', claudeCall, 'WhatsApp reserves quota before Claude');
  assert.ok(!source.slice(indexOfOrThrow(source, claudeCall)).includes('ai_rate_log").insert'), 'WhatsApp must not log usage after Claude');
}

{
  const source = read('edge-functions/selfsense-aandachtspunten-detect.edge.ts');
  assertBefore(
    source,
    'const rateStatus = await reserveRate(userId);',
    'fetch("https://api.anthropic.com/v1/messages"',
    'SelfSense detector reserves quota before Claude',
  );
  assert.ok(source.includes('reason: "rate_unavailable"'), 'SelfSense detector fails closed when quota cannot be checked');
  assert.ok(!source.includes('await logRate(userId)'), 'SelfSense detector must not log usage after Claude');
}

{
  const source = read('edge-functions/cross-app-pattern-detect.edge.ts');
  assertBefore(
    source,
    'const rateStatus = await reserveRate(userId);',
    'const detectRaw = await callClaude(detectSys, detectUsr, 1000);',
    'Cross-app detector reserves quota before first Claude call',
  );
  assert.ok(source.includes('reason: "rate_unavailable"'), 'Cross-app detector fails closed when quota cannot be checked');
  assert.ok(!source.includes('await logRate(userId)'), 'Cross-app detector must not log usage after Claude');
}

console.log('Edge AI gate invariants passed');
