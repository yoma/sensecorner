import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function indexOfAfter(source, needle, fromIndex = 0) {
  const idx = source.indexOf(needle, fromIndex);
  assert.notEqual(idx, -1, `Expected to find ${JSON.stringify(needle)}`);
  return idx;
}

function assertBefore(source, first, second, fromIndex = 0) {
  const firstIdx = indexOfAfter(source, first, fromIndex);
  const secondIdx = indexOfAfter(source, second, fromIndex);
  assert(
    firstIdx < secondIdx,
    `Expected ${JSON.stringify(first)} before ${JSON.stringify(second)}`,
  );
  return firstIdx;
}

function assertNotContains(source, needle) {
  assert.equal(source.includes(needle), false, `Did not expect ${JSON.stringify(needle)}`);
}

const senseiChat = readRepoFile("edge-functions/sensei-chat.edge.ts");
const senseiHandler = indexOfAfter(senseiChat, "Deno.serve");
assertBefore(
  senseiChat,
  "const reservation = await reserveAiRateLimitSlot(userId, isOwnsenseHub);",
  'const claudeRes = await fetch("https://api.anthropic.com/v1/messages"',
  senseiHandler,
);
assert(senseiChat.includes("if (counted.count == null)"));
assert(senseiChat.includes('code: "AI_RATE_LIMIT_UNAVAILABLE"'));
assertNotContains(senseiChat, 'sb.from("ai_rate_log").insert(logRow).then');
assertNotContains(senseiChat, "Loggen mislukt");

const whatsapp = readRepoFile("edge-functions/whatsapp-webhook.edge.ts");
const whatsappHandler = indexOfAfter(
  whatsapp,
  'const ownUser = lookup.kind === "ok" ? lookup.row : null;',
  whatsapp.indexOf("Deno.serve"),
);
assertBefore(
  whatsapp,
  "if (!ownUser?.user_id) {",
  "const aiAccess = await resolveAiAccessForUser(ownUser.user_id);",
  whatsappHandler,
);
assertBefore(
  whatsapp,
  "const aiAccess = await resolveAiAccessForUser(ownUser.user_id);",
  "const reservation = await reserveAiRateLimitSlot(ownUser.user_id, RATE_LIMIT_MAX);",
  whatsappHandler,
);
assertBefore(
  whatsapp,
  "const reservation = await reserveAiRateLimitSlot(ownUser.user_id, RATE_LIMIT_MAX);",
  'let reply = await callClaude(system, [...history, { role: "user", content: body }]);',
  whatsappHandler,
);
assert(whatsapp.includes("async function resolveAiAccessForUser(userId: string)"));
assert(whatsapp.includes("aiEnabled = await mayUseSenseiDuringOnboarding(userId)"));
assertNotContains(whatsapp, 'sb.from("ai_rate_log").insert({ user_id: ownUser.user_id }).then');
assertNotContains(whatsapp, "rate log failed:");

console.log("Edge AI gate invariants OK");
