import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function read(name) {
  return readFileSync(join(here, name), "utf8");
}

function indexOfOrThrow(haystack, needle, label = needle) {
  const idx = haystack.indexOf(needle);
  assert.notEqual(idx, -1, `Missing ${label}`);
  return idx;
}

const senseiChat = read("sensei-chat.edge.ts");
const chatReserveFn = indexOfOrThrow(senseiChat, "async function reserveAiRateLog");
const chatReserveCall = indexOfOrThrow(senseiChat, "const reserved = await reserveAiRateLog(userId, isOwnsenseHub);");
const chatClaude = indexOfOrThrow(senseiChat, 'fetch("https://api.anthropic.com/v1/messages"');
assert.ok(chatReserveFn < chatReserveCall, "sensei-chat must define the quota reservation helper before use");
assert.ok(chatReserveCall < chatClaude, "sensei-chat must reserve quota before calling Claude");
assert.equal(
  senseiChat.indexOf("sb.from(\"ai_rate_log\").insert", chatClaude),
  -1,
  "sensei-chat must not log quota only after Claude",
);
assert.match(
  senseiChat,
  /if \(counted\.count == null\)[\s\S]*AI_RATE_LIMIT_UNAVAILABLE/,
  "sensei-chat must fail closed when quota counting is unavailable",
);

const whatsapp = read("whatsapp-webhook.edge.ts");
const whatsappUnlinkedGate = indexOfOrThrow(whatsapp, "if (!ownUser?.user_id) {");
const whatsappAccessGate = indexOfOrThrow(whatsapp, "const aiGate = await canUseWhatsappAi(linkedUserId);");
const whatsappReserveCall = indexOfOrThrow(whatsapp, "const reserved = await reserveWhatsappAiRate(linkedUserId);");
const whatsappClaudeCall = indexOfOrThrow(whatsapp, "let reply = await callClaude(");
assert.ok(whatsappUnlinkedGate < whatsappClaudeCall, "WhatsApp must block unlinked numbers before Claude");
assert.ok(whatsappAccessGate < whatsappClaudeCall, "WhatsApp must check AI access before Claude");
assert.ok(whatsappReserveCall < whatsappClaudeCall, "WhatsApp must reserve quota before Claude");
assert.equal(
  whatsapp.indexOf("sb.from(\"ai_rate_log\").insert", whatsappClaudeCall),
  -1,
  "WhatsApp must not log quota only after Claude",
);
assert.match(
  whatsapp,
  /async function canUseWhatsappAi[\s\S]*ai_access[\s\S]*AI_ACCESS_PENDING/,
  "WhatsApp must enforce ai_access before AI replies",
);

console.log("edge AI gates OK");
