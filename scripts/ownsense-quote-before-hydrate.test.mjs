/**
 * OWN Sense mag een dagelijkse quote niet naar Supabase schrijven
 * voordat het serverprofiel geladen is. Die upsert vervangt categories en foto's.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../ownsense.html', import.meta.url), 'utf8');

function extractFunction(name){
  const sig = 'function '+name+'(';
  let start = html.indexOf(sig);
  assert.ok(start >= 0, 'missing '+name);
  if(html.slice(start-6, start)==='async ') start -= 6;
  const open = html.indexOf('{', start);
  let depth = 0;
  for(let i = open; i < html.length; i++){
    const ch = html[i];
    if(ch === '{') depth++;
    else if(ch === '}'){
      depth--;
      if(depth === 0) return html.slice(start, i+1);
    }
  }
  throw new Error('unclosed '+name);
}

const today = '2026-10-21';
const sandbox = {
  __ownProfileHydrated: false,
  __quoteAutoBusy: false,
  __quoteGenBusy: false,
  __quoteAutoLastAt: 0,
  saves: [],
  hubState: {
    profile_quote: 'Quote van vandaag',
    profile_quote_author: 'Auteur',
    profile_quote_date: today,
    profile_quote_updated_at: '2026-10-21T08:00:00.000Z',
    profile_quote_recent: [],
    categories: { karakter: { a0: '' } },
    photo_urls: []
  },
  ownTodayIso(){ return today; },
  ownQuoteBlockedSet(){ return {}; },
  buildOwnQuoteSource(){ return ''; },
  ownQuoteRichCount(){ return 0; },
  pickOwnQuoteFromAiText(){ return null; },
  pickOwnQuoteAvoiding(){ return { q:'Nieuwe quote', a:'Iemand' }; },
  callAnthropicJson(){ throw new Error('AI mag niet starten bij een lege lokale hub'); },
  ownRememberQuote(q){
    const rec = Array.isArray(sandbox.hubState.profile_quote_recent) ? sandbox.hubState.profile_quote_recent.slice() : [];
    const text = String(q||'').trim();
    if(text) rec.unshift(text);
    sandbox.hubState.profile_quote_recent = rec.slice(0, 8);
  },
  saveHubState(opts){
    sandbox.saves.push({
      skipRemote: !!(opts && opts.skipRemote),
      category: sandbox.hubState.categories.karakter.a0,
      photos: sandbox.hubState.photo_urls.slice()
    });
  },
  renderMijTab(){},
  console,
  Date,
  String,
  Array,
  Object,
  Math
};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFunction('ownMayRemoteSaveProfile'),
    extractFunction('generateProfileQuote'),
    extractFunction('maybeAutoGenerateProfileQuote')
  ].join('\n'),
  sandbox
);

sandbox.maybeAutoGenerateProfileQuote();
assert.equal(sandbox.saves.length, 0, 'auto-quote before hydrate must not save');
assert.equal(sandbox.__quoteAutoLastAt, 0, 'skipped auto-quote must not start the cooldown');
assert.equal(sandbox.__quoteAutoBusy, false);

await sandbox.generateProfileQuote();
assert.equal(sandbox.saves.length, 1);
assert.equal(sandbox.saves[0].skipRemote, true, 'manual refresh before hydrate stays local');
assert.equal(sandbox.saves[0].category, '');

sandbox.saves.length = 0;
sandbox.__quoteAutoBusy = false;
sandbox.__quoteGenBusy = false;
sandbox.__quoteAutoLastAt = 0;
sandbox.hubState.profile_quote = 'Quote van vandaag';
sandbox.hubState.profile_quote_date = today;
sandbox.hubState.profile_quote_recent = [];
sandbox.hubState.categories.karakter.a0 = 'Servertekst die moet blijven';
sandbox.hubState.photo_urls = ['selfsense-photos/user/foto.jpg'];
sandbox.__ownProfileHydrated = true;
sandbox.maybeAutoGenerateProfileQuote();
assert.equal(sandbox.saves.length, 1, 'after hydrate the quote may save');
assert.equal(sandbox.saves[0].skipRemote, false);
assert.equal(sandbox.saves[0].category, 'Servertekst die moet blijven');
assert.deepEqual(sandbox.saves[0].photos, ['selfsense-photos/user/foto.jpg']);

sandbox.saves.length = 0;
sandbox.__quoteAutoBusy = false;
sandbox.__quoteAutoLastAt = 0;
sandbox.hubState.profile_quote_recent = ['Nieuwe quote'];
sandbox.maybeAutoGenerateProfileQuote();
assert.equal(sandbox.saves.length, 0, 'today plus recent history does not save again');

const branchAt = html.indexOf('}else if(res&&!res.error)');
assert.ok(branchAt > 0, 'confirmed empty profile row must be distinguishable from a timeout');
const timeoutElse = html.slice(
  html.indexOf('}else{', branchAt),
  html.indexOf('void hydrateSelfsenseSpiegelFromMirrorSessions', branchAt)
);
assert.match(timeoutElse, /ownApplyLocalBasisFallback\(user\);/);
assert.equal(timeoutElse.includes('__ownProfileHydrated'), false, 'timeout must not allow a profile upsert');
