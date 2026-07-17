/**
 * Gateway-Chat: centrale Sensei-chat op de SenseCorner-hub.
 * Pagina levert adapters (auth, toast, open vragen, contacten, profiel-save).
 * Geen em dash (Unicode U+2014) in UI-copy.
 */
(function (global) {
  'use strict';

  var GW_VERTEL_APP = 'gateway';
  var GW_DOMAIN_META = {
    date: { label: 'DateSense', href: 'datesense.html', accent: 'var(--date-donker)', soft: 'color-mix(in srgb,var(--date-licht) 70%,#fff)', icon: '♥' },
    family: { label: 'FamilySense', href: 'familysense.html', accent: 'var(--family-donker)', soft: 'color-mix(in srgb,var(--family-licht) 70%,#fff)', icon: '⌂' },
    friend: { label: 'FriendSense', href: 'friendsense.html', accent: 'var(--friend-donker)', soft: 'color-mix(in srgb,var(--friend-licht) 70%,#fff)', icon: '☺' },
    self: { label: 'SelfSense', href: 'selfsense.html', accent: 'var(--self-donker)', soft: 'color-mix(in srgb,var(--self-licht) 70%,#fff)', icon: '✦' }
  };

  /** Open-profielvragen: zelfde cat-id's / slotvolgorde als OwnSense APP_CATS (vraag_id stabiel). */
  var GW_OPEN_CATS = [
    { id: 'datesense_focus', app: 'ds', prompts: [
      'Wat heb je nodig om je veilig te voelen bij iemand?',
      'Wanneer voel je je het snelst onrustig of onzeker bij iemand.',
      'Val je steeds op hetzelfde type, of merk je iets anders op in hoe je datet?',
      'Wanneer voelt een gesprek met iemand echt goed?',
      'Is er iets dat je de volgende keer anders zou willen doen?'
    ]},
    { id: 'familysense_focus', app: 'fs', prompts: [
      'Wat betekent familie voor jou?',
      'Zijn er problemen thuis waar je vaak op terugbotst?',
      'Welk familielid of welke situatie thuis houdt je het meest bezig?',
      'Is er iemand thuis met wie gesprekken vaak moeilijk verlopen?',
      'Als je één ding kon veranderen thuis, wat zou het zijn?'
    ]},
    { id: 'friendsense_focus', app: 'fr', prompts: [
      'Wat vind je belangrijk in een vriendschap?',
      'Hoe ga je om met meningsverschillen met een vriend?',
      'Wanneer voelt een vriendschap voor jou onevenwichtig?',
      'Wat zou je in vriendschappen prettiger willen maken?',
      'Wie of wat mis je soms in hoe je nu omgaat met vrienden?'
    ]},
    { id: 'selfsense_focus', app: 'ss', prompts: [
      'Wat houdt je op dit moment het meest bezig? Wat heeft je hierheen gebracht?',
      'Wat zou voor jou nu een goede dag zijn? Of een dag die meevalt?',
      'Wat wil je graag bereiken? Of voelt bereiken te veel als druk?',
      'Wat werkt absoluut niet voor jou?',
      'Hoe voel je je op dit moment?',
      'Heb je dingen waar je op kan terugvallen? Mensen, gewoontes, plekken, professionele hulp, wat voor jou werkt.'
    ]}
  ];

  var adapters = null;
  var gwState = {
    open: false,
    busy: false,
    sessionId: null,
    bridgeShown: false,
    profileQuestionAsked: false,
    messages: [],
    domainSummaries: { date: '', family: '', friend: '', self: '' },
    pendingProfileQ: null,
    coreReady: false
  };
  var _gwSenseiCooldownUntil = 0;
  var _bound = false;

  function A() { return adapters || {}; }
  function toast(msg, isError, opts) {
    if (typeof A().toast === 'function') A().toast(msg, isError, opts);
    else if (isError) console.warn('[Gateway]', msg);
  }
  function formatErr(e, fallback) {
    if (typeof A().formatError === 'function') return A().formatError(e, fallback);
    var msg = String((e && e.message) || e || '').trim();
    return msg || fallback || 'Onbekende fout.';
  }
  function getClient() {
    return typeof A().getSupabase === 'function' ? A().getSupabase() : null;
  }
  function getUidSync() {
    return String(typeof A().getUid === 'function' ? (A().getUid() || '') : '').trim();
  }
  async function ensureUid(client) {
    if (typeof A().ensureWriteAuth === 'function') {
      var wa = await A().ensureWriteAuth(client || getClient());
      return String((wa && wa.uid) || getUidSync() || '').trim();
    }
    return getUidSync();
  }
  function edgeBase() {
    var u = typeof A().getEdgeBaseUrl === 'function' ? A().getEdgeBaseUrl() : '';
    return String(u || global.SURL || global.SUPABASE_URL || 'https://ghuqjtdrkwssyqvcubcd.supabase.co').replace(/\/$/, '');
  }

  function senseiCoreReady() {
    return !!(global.SenseiCore && global.SenseiCore.buildGatewaySystemPrompt);
  }
  async function loadSenseiCoreOverrides() {
    var out = { grondregels: null, dunne_context: null, crisis: null, redflags_rubriek: null };
    var client = getClient();
    var uid = getUidSync();
    if (!client || !uid) return out;
    try {
      var rs = await client.from('sensei_core_overrides').select('key,value');
      if (rs && rs.error) throw rs.error;
      (rs.data || []).forEach(function (row) {
        var k = String(row.key || '').trim();
        var v = String(row.value || '').trim();
        if (k && v && Object.prototype.hasOwnProperty.call(out, k)) out[k] = v;
      });
    } catch (e) { console.warn('loadSenseiCoreOverrides', e); }
    return out;
  }
  async function ensureGatewaySenseiCore() {
    if (gwState.coreReady && senseiCoreReady()) return true;
    var tries = 0;
    while (!senseiCoreReady() && tries < 50) {
      await new Promise(function (r) { setTimeout(r, 20); });
      tries++;
    }
    if (!senseiCoreReady()) {
      console.warn('SenseiCore niet geladen; gateway gebruikt fallback-prompt');
      return false;
    }
    try {
      var overrides = await loadSenseiCoreOverrides();
      global.SenseiCore.setCoreOverrides(overrides);
      gwState.coreReady = true;
      return true;
    } catch (e) {
      console.warn('ensureGatewaySenseiCore', e);
      return false;
    }
  }

  function gwVoornaam() {
    var n = String(typeof A().getDisplayName === 'function' ? (A().getDisplayName() || '') : '').trim();
    if (!n) return '';
    return n.split(/\s+/)[0];
  }
  function updateGatewayTalkbarPlaceholder() {
    var inp = document.getElementById('gatewayTalkbarInput');
    if (!inp) return;
    var vn = gwVoornaam();
    inp.placeholder = vn ? ('Wat houdt je bezig, ' + vn + '?') : 'Wat houdt je bezig?';
    inp.setAttribute('aria-label', inp.placeholder);
  }
  function gwNormDomain(d) {
    d = String(d || '').trim().toLowerCase();
    return GW_DOMAIN_META[d] ? d : '';
  }
  function gwAppMeta(domain) {
    return GW_DOMAIN_META[gwNormDomain(domain)] || { label: 'SenseCorner', href: 'sensecorner.html', accent: 'var(--r, #5E7D5A)', soft: 'rgba(94,125,90,.14)', icon: '先生' };
  }
  function gwEsc(s) {
    if (typeof global.senseEscHtml === 'function') return global.senseEscHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function gwScrollMessages() {
    var el = document.getElementById('gatewayMessages');
    if (el) el.scrollTop = el.scrollHeight;
  }
  function gwStripAttrMarkers(text) {
    var s = String(text || '');
    s = s.replace(/\[VOORSTEL\b[^\]]*\]/gi, '');
    s = s.replace(/\[PROFIELVRAAG\b[^\]]*\]/gi, '');
    s = s.replace(/\[BRUG\b[^\]]*\]/gi, '');
    s = s.replace(/\[CRISIS\]/gi, '');
    return s.replace(/\n{3,}/g, '\n\n').trim();
  }
  function gwParseAttr(block, name) {
    var re = new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i');
    var m = String(block || '').match(re);
    return m ? String(m[1] || '').trim() : '';
  }
  function gwParseMarkers(raw) {
    var crisisRes = typeof global.senseExtractCrisisFlag === 'function'
      ? global.senseExtractCrisisFlag(raw)
      : { crisis: false, text: String(raw || '') };
    var text = String(crisisRes.text || '');
    var crisis = !!crisisRes.crisis;
    var proposal = null;
    var profileQ = null;
    var bridge = null;
    if (!crisis) {
      var mProp = text.match(/\[VOORSTEL\b([^\]]*)\]/i);
      if (mProp) {
        var dom = gwNormDomain(gwParseAttr(mProp[1], 'domein'));
        var tekst = gwParseAttr(mProp[1], 'tekst');
        var dos = gwParseAttr(mProp[1], 'dossier');
        if (dom && tekst) proposal = { domain: dom, text: tekst, dossier: dos || '' };
      }
      var mProf = text.match(/\[PROFIELVRAAG\b([^\]]*)\]/i);
      if (mProf) {
        var pDom = gwNormDomain(gwParseAttr(mProf[1], 'domein'));
        var qId = gwParseAttr(mProf[1], 'vraag_id');
        if (pDom) profileQ = { domain: pDom, vraagId: qId };
      }
      var mBrug = text.match(/\[BRUG\b([^\]]*)\]/i);
      if (mBrug) {
        var bDom = gwNormDomain(gwParseAttr(mBrug[1], 'domein'));
        var reden = gwParseAttr(mBrug[1], 'reden');
        if (bDom) bridge = { domain: bDom, reason: reden || 'Hier zit meer in dan een kort gesprek aankan.' };
      }
    }
    return {
      crisis: crisis,
      text: gwStripAttrMarkers(text),
      proposal: crisis ? null : proposal,
      profileQuestion: crisis ? null : profileQ,
      bridge: crisis ? null : bridge
    };
  }

  function gwCollectOpenQuestions() {
    var out = [];
    var appToDomain = { ds: 'date', fs: 'family', fr: 'friend', ss: 'self' };
    var getSlots = typeof A().getCategorySlots === 'function' ? A().getCategorySlots : null;
    GW_OPEN_CATS.forEach(function (cat) {
      if (out.length >= 3) return;
      var domain = appToDomain[cat.app] || '';
      if (!domain) return;
      var slots = getSlots ? (getSlots(cat.id) || {}) : {};
      for (var i = 0; i < (cat.prompts || []).length; i++) {
        if (out.length >= 3) break;
        var key = 'a' + i;
        if (String(slots[key] || '').trim()) continue;
        var q = String(cat.prompts[i] || '').trim();
        if (!q) continue;
        out.push({ domein: domain, vraagId: cat.id + ':' + key, vraag: q });
      }
    });
    return out;
  }
  function gwOwnProfielBlock() {
    if (typeof A().getOwnProfielBlock === 'function') {
      return String(A().getOwnProfielBlock() || '').trim();
    }
    return '';
  }
  function gwFallbackSystemPrompt(ctx) {
    var crisis = (typeof global.senseGetCrisisRegelText === 'function')
      ? global.senseGetCrisisRegelText()
      : 'CRISIS: Bij signalen van zelfdoding of acuut gevaar: start je antwoord met [CRISIS] en wijs warm door naar hulp.';
    var block = '';
    try {
      if (global.SenseiCore && global.SenseiCore.buildGatewayContextBlock) {
        block = global.SenseiCore.buildGatewayContextBlock(ctx || {});
      }
    } catch (_e) {}
    return 'Je bent Sensei, de centrale gids van SenseCorner. Antwoord warm in het Nederlands. Schrijf nooit zelf iets weg zonder bevestiging. Gebruik nooit Unicode U+2014.\n\n'
      + crisis + '\n\n' + (block || '');
  }
  function gwContactNamesByDomain() {
    return {
      date: gwContactsForDomain('date'),
      family: gwContactsForDomain('family'),
      friend: gwContactsForDomain('friend')
    };
  }
  async function gwBuildSystemPrompt() {
    var aandacht = '';
    if (typeof A().refreshAandachtspunten === 'function') {
      try { await A().refreshAandachtspunten(); } catch (_a) {}
    }
    if (typeof A().getAandachtspuntenBlock === 'function') {
      aandacht = String(A().getAandachtspuntenBlock() || '').trim();
    } else {
      aandacht = String(global._ownAandachtspuntenCoachContext || '').trim();
    }
    var ctx = {
      ownProfielBlock: gwOwnProfielBlock(),
      aandachtspuntenBlock: aandacht,
      domainSummaries: gwState.domainSummaries,
      contactNamesByDomain: gwContactNamesByDomain(),
      openQuestions: gwState.profileQuestionAsked ? [] : gwCollectOpenQuestions(),
      profileQuestionAsked: !!gwState.profileQuestionAsked,
      bridgeShown: !!gwState.bridgeShown,
      isFirstTurn: gwState.messages.filter(function (m) { return m.role === 'assistant'; }).length === 0
    };
    await ensureGatewaySenseiCore();
    if (senseiCoreReady()) {
      try { return global.SenseiCore.buildGatewaySystemPrompt(ctx); } catch (_e) {}
    }
    return gwFallbackSystemPrompt(ctx);
  }
  async function gwLoadDomainSummaries() {
    var client = getClient();
    var uid = getUidSync();
    if (!client || !uid) return;
    try {
      var res = await client.from('domain_summaries').select('domain,summary').eq('user_id', uid);
      if (res && res.error) throw res.error;
      var map = { date: '', family: '', friend: '', self: '' };
      (res.data || []).forEach(function (row) {
        var d = gwNormDomain(row.domain);
        if (d) map[d] = String(row.summary || '').trim();
      });
      gwState.domainSummaries = map;
    } catch (e) { console.warn('gwLoadDomainSummaries', e); }
  }
  async function gwRequestSummariesRefresh() {
    try {
      var token = typeof A().getAccessToken === 'function' ? await A().getAccessToken(false) : '';
      if (!token) return;
      fetch(edgeBase() + '/functions/v1/sensei-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ gateway_summaries: true })
      }).then(function (r) {
        if (r && r.ok) return gwLoadDomainSummaries();
      }).catch(function () {});
    } catch (_e) {}
  }
  async function gwEnsureSession(previewText) {
    if (gwState.sessionId) return gwState.sessionId;
    var client = getClient();
    var uid = await ensureUid(client);
    if (!client || !uid) return null;
    try {
      var preview = String(previewText || 'Gateway-gesprek').trim().substring(0, 80);
      var res = await client.from('sense_sessions').insert({
        user_id: uid,
        preview: preview,
        updated_at: new Date().toISOString(),
        vertel_app: GW_VERTEL_APP,
        bridge_shown: false,
        profile_question_asked: false
      }).select('id,bridge_shown,profile_question_asked').single();
      if (res && res.error) throw res.error;
      if (res && res.data && res.data.id) {
        gwState.sessionId = res.data.id;
        gwState.bridgeShown = !!res.data.bridge_shown;
        gwState.profileQuestionAsked = !!res.data.profile_question_asked;
        return gwState.sessionId;
      }
    } catch (e) { console.warn('gwEnsureSession', e); }
    return null;
  }
  async function gwSaveMsg(role, content) {
    if (!gwState.sessionId) return;
    var client = getClient();
    var uid = getUidSync() || await ensureUid(client);
    if (!client || !uid) return;
    try {
      await client.from('sense_session_msgs').insert({
        session_id: gwState.sessionId,
        user_id: uid,
        role: role,
        content: String(content || ''),
        created_at: new Date().toISOString()
      });
      await client.from('sense_sessions').update({
        updated_at: new Date().toISOString(),
        preview: String(content || '').trim().substring(0, 80)
      }).eq('id', gwState.sessionId).eq('user_id', uid).eq('vertel_app', GW_VERTEL_APP);
    } catch (e) { console.warn('gwSaveMsg', e); }
  }
  async function gwSetSessionFlag(field, value) {
    if (!gwState.sessionId) return;
    var client = getClient();
    var uid = getUidSync() || await ensureUid(client);
    if (!client || !uid) return;
    var patch = { updated_at: new Date().toISOString() };
    patch[field] = !!value;
    try {
      await client.from('sense_sessions').update(patch)
        .eq('id', gwState.sessionId).eq('user_id', uid).eq('vertel_app', GW_VERTEL_APP);
    } catch (e) { console.warn('gwSetSessionFlag', e); }
  }

  function gwAddUserBubble(text) {
    var box = document.getElementById('gatewayMessages');
    if (!box) return;
    var m = document.createElement('div');
    m.className = 'gw-msg user';
    m.innerHTML = '<div class="gw-bubble"></div>';
    m.querySelector('.gw-bubble').textContent = text;
    box.appendChild(m);
    gwScrollMessages();
  }
  function gwAddSenseiBubble(text, tagLabel, tagColor) {
    var box = document.getElementById('gatewayMessages');
    if (!box) return;
    var m = document.createElement('div');
    m.className = 'gw-msg sensei';
    if (tagLabel) {
      var t = document.createElement('div');
      t.className = 'gw-tag';
      t.textContent = tagLabel;
      if (tagColor) t.style.color = tagColor;
      m.appendChild(t);
    }
    var b = document.createElement('div');
    b.className = 'gw-bubble';
    b.textContent = text;
    m.appendChild(b);
    box.appendChild(m);
    gwScrollMessages();
  }
  function gwShowTyping() {
    var box = document.getElementById('gatewayMessages');
    if (!box) return null;
    var t = document.createElement('div');
    t.className = 'gw-typing';
    t.setAttribute('aria-label', 'Sensei typt');
    t.innerHTML = '<i></i><i></i><i></i>';
    box.appendChild(t);
    gwScrollMessages();
    return t;
  }
  function gwAddCrisisCard() {
    var box = document.getElementById('gatewayMessages');
    if (!box) return;
    var wrap = document.createElement('div');
    wrap.className = 'gw-crisis-wrap';
    wrap.innerHTML = typeof global.senseRenderCrisisCardHtml === 'function'
      ? global.senseRenderCrisisCardHtml()
      : '<div class="sense-crisis-card">Zoek hulp: Zelfmoordlijn 1813, Tele-Onthaal 106, of 112.</div>';
    box.appendChild(wrap);
    gwScrollMessages();
  }

  function gwDomainScopeKey(domain) {
    if (typeof global.senseGatewayDomainScopeKey === 'function') return global.senseGatewayDomainScopeKey(domain);
    var d = gwNormDomain(domain);
    if (d === 'date') return 'ds';
    if (d === 'family') return 'fs';
    if (d === 'friend') return 'fr';
    if (d === 'self') return 'ss';
    return '';
  }
  function gwContactsForDomain(domain) {
    if (typeof A().getContactsForDomain === 'function') {
      var list = A().getContactsForDomain(domain) || [];
      return Array.isArray(list) ? list.slice() : [];
    }
    return [];
  }
  function gwResolveDossierName(domain, hint, proposalText) {
    var contacts = gwContactsForDomain(domain);
    if (!contacts.length) return '';
    var h = String(hint || '').trim();
    if (h) {
      for (var i = 0; i < contacts.length; i++) {
        if (contacts[i].toLowerCase() === h.toLowerCase()) return contacts[i];
      }
      for (var j = 0; j < contacts.length; j++) {
        var c = contacts[j];
        if (c.toLowerCase().indexOf(h.toLowerCase()) === 0 || h.toLowerCase().indexOf(c.toLowerCase()) === 0) return c;
      }
    }
    var blob = (' ' + String(proposalText || '') + ' ').toLowerCase();
    var hits = [];
    contacts.forEach(function (c) {
      var token = c.toLowerCase();
      if (token.length < 2) return;
      if (blob.indexOf(' ' + token + ' ') >= 0 || blob.indexOf(token) >= 0) hits.push(c);
    });
    if (hits.length === 1) return hits[0];
    return '';
  }
  function gwLandingLabel(domain, targetProfile) {
    var meta = gwAppMeta(domain);
    var landing = typeof global.senseGatewayProposalLandingProfile === 'function'
      ? global.senseGatewayProposalLandingProfile(domain, targetProfile)
      : (gwNormDomain(domain) === 'self' ? 'OWN Sense' : String(targetProfile || '').trim());
    if (landing && !/^own\s*sense$/i.test(landing)) return landing + ' · ' + meta.label;
    if (landing && /^own\s*sense$/i.test(landing) && gwNormDomain(domain) === 'self') return meta.label;
    if (landing && /^own\s*sense$/i.test(landing)) return 'OWN Sense · ' + meta.label;
    return meta.label + ' (Sensei onthoudt dit)';
  }

  function gwRenderProposalCard(opts) {
    opts = opts || {};
    var domain = gwNormDomain(opts.domain) || 'self';
    var meta = gwAppMeta(domain);
    var text = String(opts.text || '').trim();
    if (!text) return;
    var proposalId = opts.proposalId || null;
    var isProfile = !!opts.isProfileUpdate;
    var targetProfile = String(opts.targetProfile || '').trim();
    if (!targetProfile && !isProfile) {
      targetProfile = gwResolveDossierName(domain, opts.dossier || '', text);
    }
    if (domain === 'self' && !isProfile) targetProfile = 'OWN Sense';
    var contacts = (!isProfile && domain !== 'self') ? gwContactsForDomain(domain) : [];
    var needsPicker = !isProfile && domain !== 'self' && !targetProfile;
    var box = document.getElementById('gatewayMessages');
    if (!box) return;
    var card = document.createElement('div');
    card.className = 'gw-proposal';
    card.style.setProperty('--gw-accent', meta.accent);
    card.style.setProperty('--gw-soft', meta.soft);
    var dossierHtml = '';
    if (needsPicker || (contacts.length && domain !== 'self' && !isProfile)) {
      var optsHtml = '<option value="">Kies dossier…</option>';
      contacts.forEach(function (nm) {
        var sel = targetProfile && nm.toLowerCase() === targetProfile.toLowerCase() ? ' selected' : '';
        optsHtml += '<option value="' + gwEsc(nm) + '"' + sel + '>' + gwEsc(nm) + '</option>';
      });
      optsHtml += '<option value="__own__"' + (targetProfile && /^own\s*sense$/i.test(targetProfile) ? ' selected' : '') + '>OWN Sense (over mij)</option>';
      optsHtml += '<option value="__domain__"' + (needsPicker && !targetProfile ? ' selected' : '') + '>Alleen Sensei in ' + gwEsc(meta.label) + '</option>';
      dossierHtml =
        '<div class="gw-dossier-row">' +
          '<label for="gw-dos-' + gwEsc(String(proposalId || Date.now())) + '">Waar noteren?</label>' +
          '<select id="gw-dos-' + gwEsc(String(proposalId || Date.now())) + '" class="gw-dossier-select">' + optsHtml + '</select>' +
          '<span class="gw-dossier-hint">Contactdossier voedt later advies over die persoon. Zonder dossier onthoudt Sensei het op domeinniveau.</span>' +
        '</div>';
    } else if (targetProfile && domain !== 'self' && !isProfile) {
      dossierHtml = '<div class="gw-dossier-hint" style="margin:0 0 8px">Dossier: <strong>' + gwEsc(targetProfile) + '</strong></div>';
    }
    var yesLabel = isProfile
      ? ('Noteer in ' + meta.label)
      : (targetProfile && !/^own\s*sense$/i.test(targetProfile)
        ? ('Noteer bij ' + targetProfile)
        : ('Noteer in ' + meta.label));
    card.innerHTML =
      '<div class="gw-p-label">' + (isProfile ? 'Profielupdate · ' : 'Voorstel · ') + gwEsc(meta.label) + '</div>' +
      '<div class="gw-p-text"></div>' +
      dossierHtml +
      '<div class="gw-p-actions">' +
        '<button type="button" class="gw-yes">' + gwEsc(yesLabel) + '</button>' +
        '<button type="button" class="gw-no">Liever niet</button>' +
      '</div>' +
      '<div class="gw-done">✓ Genoteerd · jij houdt de regie</div>';
    card.querySelector('.gw-p-text').textContent = text;
    var yesBtn = card.querySelector('.gw-yes');
    var noBtn = card.querySelector('.gw-no');
    var dosSel = card.querySelector('.gw-dossier-select');
    function readChosenProfile() {
      if (isProfile || domain === 'self') return domain === 'self' ? 'OWN Sense' : '';
      if (dosSel) {
        var v = String(dosSel.value || '').trim();
        if (v === '__domain__') return '';
        if (v === '__own__') return 'OWN Sense';
        return v;
      }
      return targetProfile || '';
    }
    if (dosSel) {
      dosSel.addEventListener('change', function () {
        var chosen = readChosenProfile();
        yesBtn.textContent = chosen && !/^own\s*sense$/i.test(chosen)
          ? ('Noteer bij ' + chosen)
          : ('Noteer in ' + meta.label);
      });
    }
    yesBtn.addEventListener('click', async function () {
      if (card.classList.contains('confirmed') || card.classList.contains('declined')) return;
      var chosen = readChosenProfile();
      if (needsPicker && dosSel && !String(dosSel.value || '').trim()) {
        toast('Kies eerst waar dit genoteerd mag worden.', true);
        return;
      }
      yesBtn.disabled = true; noBtn.disabled = true;
      if (dosSel) dosSel.disabled = true;
      try {
        await gwResolveProposal({
          proposalId: proposalId,
          domain: domain,
          text: text,
          status: 'confirmed',
          targetProfile: chosen,
          isProfileUpdate: isProfile,
          vraagId: opts.vraagId || ''
        });
        card.classList.add('confirmed');
        var done = card.querySelector('.gw-done');
        if (done) done.textContent = '✓ Genoteerd in ' + gwLandingLabel(domain, chosen) + ' · jij houdt de regie';
        toast('Genoteerd in ' + gwLandingLabel(domain, chosen), false, { durationMs: 3200 });
      } catch (e) {
        yesBtn.disabled = false; noBtn.disabled = false;
        if (dosSel) dosSel.disabled = false;
        toast(formatErr(e, 'Kon voorstel niet bevestigen.'), true);
      }
    });
    noBtn.addEventListener('click', async function () {
      if (card.classList.contains('confirmed') || card.classList.contains('declined')) return;
      yesBtn.disabled = true; noBtn.disabled = true;
      if (dosSel) dosSel.disabled = true;
      try {
        await gwResolveProposal({
          proposalId: proposalId,
          domain: domain,
          text: text,
          status: 'declined',
          targetProfile: readChosenProfile(),
          isProfileUpdate: isProfile
        });
        card.classList.add('declined');
        card.querySelector('.gw-done').textContent = 'Niet genoteerd · jij houdt de regie';
      } catch (e) {
        yesBtn.disabled = false; noBtn.disabled = false;
        if (dosSel) dosSel.disabled = false;
        toast(formatErr(e, 'Kon voorstel niet afwijzen.'), true);
      }
    });
    box.appendChild(card);
    gwScrollMessages();
  }

  async function gwInsertProposalRow(domain, text, targetProfile) {
    var client = getClient();
    var uid = await ensureUid(client);
    if (!client || !uid) throw new Error('Niet ingelogd.');
    var row = {
      user_id: uid,
      conversation_id: gwState.sessionId || null,
      target_domain: domain,
      proposal_text: String(text || '').substring(0, 1000),
      status: 'proposed'
    };
    var tp = String(targetProfile || '').trim().substring(0, 120);
    if (tp) row.target_profile = tp;
    var res = await client.from('gateway_proposals').insert(row).select('id').single();
    if (res && res.error) {
      if (tp && /target_profile|column/i.test(String(res.error.message || ''))) {
        delete row.target_profile;
        res = await client.from('gateway_proposals').insert(row).select('id').single();
      }
      if (res && res.error) throw res.error;
    }
    return res && res.data && res.data.id ? res.data.id : null;
  }
  async function gwResolveProposal(opts) {
    opts = opts || {};
    var client = getClient();
    var uid = await ensureUid(client);
    if (!client || !uid) throw new Error('Niet ingelogd.');
    var status = opts.status === 'confirmed' ? 'confirmed' : 'declined';
    var proposalId = opts.proposalId;
    var targetProfile = String(opts.targetProfile || '').trim().substring(0, 120);
    if (gwNormDomain(opts.domain) === 'self' && status === 'confirmed' && !opts.isProfileUpdate) {
      targetProfile = 'OWN Sense';
    }
    var patch = {
      status: status,
      resolved_at: new Date().toISOString()
    };
    if (targetProfile) patch.target_profile = targetProfile;
    else if (status === 'confirmed') patch.target_profile = null;
    if (!proposalId) {
      var insRow = {
        user_id: uid,
        conversation_id: gwState.sessionId || null,
        target_domain: opts.domain,
        proposal_text: String(opts.text || '').substring(0, 1000),
        status: status,
        resolved_at: patch.resolved_at
      };
      if (targetProfile) insRow.target_profile = targetProfile;
      var ins = await client.from('gateway_proposals').insert(insRow).select('id').single();
      if (ins && ins.error) {
        if (insRow.target_profile && /target_profile|column/i.test(String(ins.error.message || ''))) {
          delete insRow.target_profile;
          ins = await client.from('gateway_proposals').insert(insRow).select('id').single();
        }
        if (ins && ins.error) throw ins.error;
      }
      proposalId = ins && ins.data && ins.data.id;
    } else {
      var up = await client.from('gateway_proposals').update(patch)
        .eq('id', proposalId).eq('user_id', uid);
      if (up && up.error) {
        if (Object.prototype.hasOwnProperty.call(patch, 'target_profile') && /target_profile|column/i.test(String(up.error.message || ''))) {
          delete patch.target_profile;
          up = await client.from('gateway_proposals').update(patch)
            .eq('id', proposalId).eq('user_id', uid);
        }
        if (up && up.error) throw up.error;
      }
    }
    if (status === 'confirmed' && opts.isProfileUpdate && opts.vraagId) {
      await gwApplyProfileAnswer(opts.vraagId, opts.text);
    }
    if (status === 'confirmed' && !opts.isProfileUpdate && proposalId && typeof global.senseIngestConfirmedGatewayProposals === 'function') {
      try {
        await global.senseIngestConfirmedGatewayProposals({
          sb: client,
          userId: uid,
          domain: opts.domain,
          rows: [{
            id: proposalId,
            proposal_text: opts.text,
            target_profile: targetProfile || null,
            target_domain: opts.domain,
            status: 'confirmed'
          }]
        });
      } catch (ingErr) { console.warn('gw ingest dossier', ingErr); }
    }
    return proposalId;
  }
  async function gwApplyProfileAnswer(vraagId, answer) {
    var parts = String(vraagId || '').split(':');
    if (parts.length < 2) return;
    var catId = parts[0];
    var key = parts[1];
    if (!/^a\d+$/.test(key)) return;
    if (typeof A().saveProfileAnswer === 'function') {
      try { await A().saveProfileAnswer(catId, key, String(answer || '').trim().substring(0, 2000)); }
      catch (e) { console.warn('gw profile save', e); }
    }
  }

  function gwRenderBridgeCard(bridge) {
    if (!bridge || gwState.bridgeShown) return;
    var domain = gwNormDomain(bridge.domain);
    if (!domain) return;
    var meta = gwAppMeta(domain);
    var box = document.getElementById('gatewayMessages');
    if (!box) return;
    var card = document.createElement('div');
    card.className = 'gw-bridge';
    card.style.setProperty('--gw-accent', meta.accent);
    card.style.setProperty('--gw-soft', meta.soft);
    card.innerHTML =
      '<div class="gw-b-top"><div class="gw-b-icon" aria-hidden="true">' + gwEsc(meta.icon) + '</div><h4>Hier zit meer in</h4></div>' +
      '<p class="gw-b-reason"></p>' +
      '<button type="button" class="gw-b-go">Verdiepen in ' + gwEsc(meta.label) + '</button>' +
      '<p class="gw-b-note">Je gesprek gaat mee, je hoeft niets te herhalen.</p>';
    card.querySelector('.gw-b-reason').textContent = String(bridge.reason || '').trim() || ('In ' + meta.label + ' kunnen we dit rustiger uitwerken.');
    var goBtn = card.querySelector('.gw-b-go');
    goBtn.addEventListener('click', async function () {
      goBtn.disabled = true;
      try {
        await gwOpenBridgeHandoff(domain);
      } catch (e) {
        goBtn.disabled = false;
        toast(formatErr(e, 'Kon de brug niet openen.'), true);
      }
    });
    box.appendChild(card);
    gwScrollMessages();
    gwState.bridgeShown = true;
    gwSetSessionFlag('bridge_shown', true);
  }
  function gwBuildHandoffSummary() {
    var bits = [];
    gwState.messages.slice(-8).forEach(function (m) {
      var role = m.role === 'assistant' ? 'Sensei' : 'Jij';
      bits.push(role + ': ' + String(m.content || '').replace(/\s+/g, ' ').trim().substring(0, 220));
    });
    return bits.join('\n').substring(0, 1800) || 'Gateway-gesprek over dit domein.';
  }
  async function gwOpenBridgeHandoff(domain) {
    var client = getClient();
    var uid = await ensureUid(client);
    if (!client || !uid) throw new Error('Niet ingelogd.');
    var meta = gwAppMeta(domain);
    var res = await client.from('bridge_handoffs').insert({
      user_id: uid,
      target_domain: domain,
      context_summary: gwBuildHandoffSummary()
    }).select('id').single();
    if (res && res.error) throw res.error;
    var id = res && res.data && res.data.id;
    if (!id) throw new Error('Handoff aanmaken mislukt.');
    global.location.href = meta.href + '?handoff=' + encodeURIComponent(id);
  }

  async function gwHandleParsedReply(parsed, opts) {
    opts = opts || {};
    if (parsed.crisis) {
      gwAddCrisisCard();
      if (parsed.text) gwAddSenseiBubble(parsed.text);
      return;
    }
    var allowProfile = !opts.isFirstTurn && !gwState.profileQuestionAsked;
    var allowBridge = !opts.isFirstTurn && !gwState.bridgeShown;
    var tag = null;
    var tagColor = null;
    if (parsed.profileQuestion && allowProfile) {
      var pMeta = gwAppMeta(parsed.profileQuestion.domain);
      tag = 'Profielvraag · ' + pMeta.label;
      tagColor = pMeta.accent;
      gwState.pendingProfileQ = parsed.profileQuestion;
      gwState.profileQuestionAsked = true;
      gwSetSessionFlag('profile_question_asked', true);
    }
    if (parsed.text) gwAddSenseiBubble(parsed.text, tag, tagColor);
    if (parsed.proposal) {
      var resolvedDos = gwResolveDossierName(
        parsed.proposal.domain,
        parsed.proposal.dossier || '',
        parsed.proposal.text
      );
      if (gwNormDomain(parsed.proposal.domain) === 'self') resolvedDos = 'OWN Sense';
      var pid = null;
      try {
        pid = await gwInsertProposalRow(parsed.proposal.domain, parsed.proposal.text, resolvedDos || parsed.proposal.dossier || '');
      } catch (e) { console.warn('gwInsertProposalRow', e); }
      gwRenderProposalCard({
        domain: parsed.proposal.domain,
        text: parsed.proposal.text,
        proposalId: pid,
        dossier: parsed.proposal.dossier || '',
        targetProfile: resolvedDos
      });
    }
    if (parsed.bridge && allowBridge) {
      gwRenderBridgeCard(parsed.bridge);
    }
  }

  function senseiApiErrorMessage(j, status) {
    if (j && j.error) {
      if (typeof j.error === 'string') return j.error;
      if (j.error.message) return String(j.error.message);
    }
    if (j && j.message) return String(j.message);
    return 'HTTP ' + status;
  }
  async function callGatewayAi(systemPrompt, apiMsgs, maxTokens) {
    if (typeof A().callGatewayAi === 'function') {
      return A().callGatewayAi(systemPrompt, apiMsgs, maxTokens);
    }
    var token = typeof A().getAccessToken === 'function' ? await A().getAccessToken(false) : '';
    if (!token) throw new Error('Je sessie is verlopen. Log opnieuw in via SenseCorner.');
    var timeoutMs = 90000;
    var controller = new AbortController();
    var outerTimer = setTimeout(function () {
      try { controller.abort(); } catch (_e) {}
    }, timeoutMs);
    var reqBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens || 700,
      system: systemPrompt || '',
      messages: apiMsgs,
      gateway: true
    };
    try {
      var r = await fetch(edgeBase() + '/functions/v1/sensei-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify(reqBody),
        signal: controller.signal
      });
      if (r.status === 401 && typeof A().getAccessToken === 'function') {
        try {
          var fresh = await A().getAccessToken(true);
          if (fresh) {
            r = await fetch(edgeBase() + '/functions/v1/sensei-chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + fresh
              },
              body: JSON.stringify(reqBody),
              signal: controller.signal
            });
          }
        } catch (_re) {}
      }
      clearTimeout(outerTimer);
      outerTimer = null;
      var raw = await r.text();
      var j;
      try { j = JSON.parse(raw); } catch (_pe) {
        throw new Error('Ongeldig antwoord van API (geen JSON).');
      }
      if (!r.ok) {
        var apiMsg = senseiApiErrorMessage(j, r.status);
        if (r.status === 403) apiMsg = 'AI toegang nog niet geactiveerd. Vraag admin approval in SenseCorner.';
        if (r.status === 429) _gwSenseiCooldownUntil = Date.now() + 120000;
        throw new Error(apiMsg);
      }
      if (j && j.error) throw new Error(senseiApiErrorMessage(j, r.status) || 'AI-fout');
      var txt = '';
      if (j && Array.isArray(j.content)) {
        j.content.forEach(function (c) { if (c && c.type === 'text') txt += String(c.text || ''); });
      }
      if (!String(txt || '').trim() && j && j.content && j.content[0] && j.content[0].text) {
        txt = String(j.content[0].text || '');
      }
      txt = String(txt || '').trim();
      if (!txt) throw new Error('Leeg AI antwoord ontvangen.');
      return txt;
    } catch (e) {
      if (e && e.name === 'AbortError') {
        throw new Error('AI request timeout (' + Math.round(timeoutMs / 1000) + 's). Probeer opnieuw.');
      }
      throw e;
    } finally {
      if (outerTimer) clearTimeout(outerTimer);
    }
  }

  async function gwSendMessage(userText) {
    userText = String(userText || '').trim();
    if (!userText || gwState.busy) return;
    if (_gwSenseiCooldownUntil && Date.now() < _gwSenseiCooldownUntil) {
      toast('Even geduld: de AI-limiet is net bereikt. Probeer over een paar minuten opnieuw.', true);
      return;
    }
    if (!getUidSync()) {
      if (typeof A().requireLogin === 'function') A().requireLogin();
      else toast('Log eerst in via SenseCorner.', true);
      return;
    }
    gwState.busy = true;
    var sendBtn = document.getElementById('gatewayChatSend');
    if (sendBtn) sendBtn.disabled = true;
    var pendingProfile = gwState.pendingProfileQ;
    gwState.pendingProfileQ = null;

    gwAddUserBubble(userText);
    gwState.messages.push({ role: 'user', content: userText });
    await gwEnsureSession(userText);
    await gwSaveMsg('user', userText);

    var typing = gwShowTyping();
    try {
      var system = await gwBuildSystemPrompt();
      var apiMsgs = gwState.messages.map(function (m) {
        return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content };
      });
      var raw = await callGatewayAi(system, apiMsgs, 700);
      if (typing && typing.parentNode) typing.remove();
      var parsed = gwParseMarkers(raw);
      var isFirstTurn = gwState.messages.filter(function (m) { return m.role === 'assistant'; }).length === 0;
      gwState.messages.push({ role: 'assistant', content: parsed.text || String(raw || '') });
      await gwSaveMsg('assistant', parsed.text || String(raw || ''));
      await gwHandleParsedReply(parsed, { isFirstTurn: isFirstTurn });

      if (pendingProfile && pendingProfile.domain && !parsed.crisis) {
        var ansText = userText.substring(0, 500);
        var labelQ = pendingProfile.vraagId ? 'Antwoord op profielvraag: ' + ansText : ansText;
        var pid2 = null;
        try { pid2 = await gwInsertProposalRow(pendingProfile.domain, labelQ); } catch (_e2) {}
        gwRenderProposalCard({
          domain: pendingProfile.domain,
          text: labelQ,
          proposalId: pid2,
          isProfileUpdate: true,
          vraagId: pendingProfile.vraagId || ''
        });
      }
    } catch (e) {
      if (typing && typing.parentNode) typing.remove();
      toast(formatErr(e, 'Sensei kon nu niet antwoorden. Probeer opnieuw.'), true);
    } finally {
      gwState.busy = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  async function openGatewayChat(prefill) {
    var chat = document.getElementById('gatewayChat');
    if (!chat) return;
    if (!getUidSync()) {
      if (typeof A().requireLogin === 'function') A().requireLogin();
      else toast('Log eerst in om met Sensei te praten.', true);
      return;
    }
    var firstOpen = !gwState.open;
    gwState.open = true;
    chat.classList.add('open');
    chat.setAttribute('aria-hidden', 'false');
    updateGatewayTalkbarPlaceholder();
    if (firstOpen || !gwState.sessionId) {
      await ensureGatewaySenseiCore();
      try {
        var uid = getUidSync();
        if (uid && typeof A().loadProfileScopes === 'function') await A().loadProfileScopes(uid);
      } catch (_sc) {}
      gwRequestSummariesRefresh();
      await gwLoadDomainSummaries();
      if (typeof A().refreshAandachtspunten === 'function') {
        try { await A().refreshAandachtspunten(); } catch (_a) {}
      }
    }
    var start = String(prefill || '').trim();
    var talkInp = document.getElementById('gatewayTalkbarInput');
    if (talkInp) talkInp.value = '';
    setTimeout(function () {
      var ci = document.getElementById('gatewayChatInput');
      if (ci) { try { ci.focus(); } catch (_e) {} }
    }, 80);
    if (start) await gwSendMessage(start);
  }
  function closeGatewayChat() {
    var chat = document.getElementById('gatewayChat');
    if (!chat) return;
    gwState.open = false;
    chat.classList.remove('open');
    chat.setAttribute('aria-hidden', 'true');
    var talkInp = document.getElementById('gatewayTalkbarInput');
    if (talkInp) { try { talkInp.focus(); } catch (_e) {} }
  }
  function gwBindUi() {
    if (_bound) return;
    _bound = true;
    var talkbar = document.getElementById('gatewayTalkbar');
    var talkInp = document.getElementById('gatewayTalkbarInput');
    var mic = document.getElementById('gatewayTalkbarMic');
    var back = document.getElementById('gatewayChatBack');
    var send = document.getElementById('gatewayChatSend');
    var chatInp = document.getElementById('gatewayChatInput');
    updateGatewayTalkbarPlaceholder();
    function openFromTalkbar() {
      openGatewayChat(talkInp ? talkInp.value : '');
    }
    if (talkbar) {
      talkbar.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('.gw-mic')) return;
        openFromTalkbar();
      });
      talkbar.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); openFromTalkbar(); }
      });
    }
    if (talkInp) {
      talkInp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); openFromTalkbar(); }
        e.stopPropagation();
      });
      talkInp.addEventListener('click', function (e) { e.stopPropagation(); });
    }
    if (mic) {
      mic.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openFromTalkbar();
      });
    }
    if (back) back.addEventListener('click', closeGatewayChat);
    function sendComposer() {
      var v = chatInp ? String(chatInp.value || '').trim() : '';
      if (!v) return;
      if (chatInp) chatInp.value = '';
      gwSendMessage(v);
    }
    if (send) send.addEventListener('click', sendComposer);
    if (chatInp) {
      chatInp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); sendComposer(); }
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && gwState.open) { e.preventDefault(); closeGatewayChat(); }
    });
  }

  function init(opts) {
    adapters = opts || {};
    gwBindUi();
    updateGatewayTalkbarPlaceholder();
    var host = document.getElementById('gatewayTalkbarHost');
    if (host && getUidSync()) host.hidden = false;
    return global.GatewayChat;
  }

  global.GatewayChat = {
    init: init,
    open: openGatewayChat,
    close: closeGatewayChat,
    updatePlaceholder: updateGatewayTalkbarPlaceholder,
    isOpen: function () { return !!gwState.open; },
    OPEN_CATS: GW_OPEN_CATS
  };
})(typeof window !== 'undefined' ? window : this);
