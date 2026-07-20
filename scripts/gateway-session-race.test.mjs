import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/gateway-chat.js', import.meta.url), 'utf8');

function functionBody(name, nextName) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf(`async function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

const resume = functionBody('gwResumeLatestSession', 'gwResumeLatestSessionOnce');
assert.match(
  resume,
  /if \(_gwResumePromise\) return await _gwResumePromise;/,
  'concurrent history loads must share the in-flight resume'
);
assert.ok(
  resume.indexOf('if (_gwResumePromise)') < resume.indexOf('if (gwState.sessionId'),
  'an in-flight resume must finish before session fast paths'
);

const ensure = functionBody('gwEnsureSession', 'gwSaveMsg');
assert.match(
  ensure,
  /var resumed = await gwResumeLatestSession\(\);/,
  'session creation must wait for history resume'
);
assert.ok(
  ensure.indexOf('await gwResumeLatestSession();') < ensure.indexOf('if (gwState.sessionId)'),
  'send must await hydration even after resume assigns the session id'
);
assert.doesNotMatch(
  ensure,
  /gwState\.messages\s*&&\s*gwState\.messages\.length/,
  'local messages must never bypass history resume'
);

const send = functionBody('gwSendMessage', 'openGatewayChat');
const ensureIndex = send.indexOf('await gwEnsureSession(userText);');
const bubbleIndex = send.indexOf('gwAddUserBubble(userText);');
const messageIndex = send.indexOf("gwState.messages.push({ role: 'user', content: userText });");
const saveIndex = send.indexOf("await gwSaveMsg('user', userText);");

assert.ok(ensureIndex >= 0, 'send must bind a session');
assert.ok(
  ensureIndex < bubbleIndex && bubbleIndex < messageIndex && messageIndex < saveIndex,
  'history must finish before the new turn is rendered, recorded, and saved'
);

console.log('Gateway session race invariants passed.');
