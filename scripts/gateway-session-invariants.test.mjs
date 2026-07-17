import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "js/gateway-chat.js"), "utf8");

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

function assertOrder(text, markers, label) {
  let previous = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    assert.notEqual(index, -1, `${label}: missing ${marker}`);
    assert.ok(index > previous, `${label}: ${marker} is out of order`);
    previous = index;
  }
}

assert.match(source, /var _gwResumePromise = null;/, "missing resume lock");
assert.match(source, /var _gwEnsureSessionPromise = null;/, "missing ensure-session lock");

const resume = section("async function gwResumeLatestSession()", "async function gwEnsureSession");
assert.match(resume, /\.limit\(1\)/, "resume must select one coherent session");
assert.match(resume, /gwHydrateMessagesFromDb\(latest\.id\)/, "resume must hydrate only the selected session");
assert.doesNotMatch(resume, /rows\.map/, "resume must not merge unrelated sessions");

const ensure = section("async function gwEnsureSession", "async function gwSaveMsg");
assertOrder(
  ensure,
  ["await gwResumeLatestSession()", "if (_gwLastResumeFailed) return null;", ".insert({"],
  "session creation",
);

const send = section("async function gwSendMessage", "async function openGatewayChat");
assertOrder(
  send,
  [
    "await gwEnsureSession(userText)",
    "await gwSaveMsg('user', userText)",
    "gwAddUserBubble(userText)",
    "gwState.messages.push({ role: 'user'",
    "callGatewayAi(system, apiMsgs, 700)",
    "await gwSaveMsg('ai', replyText)",
    "gwState.messages.push({ role: 'assistant'",
  ],
  "durable Gateway turn",
);

console.log("gateway session invariants passed");
