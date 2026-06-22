import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function read(path){
  return fs.readFileSync(new URL(path, import.meta.url), 'utf8');
}

function extractFunction(source, name){
  const asyncMarker = `async function ${name}`;
  const plainMarker = `function ${name}`;
  let start = source.indexOf(asyncMarker);
  if(start === -1)start = source.indexOf(plainMarker);
  assert.notEqual(start, -1, `${name} not found`);
  const braceStart = source.indexOf('{', start);
  assert.notEqual(braceStart, -1, `${name} body not found`);
  let depth = 0;
  for(let i = braceStart; i < source.length; i++){
    const ch = source[i];
    if(ch === '{')depth++;
    else if(ch === '}'){
      depth--;
      if(depth === 0)return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body did not close`);
}

function runInContext(source, sandbox = {}){
  const ctx = vm.createContext(Object.assign({ console }, sandbox));
  new vm.Script(source).runInContext(ctx);
  return ctx;
}

function plain(value){
  return JSON.parse(JSON.stringify(value));
}

function baseHelpers(source, names){
  return names.map((name) => extractFunction(source, name)).join('\n');
}

async function testSelfSenseConfirmedMerge(){
  const source = read('../selfsense.html');
  const code = baseHelpers(source, [
    'parseAandachtspuntEvidence',
    'aandachtspuntEvidenceMergeKey',
    'mergeAandachtspuntEvidence',
    'confirmSamenvoegen'
  ]);
  const rows = [
    { id: 'keep', soft_name: 'Keep', evidence: [{ checkin_id: 'one' }], movement: [] },
    { id: 'remove', soft_name: 'Remove', evidence: [{ checkin_id: 'two' }, { checkin_id: 'ONE' }], movement: [{ note: 'old', at: '2026-01-01T00:00:00.000Z' }] }
  ];
  const ctx = runInContext(`
    var _samenvoegenBusy = false;
    var S = { user: { id: 'user-1' }, ssBevestigdeAandachtspunten: ${JSON.stringify(rows)} };
    var updateCalls = [];
    var rejectCalls = 0;
    var toasts = [];
    function aandachtspuntIdStr(id){ return String(id == null ? '' : id).trim(); }
    function findBevestigdAandachtspunt(id){ return S.ssBevestigdeAandachtspunten.find(function(r){ return r.id === id; }) || null; }
    function closeSamenvoegenModal(){}
    function toast(msg){ toasts.push(msg); }
    var document = { getElementById: function(){ return null; } };
    function renderWaarIkAanWerkInto(){}
    async function updateAandachtspuntRowLocal(id, patch){
      updateCalls.push({ id: id, patch: patch });
      var row = findBevestigdAandachtspunt(id);
      Object.assign(row, patch);
      return row;
    }
    var sb = { from: function(){
      return {
        update: function(patch){ this.patch = patch; return this; },
        eq: function(){ return this; },
        select: function(){ return this; },
        maybeSingle: async function(){ rejectCalls++; return { data: { id: 'remove' } }; }
      };
    } };
  ` + code);
  await ctx.confirmSamenvoegen('keep', 'remove');
  assert.equal(ctx.updateCalls.length, 1);
  assert.deepEqual(plain(ctx.updateCalls[0].patch.evidence.map((it) => it.checkin_id)), ['one', 'two']);
  assert.equal(ctx.rejectCalls, 1);
  assert.equal(ctx.S.ssBevestigdeAandachtspunten.length, 1);
  assert.equal(ctx.toasts.at(-1), 'Aandachtspunten samengevoegd.');
}

async function testOwnSenseProposalMergeFailureDoesNotPatchLocal(){
  const source = read('../ownsense.html');
  const code = baseHelpers(source, [
    'parseAandachtspuntEvidence',
    'aandachtspuntEvidenceMergeKeyOs',
    'mergeAandachtspuntEvidenceItemsOs',
    'mergeProposalIntoExisting'
  ]);
  const rows = [
    { id: 'proposal', status: 'voorgesteld', soft_name: 'Incoming', evidence: [{ checkin_id: 'two' }, { checkin_id: 'one' }], movement: [] },
    { id: 'existing', status: 'bevestigd', soft_name: 'Existing', evidence: [{ checkin_id: 'one' }], movement: [] }
  ];
  const ctx = runInContext(`
    var window = { __ownsenseReviewBulkBusy: false, __ownsenseReviewAandachtBusy: null };
    var ownAandachtspunten = ${JSON.stringify(rows)};
    var updates = [];
    var patches = [];
    var flashes = [];
    var reloads = 0;
    function ownAandachtspuntIdStr(id){ return String(id == null ? '' : id).trim(); }
    function findOwnAandachtspuntById(id){ return ownAandachtspunten.find(function(r){ return r.id === id; }) || null; }
    function setReviewAandachtButtonsBusy(){}
    function clearReviewAandachtBusy(){ window.__ownsenseReviewAandachtBusy = null; }
    async function updateOwnAandachtspuntRow(id, patch){
      updates.push({ id: id, patch: patch });
      if(id === 'existing')return Object.assign({}, findOwnAandachtspuntById(id), patch);
      return null;
    }
    function patchOwnAandachtspuntLocal(id, patch){ patches.push({ id: id, patch: patch }); return patch; }
    function renderReviewFacts(){}
    function updateOwnPendingNavBadge(){}
    function renderMijTab(){}
    async function loadOwnBrainTables(){ reloads++; }
    function flashOwnsenseMessage(msg, isErr){ flashes.push({ msg: msg, isErr: isErr }); }
  ` + code);
  await ctx.mergeProposalIntoExisting('proposal', 'existing');
  assert.equal(ctx.updates.length, 2);
  assert.deepEqual(plain(ctx.updates[0].patch.evidence.map((it) => it.checkin_id)), ['one', 'two']);
  assert.equal(ctx.patches.length, 0, 'local state must not claim success after reject failure');
  assert.equal(ctx.reloads, 1, 'failure path reloads server state');
  assert.equal(ctx.flashes.at(-1).isErr, true);
}

async function testOwnSenseProposalMergeSuccessPatchesAfterBothWrites(){
  const source = read('../ownsense.html');
  const code = baseHelpers(source, [
    'parseAandachtspuntEvidence',
    'aandachtspuntEvidenceMergeKeyOs',
    'mergeAandachtspuntEvidenceItemsOs',
    'mergeProposalIntoExisting'
  ]);
  const rows = [
    { id: 'proposal', status: 'voorgesteld', soft_name: 'Incoming', evidence: [{ checkin_id: 'two' }, { note: 'keyless' }], movement: [] },
    { id: 'existing', status: 'bevestigd', soft_name: 'Existing', evidence: [{ checkin_id: 'one' }], movement: [] }
  ];
  const ctx = runInContext(`
    var window = { __ownsenseReviewBulkBusy: false, __ownsenseReviewAandachtBusy: null };
    var ownAandachtspunten = ${JSON.stringify(rows)};
    var patches = [];
    var flashes = [];
    function ownAandachtspuntIdStr(id){ return String(id == null ? '' : id).trim(); }
    function findOwnAandachtspuntById(id){ return ownAandachtspunten.find(function(r){ return r.id === id; }) || null; }
    function setReviewAandachtButtonsBusy(){}
    function clearReviewAandachtBusy(){ window.__ownsenseReviewAandachtBusy = null; }
    async function updateOwnAandachtspuntRow(id, patch){
      return Object.assign({}, findOwnAandachtspuntById(id), patch);
    }
    function patchOwnAandachtspuntLocal(id, patch){ patches.push({ id: id, patch: patch }); return patch; }
    function renderReviewFacts(){}
    function updateOwnPendingNavBadge(){}
    function flashOwnsenseMessage(msg, isErr){ flashes.push({ msg: msg, isErr: isErr }); }
  ` + code);
  await ctx.mergeProposalIntoExisting('proposal', 'existing');
  assert.equal(ctx.patches.length, 2);
  assert.deepEqual(plain(ctx.patches[0].patch.evidence.map((it) => it.checkin_id || it.note)), ['one', 'two', 'keyless']);
  assert.equal(ctx.patches[1].patch.status, 'verworpen');
  assert.equal(ctx.flashes.at(-1).isErr, false);
}

await testSelfSenseConfirmedMerge();
await testOwnSenseProposalMergeFailureDoesNotPatchLocal();
await testOwnSenseProposalMergeSuccessPatchesAfterBothWrites();
console.log('attention merge invariants passed');
