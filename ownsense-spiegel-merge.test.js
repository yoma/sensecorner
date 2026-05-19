const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('ownsense.html', 'utf8');

function extractFunctionSource(name) {
  const marker = 'function ' + name + '(';
  const start = html.indexOf(marker);
  assert.notStrictEqual(start, -1, 'missing function ' + name);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return html.slice(start, i + 1);
  }
  throw new Error('unterminated function ' + name);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext([
  extractFunctionSource('ownSpiegelCatHasAnswers'),
  extractFunctionSource('ownIsoTimeMs'),
  extractFunctionSource('ownRemoteSelfsenseSpiegelShouldWin')
].join('\n'), sandbox);

const shouldWin = sandbox.ownRemoteSelfsenseSpiegelShouldWin;

assert.strictEqual(
  shouldWin(
    { a0: 'fresh SelfSense signal' },
    { selfsense_spiegel_sync_at: '2026-05-19T11:00:00.000Z' },
    {},
    {},
    ''
  ),
  true,
  'fresh remote SelfSense sync should survive a stale OWN save'
);

assert.strictEqual(
  shouldWin(
    { a0: 'same sync' },
    { selfsense_spiegel_sync_at: '2026-05-19T11:00:00.000Z' },
    { a0: 'same sync' },
    { selfsense_spiegel_sync_at: '2026-05-19T11:00:00.000Z' },
    ''
  ),
  false,
  'already-known remote sync should not overwrite local state'
);

assert.strictEqual(
  shouldWin(
    { a0: 'remote sync' },
    { selfsense_spiegel_sync_at: '2026-05-19T11:00:00.000Z' },
    { a0: 'manual correction' },
    { selfsense_spiegel_sync_at: '2026-05-19T10:00:00.000Z' },
    '2026-05-19T11:05:00.000Z'
  ),
  false,
  'manual OWN edits after the remote sync should keep local precedence'
);

assert.strictEqual(
  shouldWin(
    {},
    { selfsense_spiegel_sync_at: '2026-05-19T11:00:00.000Z' },
    {},
    {},
    ''
  ),
  false,
  'empty remote sync should not replace local state'
);

console.log('ownsense spiegel merge tests passed');
