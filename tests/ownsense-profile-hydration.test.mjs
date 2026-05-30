import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'ownsense.html'), 'utf8');

function functionBody(name) {
  const signature = `function ${name}`;
  const start = html.indexOf(signature);
  assert.notEqual(start, -1, `${name} should exist`);
  const open = html.indexOf('{', start);
  assert.notEqual(open, -1, `${name} should have a body`);
  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(open + 1, i);
    }
  }
  assert.fail(`${name} body should be balanced`);
}

function assertOrder(haystack, description, ...needles) {
  let last = -1;
  for (const needle of needles) {
    const next = haystack.indexOf(needle, last + 1);
    assert.notEqual(next, -1, `${description}: missing ${needle}`);
    assert.ok(next > last, `${description}: ${needle} should appear in order`);
    last = next;
  }
}

const scheduleBody = functionBody('ownScheduleRemoteSave');
assertOrder(
  scheduleBody,
  'debounced saves wait for profile hydration',
  'if(!__ownSenseProfileHydrated)',
  '__ownRemoteSaveQueuedUntilHydrated=true;',
  'return;',
  'setTimeout(function()'
);

const saveBody = functionBody('saveOwnToSupabaseCore');
assertOrder(
  saveBody,
  'direct saves cannot build a full upsert before hydration',
  'if(!ownProfileHydratedForUser(user))',
  "__ownRemoteSaveQueuedUntilHydrated=true;",
  "return {ok:true,synced:false,reason:'profile_not_loaded'};",
  'var cleanName=String(hubState.display_name||\'\').trim();',
  'var propsOut={',
  "client.from('sense_profiles').upsert(payload,{onConflict:'user_id,name'})"
);

const loadBody = functionBody('loadOwnFromSupabase');
assertOrder(
  loadBody,
  'profile load only hydrates after a successful profile response is applied',
  'ownMarkProfileNeedsHydration(user.id);',
  'var res=await ownPromiseTimeout(',
  'var profileFetchOk=!!(res&&!res.error);',
  'if(res&&res.data){',
  '}else if(profileFetchOk){',
  'ownApplyLocalBasisFallback(user);',
  '}',
  'if(profileFetchOk)ownMarkProfileHydrated(user.id);'
);
assert.ok(
  loadBody.includes('if(profileFetchOk&&ownBasisprofielIsComplete()){'),
  'post-load basis autosave must not run after profile fetch timeout/error'
);
assert.ok(
  loadBody.includes("ownMarkProfileNeedsHydration('');"),
  'signed-out load should clear the hydration gate'
);

console.log('ownsense profile hydration guards verified');
