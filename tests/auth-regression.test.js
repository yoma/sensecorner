const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function between(src, start, end, label) {
  const a = src.indexOf(start);
  assert(a >= 0, `${label}: missing start marker ${start}`);
  const b = src.indexOf(end, a + start.length);
  assert(b >= 0, `${label}: missing end marker ${end}`);
  return src.slice(a, b);
}

const indexHtml = read('index.html');
const afterAuthSuccess = between(
  indexHtml,
  'async function afterAuthSuccess',
  'async function bootFromUrl',
  'index afterAuthSuccess'
);
assert(
  afterAuthSuccess.includes('isObDoneChecked(session.user.id,8000)'),
  'landing login must check onboarding after confirming the session'
);
assert(
  afterAuthSuccess.indexOf('isObDoneChecked(session.user.id,8000)') <
    afterAuthSuccess.indexOf('if(pendingReturnTo)'),
  'landing login must check onboarding before returnTo navigation'
);
assert(
  afterAuthSuccess.includes("window.location.href='onboarding.html'"),
  'landing login must redirect incomplete onboarding to onboarding.html'
);

const bootFromUrl = between(
  indexHtml,
  'async function bootFromUrl',
  'if(btnClose)btnClose.onclick',
  'index bootFromUrl'
);
assert(
  bootFromUrl.includes('isObDoneChecked(uid,5000)'),
  'URL login bootstrap must fail closed when onboarding cannot be confirmed'
);
assert(
  !bootFromUrl.includes('withTimeout(hasObDone(uid),5000,true)'),
  'URL login bootstrap must not treat onboarding timeout as completed'
);

const sensecornerHtml = read('sensecorner.html');
assert(
  sensecornerHtml.includes('async function scRequireOnboardingCompleted'),
  'hub must expose a fail-closed onboarding helper'
);
const hubLogin = between(
  sensecornerHtml,
  'if(authLoginBtn)authLoginBtn.onclick',
  'if(authRegisterConfirmBtn)authRegisterConfirmBtn.onclick',
  'hub login'
);
assert(
  hubLogin.indexOf('scRequireOnboardingCompleted(session.user.id)') >= 0 &&
    hubLogin.indexOf('scRequireOnboardingCompleted(session.user.id)') <
      hubLogin.indexOf('if(pendingReturnTo)'),
  'hub login must check onboarding before returnTo navigation'
);
const hubReturnTo = between(
  sensecornerHtml,
  'var openedReturnToModal=false',
  'if(!openedReturnToModal)',
  'hub returnTo'
);
assert(
  hubReturnTo.includes('scRequireOnboardingCompleted(user.id)'),
  'hub returnTo redirect for existing sessions must check onboarding'
);

[
  ['datesense.html', 'DATESENSE_ADVICE_CORE_OPTS'],
  ['familysense.html', 'FAMILYSENSE_ADVICE_CORE_OPTS'],
  ['friendsense.html', 'FRIENDSENSE_ADVICE_CORE_OPTS'],
  ['selfsense.html', 'SELFSENSE_ADVICE_CORE_OPTS']
].forEach(([file]) => {
  const html = read(file);
  const bootstrap = between(
    html,
    'async function bootstrapAuthenticated',
    'function showAuthenticatedShell',
    `${file} bootstrap`
  );
  assert(
    bootstrap.includes("try{await loadAll();}catch(e){console.error('loadAll error:',e);return false;}"),
    `${file}: loadAll failure must abort authenticated bootstrap`
  );
  const enter = between(
    html,
    'async function enterAuthenticatedApp',
    'async function handleAuthSignedIn',
    `${file} enterAuthenticatedApp`
  );
  assert(
    !enter.includes('navEarly'),
    `${file}: authenticated shell must not be shown before bootstrap completes`
  );
  const freshBootstrap = between(
    enter,
    '_authBootstrapInFlight=(async function(){',
    '})();',
    `${file} fresh bootstrap`
  );
  assert(
    freshBootstrap.indexOf('bootstrapAuthenticated(session,opts)') <
      freshBootstrap.indexOf('showAuthenticatedShell(opts.screen)'),
    `${file}: authenticated shell must be shown only after bootstrap succeeds`
  );
});

console.log('auth regression checks passed');
