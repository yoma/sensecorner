import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assertContains(rel, needle) {
  const src = read(rel);
  assert(src.includes(needle), `${rel} is missing: ${needle}`);
}

function assertBefore(rel, beforeNeedle, afterNeedle) {
  const src = read(rel);
  const before = src.indexOf(beforeNeedle);
  const after = src.indexOf(afterNeedle);
  assert.notEqual(before, -1, `${rel} is missing before marker: ${beforeNeedle}`);
  assert.notEqual(after, -1, `${rel} is missing after marker: ${afterNeedle}`);
  assert(before < after, `${rel}: expected ${beforeNeedle} before ${afterNeedle}`);
}

function assertAbsent(rel, needle) {
  const src = read(rel);
  assert(!src.includes(needle), `${rel} must not contain: ${needle}`);
}

const sensei = "edge-functions/sensei-chat.edge.ts";
assertContains(sensei, "AI_RATE_LIMIT_UNAVAILABLE");
assertBefore(
  sensei,
  "const rateBlocked = await reserveAiRateLog(userId, isOwnsenseHub);",
  'fetch("https://api.anthropic.com/v1/messages"',
);
assertAbsent(sensei, "counted.count != null && counted.count >= maxAllowed");
assertAbsent(sensei, "Loggen mislukt");

const whatsapp = "edge-functions/whatsapp-webhook.edge.ts";
assertBefore(whatsapp, "if (!ownUser?.user_id)", "let reply = await callClaude");
assertBefore(whatsapp, "if (!await canUseAiForUser(ownUserId))", "let reply = await callClaude");
assertBefore(whatsapp, "if (!await reserveAiRateLog(ownUserId)) return twilioWebhookAck();", "let reply = await callClaude");
assertAbsent(whatsapp, "rate log failed");
assertAbsent(whatsapp, "const { count } = await sb");

const selfsenseDetect = "edge-functions/selfsense-aandachtspunten-detect.edge.ts";
assertContains(selfsenseDetect, 'reason: "rate_unavailable"');
assertBefore(
  selfsenseDetect,
  "const rateBlocked = await reserveRate(userId);",
  'fetch("https://api.anthropic.com/v1/messages"',
);
assertAbsent(selfsenseDetect, "counted != null && counted >= RATE_LIMIT_MAX");
assertAbsent(selfsenseDetect, "await logRate(userId)");

const crossDetect = "edge-functions/cross-app-pattern-detect.edge.ts";
assertContains(crossDetect, 'reason: "rate_unavailable"');
assertBefore(
  crossDetect,
  "const rateBlocked = await reserveRate(userId);",
  "const detectRaw = await callClaude",
);
assertAbsent(crossDetect, "counted != null && counted >= RATE_LIMIT_MAX");
assertAbsent(crossDetect, "await logRate(userId)");

console.log("edge AI gate invariants passed");
