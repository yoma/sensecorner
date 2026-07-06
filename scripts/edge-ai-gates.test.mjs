import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");

function assertBefore(src, before, after, label) {
  const b = src.indexOf(before);
  const a = src.indexOf(after);
  assert.notEqual(b, -1, `${label}: missing ${before}`);
  assert.notEqual(a, -1, `${label}: missing ${after}`);
  assert.ok(b < a, `${label}: expected ${before} before ${after}`);
}

{
  const src = read("edge-functions/sensei-chat.edge.ts");
  assert.match(src, /async function reserveAiRateLog\(/, "sensei-chat reserves quota with awaited helper");
  assertBefore(src, "await reserveAiRateLog(userId, isOwnsenseHub)", 'fetch("https://api.anthropic.com/v1/messages"', "sensei-chat");
  assert.match(src, /counted\.count == null[\s\S]*AI_RATE_LIMIT_UNAVAILABLE/, "sensei-chat fails closed on quota count errors");
  assert.match(src, /afterReserve\.count > maxAllowed/, "sensei-chat rechecks quota after reservation");
  assert.doesNotMatch(src, /Gebruik loggen[\s\S]*?\.then\(\(\{ error: logError/, "sensei-chat must not log quota after Claude");
}

{
  const src = read("edge-functions/whatsapp-webhook.edge.ts");
  assert.match(src, /async function canUseWhatsappAi\(/, "WhatsApp checks ai_access before Claude");
  assertBefore(src, "if (!ownUser?.user_id)", "let waMirrorDossier", "WhatsApp unlinked static gate");
  assertBefore(src, "await canUseWhatsappAi(ownUser.user_id)", "let waMirrorDossier", "WhatsApp ai_access gate");
  assertBefore(src, "await reserveAiRateLog(ownUser.user_id)", "let waMirrorDossier", "WhatsApp quota reservation");
  assertBefore(src, "let waMirrorDossier", "await callClaude(system", "WhatsApp prompt flow");
  assert.doesNotMatch(src, /ai_rate_log"\)\.insert\(\{ user_id: ownUser\.user_id \}\)\.then/, "WhatsApp must not log quota after Claude");
}

{
  const src = read("edge-functions/selfsense-aandachtspunten-detect.edge.ts");
  assert.match(src, /async function reserveRate\(/, "SelfSense detector reserves quota with awaited helper");
  assertBefore(src, "await reserveRate(userId)", 'fetch("https://api.anthropic.com/v1/messages"', "SelfSense detector");
  assert.match(src, /reason: "rate_limit_unavailable"/, "SelfSense detector fails closed on quota errors");
  assert.doesNotMatch(src, /await logRate\(userId\)/, "SelfSense detector must not log quota after Claude");
}

{
  const src = read("edge-functions/cross-app-pattern-detect.edge.ts");
  assert.match(src, /async function reserveRate\(/, "Cross-app detector reserves quota with awaited helper");
  assertBefore(src, "await reserveRate(userId)", "await callClaude(detectSys", "Cross-app detector");
  assert.match(src, /reason: "rate_limit_unavailable"/, "Cross-app detector fails closed on quota errors");
  assert.doesNotMatch(src, /await logRate\(userId\)/, "Cross-app detector must not log quota after Claude");
}

console.log("edge AI gate invariants passed");
