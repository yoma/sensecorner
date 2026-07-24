import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

function assertOrder(source, before, after, label) {
  const beforeIdx = source.indexOf(before);
  const afterIdx = source.indexOf(after);
  assert.notEqual(beforeIdx, -1, `${label}: missing ${before}`);
  assert.notEqual(afterIdx, -1, `${label}: missing ${after}`);
  assert.ok(beforeIdx < afterIdx, `${label}: expected ${before} before ${after}`);
}

function assertNoRateInsertAfter(source, marker, label) {
  const idx = source.indexOf(marker);
  assert.notEqual(idx, -1, `${label}: missing marker ${marker}`);
  const after = source.slice(idx);
  assert.doesNotMatch(after, /ai_rate_log"\)\.insert|ai_rate_log'\)\.insert/, `${label}: found post-Claude ai_rate_log insert`);
}

{
  const source = read("edge-functions/sensei-chat.edge.ts");
  const mirror = read("supabase/functions/sensei-chat/index.ts");
  assert.equal(mirror, source, "sensei-chat deploy mirrors must stay identical");
  assert.match(source, /async function reserveAiRateSlot\(/, "sensei-chat: missing reservation helper");
  assert.doesNotMatch(source, /counted\.count != null && counted\.count >=/, "sensei-chat: quota read errors must not fail open");
  assert.doesNotMatch(source, /function logGatewaySummaryUsage\(/, "gateway summary: post-call logger must be removed");

  const summaries = source.slice(
    source.indexOf("async function handleGatewaySummaries("),
    source.indexOf("Deno.serve("),
  );
  assertOrder(
    summaries,
    'const reserved = await reserveAiRateSlot(userId, "gateway_summary");',
    "const text = await callAnthropicPlain(",
    "gateway summary",
  );

  const handler = source.slice(source.indexOf("Deno.serve("));
  assertOrder(
    handler,
    "const reserved = await reserveAiRateSlot(userId, mode);",
    'claudeRes = await fetch("https://api.anthropic.com/v1/messages"',
    "sensei-chat",
  );
  assertNoRateInsertAfter(handler, "const claudeData = await claudeRes.json();", "sensei-chat");
}

{
  const source = read("edge-functions/selfsense-aandachtspunten-detect.edge.ts");
  assert.match(source, /async function reserveRateSlot\(/, "selfsense detect: missing reservation helper");
  assert.doesNotMatch(source, /counted != null && counted >= RATE_LIMIT_MAX/, "selfsense detect: quota read errors must not fail open");
  assertOrder(
    source,
    "const reserved = await reserveRateSlot(userId);",
    'claudeRes = await fetch("https://api.anthropic.com/v1/messages"',
    "selfsense detect",
  );
  assertNoRateInsertAfter(source, "const claudeData = (await claudeRes.json())", "selfsense detect");
}

{
  const source = read("edge-functions/cross-app-pattern-detect.edge.ts");
  assert.match(source, /async function reserveRateSlot\(/, "cross-app detect: missing reservation helper");
  assert.doesNotMatch(source, /counted != null && counted >= RATE_LIMIT_MAX/, "cross-app detect: quota read errors must not fail open");
  assertOrder(
    source,
    "const reserved = await reserveRateSlot(userId);",
    "const detectRaw = await callClaude(",
    "cross-app detect pass 1",
  );
  const validateSection = source.slice(source.indexOf("// Pass 2: validatie"));
  assertOrder(
    validateSection,
    "const reserved = await reserveRateSlot(userId);",
    "const validateRaw = await callClaude(",
    "cross-app detect pass 2",
  );
  assertNoRateInsertAfter(source, "const detectRaw = await callClaude(", "cross-app detect");
}

{
  const source = read("edge-functions/whatsapp-webhook.edge.ts");
  assert.match(source, /async function resolveAiAccessForWhatsapp\(/, "whatsapp: missing ai_access gate");
  assert.match(source, /async function reserveAiRateSlot\(/, "whatsapp: missing reservation helper");
  assertOrder(source, "if (!ownUser?.user_id) {", "let reply = await callClaude(", "whatsapp unlinked gate");
  assertOrder(source, "const aiAccess = await resolveAiAccessForWhatsapp(ownUser.user_id);", "let reply = await callClaude(", "whatsapp ai_access gate");
  assertOrder(source, "const reserved = await reserveAiRateSlot(ownUser.user_id);", "let reply = await callClaude(", "whatsapp quota reservation");
  assertNoRateInsertAfter(source, "let reply = await callClaude(", "whatsapp");
}

console.log("edge ai gate invariants passed");
