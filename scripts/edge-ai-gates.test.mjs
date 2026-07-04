import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function handlerBody(src, rel) {
  const idx = src.indexOf("Deno.serve");
  assert.notEqual(idx, -1, `${rel}: missing Deno.serve handler`);
  return src.slice(idx);
}

function assertOrder(text, before, after, label) {
  const beforeIdx = text.indexOf(before);
  const afterIdx = text.indexOf(after);
  assert.notEqual(beforeIdx, -1, `${label}: missing ${before}`);
  assert.notEqual(afterIdx, -1, `${label}: missing ${after}`);
  assert.ok(beforeIdx < afterIdx, `${label}: expected ${before} before ${after}`);
}

const sensei = handlerBody(read("edge-functions/sensei-chat.edge.ts"), "sensei-chat.edge.ts");
assertOrder(sensei, "await insertAiRateLog(userId, purpose)", 'fetch("https://api.anthropic.com/v1/messages"', "sensei-chat");
assert.match(sensei, /counted\.count == null[\s\S]*AI_RATE_LIMIT_UNAVAILABLE/, "sensei-chat must fail closed on quota count errors");
assert.doesNotMatch(sensei, /Gebruik loggen|Loggen mislukt|\.then\(\(\{ error: logError/, "sensei-chat must not log usage only after Claude");

const selfSense = handlerBody(
  read("edge-functions/selfsense-aandachtspunten-detect.edge.ts"),
  "selfsense-aandachtspunten-detect.edge.ts",
);
assertOrder(selfSense, "await reserveRate(userId)", 'fetch("https://api.anthropic.com/v1/messages"', "selfsense detect");
assert.match(selfSense, /counted == null[\s\S]*rate_limit_unavailable/, "selfsense detect must fail closed on quota count errors");
assert.doesNotMatch(selfSense, /await logRate\(userId\)/, "selfsense detect must not log usage only after Claude");

const crossApp = handlerBody(read("edge-functions/cross-app-pattern-detect.edge.ts"), "cross-app-pattern-detect.edge.ts");
assertOrder(crossApp, "await reserveRate(userId)", "await callClaude(detectSys", "cross-app detect");
assert.match(crossApp, /counted == null[\s\S]*rate_limit_unavailable/, "cross-app detect must fail closed on quota count errors");
assert.doesNotMatch(crossApp, /await logRate\(userId\)/, "cross-app detect must not log usage only after Claude");

const whatsapp = handlerBody(read("edge-functions/whatsapp-webhook.edge.ts"), "whatsapp-webhook.edge.ts");
assertOrder(whatsapp, "if (!ownUser?.user_id)", "let reply = await callClaude", "whatsapp unlinked gate");
assertOrder(whatsapp, "await canUseWhatsappAi(ownUser.user_id)", "let reply = await callClaude", "whatsapp ai access gate");
assertOrder(whatsapp, "await reserveWhatsappAiUse(ownUser.user_id)", "let reply = await callClaude", "whatsapp quota reservation");
assert.doesNotMatch(whatsapp, /ai_rate_log"\)\.insert[\s\S]*\.then/, "whatsapp must not log usage only after Claude");

console.log("edge AI gate invariants passed");
