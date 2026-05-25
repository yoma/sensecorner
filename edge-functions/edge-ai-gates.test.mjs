import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const senseChat = readFileSync(new URL("./sensei-chat.edge.ts", import.meta.url), "utf8");
const whatsapp = readFileSync(new URL("./whatsapp-webhook.edge.ts", import.meta.url), "utf8");

function pos(source, needle) {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, `Missing expected code: ${needle}`);
  return index;
}

test("sensei-chat reserves quota before calling Claude and fails closed", () => {
  const reserveFunction = pos(senseChat, "async function reserveAiRateLimitSlot");
  const reserveCall = pos(senseChat, "const reservation = await reserveAiRateLimitSlot(userId, RATE_LIMIT_MAX);");
  const claudeCall = pos(senseChat, 'fetch("https://api.anthropic.com/v1/messages"');

  assert.ok(reserveFunction < reserveCall, "quota reservation helper should be used by the request handler");
  assert.ok(reserveCall < claudeCall, "quota must be reserved before the Anthropic request");
  assert.match(
    senseChat,
    /if \(before\.error\) \{[\s\S]{0,260}status: 503/,
    "quota count errors must fail closed",
  );
  assert.match(
    senseChat,
    /if \(inserted\.error\) \{[\s\S]{0,260}status: 503/,
    "quota insert errors must fail closed",
  );
});

test("WhatsApp webhook gates linked users and blocks unlinked AI calls", () => {
  assert.match(whatsapp, /async function resolveAiAccessForUser/);
  assert.match(whatsapp, /\.from\("user_roles"\)/);
  assert.match(whatsapp, /\.from\("ai_access"\)/);

  const whoAmI = pos(whatsapp, "if (looksLikeWhoAmI(body))");
  const unlinkedBlock = pos(whatsapp.slice(whoAmI), "if (!ownUser?.user_id) {") + whoAmI;
  const aiAccess = pos(whatsapp, "const aiAccess = await resolveAiAccessForUser(ownUser.user_id);");
  const dossierLoad = pos(whatsapp, "const dossierBrief = await loadDossierContextForWhatsapp(ownUser.user_id);");
  const reserveCall = pos(whatsapp, "const reservation = await reserveAiRateLimitSlot(ownUser.user_id, RATE_LIMIT_MAX);");
  const claudeCall = pos(whatsapp, 'let reply = await callClaude(system, [...history, { role: "user", content: body }]);');

  assert.ok(unlinkedBlock < aiAccess, "unlinked senders should return a static response before AI gating");
  assert.ok(aiAccess < dossierLoad, "dossier context should only load after AI access is allowed");
  assert.ok(dossierLoad < reserveCall, "quota reservation should happen after request context is built");
  assert.ok(reserveCall < claudeCall, "quota must be reserved before the WhatsApp Claude call");
  assert.doesNotMatch(
    whatsapp.slice(claudeCall),
    /\.from\("ai_rate_log"\)[\s\S]{0,160}\.insert/,
    "WhatsApp should not log quota after Claude as a best-effort operation",
  );
});
