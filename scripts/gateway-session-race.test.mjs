import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/gateway-chat.js', import.meta.url), 'utf8');

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

assert.match(source, /var _gwSessionPromise = null;/, 'missing shared session lock');
assert.match(source, /var _gwStartFresh = false;/, 'missing explicit new-chat state');

const hydrate = section(
  'async function gwHydrateMessagesFromDb',
  'function gwSetChatSubtitle',
);
assert.match(hydrate, /gwState\.historyHydrated = true;\s*return true;/);
assert.match(hydrate, /gwState\.historyHydrated = false;\s*return false;/);

const fresh = section('async function gwNieuwGesprek', '/** Hervat alleen');
assertOrder(
  fresh,
  ['if (_gwSessionPromise) await _gwSessionPromise;', '_gwStartFresh = true;'],
  'new chat transition',
);

const resume = section(
  'async function gwResumeLatestSession()',
  'async function gwResumeLatestSessionOnce',
);
assertOrder(
  resume,
  [
    'if (_gwSessionPromise) return await _gwSessionPromise;',
    'if (_gwStartFresh) return null;',
    '_gwSessionPromise = gwResumeLatestSessionOnce();',
  ],
  'history resume',
);

const ensure = section(
  'async function gwEnsureSession',
  'async function gwCreateSession',
);
assert.match(ensure, /await gwResumeLatestSession\(\)/);
assertOrder(
  ensure,
  [
    'if (gwState.sessionId && !gwState.historyHydrated) return null;',
    'await gwResumeLatestSession()',
  ],
  'failed explicit history load',
);
assert.match(ensure, /if \(_gwLastResumeFailed\) return null;/);
assert.match(ensure, /_gwSessionPromise = gwCreateSession\(previewText\);/);
assert.doesNotMatch(
  ensure,
  /gwState\.messages\s*&&\s*gwState\.messages\.length/,
  'local messages must not bypass history restore',
);

const send = section('async function gwSendMessage', 'async function openGatewayChat');
assertOrder(
  send,
  [
    'await gwEnsureSession(userText)',
    "await gwSaveMsg('user', userText)",
    'gwAddUserBubble(userText)',
    "gwState.messages.push({ role: 'user'",
    'callGatewayAi(system, apiMsgs, 700)',
    "await gwSaveMsg('ai', replyText)",
    "gwState.messages.push({ role: 'assistant'",
  ],
  'durable Gateway turn',
);

const save = section('async function gwSaveMsg', 'async function gwSetSessionFlag');
assertOrder(
  save,
  [
    "client.from('sense_sessions').update",
    ".select('id').maybeSingle()",
    'if (updated && updated.error)',
    'if (!updated || !updated.data || updated.data.id !== sessionId)',
    "client.from('sense_session_msgs').insert",
  ],
  'session metadata and message save',
);

const open = section('async function openGatewayChat', 'function closeGatewayChat');
assertOrder(
  open,
  [
    'if (gwState.busy) return;',
    'await gwResumeLatestSession()',
  ],
  'open during session transition',
);

console.log('Gateway session race invariants passed.');
