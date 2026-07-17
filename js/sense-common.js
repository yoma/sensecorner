/**
 * Gedeelde SenseCorner helpers: foto-URL allowlist en veilige returnTo-navigatie.
 */
(function (global) {
  var SENSE_RETURN_HOSTS = {
    'sensecorner.com': 1,
    'www.sensecorner.com': 1,
    'yoma.github.io': 1
  };

  function senseIsUnsafePhotoUrl(u) {
    var t = String(u || '').trim();
    if (!t) return true;
    if (/^data:/i.test(t) || /^blob:/i.test(t)) return false;
    if (!/^https?:\/\//i.test(t)) return false;
    var low = t.toLowerCase();
    if (/\.supabase\.co\//.test(low)) return false;
    if (/^https?:\/\/(www\.)?sensecorner\.com\//.test(low)) return false;
    if (/yoma\.github\.io\/sensecorner\//.test(low)) return false;
    if (/yoma\.github\.io\/sense-/.test(low)) return true;
    if (/yoma\.github\.io\/sense(\/|$)/.test(low)) return true;
    return false;
  }

  function senseIsAllowedReturnTo(raw) {
    var t = String(raw || '').trim();
    if (!t) return false;
    var low = t.toLowerCase();
    if (low.indexOf('javascript:') === 0 || low.indexOf('//') === 0) return false;
    if (low.indexOf('http://') === 0 || low.indexOf('https://') === 0) {
      var u;
      try {
        u = new URL(t);
      } catch (_e) {
        return false;
      }
      var host = String(u.hostname || '').toLowerCase();
      if (!SENSE_RETURN_HOSTS[host]) return false;
      if (host === 'yoma.github.io') {
        var p = u.pathname || '/';
        if (p.indexOf('/sensecorner/') !== 0 && !/\/[a-z]*sense[a-z]*\.html$/i.test(p)) return false;
      }
      return /\.html(\?|#|$)/i.test((u.pathname || '') + (u.search || ''));
    }
    if (t.indexOf('://') >= 0) return false;
    if (t.indexOf('.html') < 0) return false;
    if (/[\s<>"']/.test(t)) return false;
    return true;
  }

  function senseNormalizeReturnTo(raw, fallback) {
    fallback = String(fallback || '').trim();
    if (!senseIsAllowedReturnTo(raw)) return fallback;
    var t = String(raw).trim();
    if (t.indexOf('http://') === 0 || t.indexOf('https://') === 0) {
      try {
        var u = new URL(t);
        var path = String(u.pathname || '').replace(/^\//, '');
        return path + (u.search || '') + (u.hash || '') || fallback;
      } catch (_e2) {
        return fallback;
      }
    }
    return t;
  }

  function senseCalcAgeFromBirthdate(birthdate) {
    var raw = String(birthdate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
    var p = raw.split('-');
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10);
    var d = parseInt(p[2], 10);
    if (!y || !m || !d) return '';
    var today = new Date();
    var age = today.getFullYear() - y;
    var md = today.getMonth() + 1 - m;
    if (md < 0 || (md === 0 && today.getDate() < d)) age--;
    return age > 0 && age < 130 ? String(age) : '';
  }

  function senseOwnBasisHasAge(meta, calcAgeFn) {
    meta = meta && typeof meta === 'object' ? meta : {};
    calcAgeFn = calcAgeFn || senseCalcAgeFromBirthdate;
    var ageRaw = String(meta.age || '').trim();
    if (ageRaw) {
      var ageNum = parseInt(ageRaw, 10);
      if (ageNum > 0 && ageNum < 130) return true;
    }
    var bd = String(meta.birthdate || '').trim();
    return !!(bd && calcAgeFn(bd));
  }

  function senseOwnBasisHasLocation(meta) {
    meta = meta && typeof meta === 'object' ? meta : {};
    return !!(
      String(meta.city || '').trim() ||
      String(meta.country || '').trim() ||
      String(meta.address || '').trim()
    );
  }

  function senseOwnBasisHasGenderAnswer(meta) {
    meta = meta && typeof meta === 'object' ? meta : {};
    return !!String(meta.gender || '').trim();
  }

  /** Basisprofiel = leeftijd, adres (woonplaats/land), geslacht (incl. liever niet). */
  function senseOwnBasisMetaComplete(meta, calcAgeFn) {
    meta = meta && typeof meta === 'object' ? meta : {};
    return (
      senseOwnBasisHasAge(meta, calcAgeFn) &&
      senseOwnBasisHasLocation(meta) &&
      senseOwnBasisHasGenderAnswer(meta)
    );
  }

  function senseCountOwnBasisSlots(meta, calcAgeFn) {
    meta = meta && typeof meta === 'object' ? meta : {};
    var filled = 0;
    if (senseOwnBasisHasAge(meta, calcAgeFn)) filled++;
    if (senseOwnBasisHasLocation(meta)) filled++;
    if (senseOwnBasisHasGenderAnswer(meta)) filled++;
    return { filled: filled, total: 3 };
  }

  /** Alleen sense_profiles props.meta; geen props-root of hub-bridge (zelfde bron als OwnSense UI). */
  function senseExtractOwnBasisMetaServerOnly(props) {
    props = props && typeof props === 'object' ? props : {};
    if (props.meta && typeof props.meta === 'object') {
      return Object.assign({}, props.meta);
    }
    return {};
  }

  /** props.meta + legacy props-root + optioneel hub-bridge (zelfde velden als OwnSense hubState). */
  function senseExtractOwnBasisMeta(props, hubFallback) {
    props = props && typeof props === 'object' ? props : {};
    var meta =
      props.meta && typeof props.meta === 'object' ? Object.assign({}, props.meta) : {};
    ['birthdate', 'city', 'country', 'address', 'gender', 'gender_custom', 'age'].forEach(function (k) {
      if (!String(meta[k] || '').trim() && props[k] != null && String(props[k]).trim()) {
        meta[k] = String(props[k]).trim();
      }
    });
    if (hubFallback && typeof hubFallback === 'object') {
      ['birthdate', 'city', 'country', 'address', 'gender', 'gender_custom'].forEach(function (k) {
        if (!String(meta[k] || '').trim()) meta[k] = String(hubFallback[k] || '').trim();
      });
    }
    return meta;
  }

  function senseParseOwnHubBasisFallback(raw) {
    try {
      var hub = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!hub || typeof hub !== 'object') return null;
      return hub;
    } catch (_e) {
      return null;
    }
  }

  /** pdata-cel uit sense_profiles (props + meta) + optioneel hub-bridge. */
  function senseExtractOwnBasisMetaFromOwnCell(ownCell, hubFallback) {
    ownCell = ownCell && typeof ownCell === 'object' ? ownCell : {};
    var props = ownCell.props && typeof ownCell.props === 'object' ? ownCell.props : {};
    var cellMeta = ownCell.meta && typeof ownCell.meta === 'object' ? ownCell.meta : {};
    return senseExtractOwnBasisMeta(Object.assign({}, props, { meta: cellMeta }), hubFallback);
  }

  function senseOwnBasisProfileCompleteFromOwnCell(ownCell, hubFallback) {
    return senseOwnBasisMetaComplete(senseExtractOwnBasisMetaFromOwnCell(ownCell, hubFallback));
  }

  function senseEnrichOwnBasisMetaInCell(ownCell, hubFallback) {
    if (!ownCell || typeof ownCell !== 'object') return ownCell;
    var extracted = senseExtractOwnBasisMetaFromOwnCell(ownCell, hubFallback);
    if (!ownCell.meta || typeof ownCell.meta !== 'object') ownCell.meta = {};
    ['birthdate', 'city', 'country', 'address', 'gender', 'gender_custom', 'age'].forEach(function (k) {
      if (!String(ownCell.meta[k] || '').trim() && String(extracted[k] || '').trim()) {
        ownCell.meta[k] = String(extracted[k]).trim();
      }
    });
    return ownCell;
  }

  function senseFormatOwnBasisGender(meta) {
    meta = meta && typeof meta === 'object' ? meta : {};
    var g = String(meta.gender || '').trim().toLowerCase();
    if (!g || g === 'prefer_not' || g === 'liever_niet') return '';
    if (g === 'man') return 'man';
    if (g === 'vrouw') return 'vrouw';
    if (g === 'overig') {
      var custom = String(meta.gender_custom || '').trim();
      return custom ? custom : 'overig';
    }
    return '';
  }

  function senseOwnBasisContextParts(meta, calcAgeFn) {
    meta = meta && typeof meta === 'object' ? meta : {};
    calcAgeFn = calcAgeFn || senseCalcAgeFromBirthdate;
    var parts = [];
    var age = calcAgeFn(meta.birthdate) || String(meta.age || '').trim();
    if (age) parts.push('leeftijd ' + age);
    var city = String(meta.city || '').trim();
    var addr = String(meta.address || '').trim();
    if (city) parts.push('woonplaats ' + city);
    else if (addr) parts.push('adres ' + addr);
    var country = String(meta.country || '').trim();
    if (country && !city && !addr) parts.push('land ' + country);
    var gender = senseFormatOwnBasisGender(meta);
    if (gender) parts.push('geslacht ' + gender);
    return parts;
  }

  function appendOwnBasisMetaCoachContext(lines, meta, calcAgeFn) {
    if (!lines || !meta) return;
    var parts = senseOwnBasisContextParts(meta, calcAgeFn);
    if (parts.length) lines.push('OWN basisprofiel: ' + parts.join(', '));
  }

  function senseBasisNudgeDayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function senseBasisprofielNudgeSeenToday(appKey, nudgeId) {
    var key = 'sc_basis_nudge_' + String(appKey || 'sc').toLowerCase() + '_' + String(nudgeId || 'main') + '_' + senseBasisNudgeDayKey();
    try {
      return sessionStorage.getItem(key) === '1';
    } catch (_e) {
      return false;
    }
  }

  function markBasisprofielNudgeSeen(appKey, nudgeId) {
    var key = 'sc_basis_nudge_' + String(appKey || 'sc').toLowerCase() + '_' + String(nudgeId || 'main') + '_' + senseBasisNudgeDayKey();
    try {
      sessionStorage.setItem(key, '1');
    } catch (_e2) {}
  }

  function getBasisprofielNudge(meta, appKey) {
    meta = meta && typeof meta === 'object' ? meta : {};
    appKey = String(appKey || 'sc').toLowerCase();
    var link = 'ownsense.html?tab=mij&focus=basis';
    if (senseOwnBasisMetaComplete(meta)) return null;
    /* SenseCorner: altijd zichtbaar zolang basis op server incompleet is (geen dismiss vandaag). */
    if (appKey !== 'sc' && senseBasisprofielNudgeSeenToday(appKey, 'basis')) return null;
    var missing = [];
    if (!senseOwnBasisHasAge(meta)) missing.push('leeftijd');
    if (!senseOwnBasisHasLocation(meta)) missing.push('adres');
    if (!senseOwnBasisHasGenderAnswer(meta)) missing.push('geslacht');
    var msg =
      'Vul je basisprofiel aan in OwnSense (leeftijd, adres en geslacht). Dat helpt Sensei om advies beter op jou af te stemmen.';
    if (missing.length === 1) {
      msg =
        'Vul je ' +
        missing[0] +
        ' aan in je basisprofiel in OwnSense. Dat helpt Sensei om advies beter op jou af te stemmen.';
    } else if (missing.length === 2) {
      msg =
        'Vul ' +
        missing[0] +
        ' en ' +
        missing[1] +
        ' aan in je basisprofiel in OwnSense. Dat helpt Sensei om advies beter op jou af te stemmen.';
    }
    var nudge = {
      id: 'basis',
      title: 'Basisprofiel aanvullen',
      message: msg,
      link: link,
      linkLabel: 'Nu aanvullen'
    };
    /* SenseCorner: incomplete server meta mag nooit stil blijven (geen null na deze check). */
    if (appKey === 'sc' && !senseOwnBasisMetaComplete(meta)) return nudge;
    return nudge;
  }

  function senseEscHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function senseEscJsStr(s) {
    return String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r/g, '')
      .replace(/\n/g, '\\n');
  }

  function ensureBasisNudgeStyles() {
    if (typeof document === 'undefined' || document.getElementById('sc-basis-nudge-styles')) return;
    var st = document.createElement('style');
    st.id = 'sc-basis-nudge-styles';
    st.textContent =
      '.sc-basis-nudge__actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;align-items:center}' +
      '.sc-basis-nudge__primary{display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;padding:8px 14px;border-radius:10px;text-decoration:none;font-family:inherit;cursor:pointer;border:none;background:var(--chocolade,#5C4033);color:var(--cream,#FFF9F3);box-shadow:0 2px 8px rgba(61,47,31,.12)}' +
      '.sc-basis-nudge__primary:hover{background:var(--chocolade-diep,#4A3328);color:var(--cream,#FFF9F3)}' +
      '.sc-basis-nudge__secondary{display:inline-flex;align-items:center;font-size:12px;font-weight:600;padding:6px 4px;border-radius:8px;font-family:inherit;cursor:pointer;border:none;background:transparent;color:#7A6F66;text-decoration:underline;text-underline-offset:2px}' +
      '.sc-basis-nudge__secondary:hover{color:var(--chocolade,#5C4033)}';
    document.head.appendChild(st);
  }

  function renderBasisprofielNudgeHtml(nudge, appKey) {
    if (!nudge) return '';
    ensureBasisNudgeStyles();
    var id = senseEscHtml(nudge.id || 'basis');
    var ak = senseEscJsStr(appKey || 'sc');
    var nid = senseEscJsStr(nudge.id || 'basis');
    return (
      '<div class="sc-basis-nudge" data-nudge-id="' +
      id +
      '" style="margin:0 0 14px;padding:12px 14px;background:#FFF9F3;border:1px solid #F0DADA;border-radius:12px;text-align:left">' +
      '<div style="font-size:13px;font-weight:700;color:#5C4033">' +
      senseEscHtml(nudge.title || 'Profiel aanvullen') +
      '</div>' +
      '<p style="font-size:13px;color:#666;line-height:1.5;margin-top:6px">' +
      senseEscHtml(nudge.message || '') +
      '</p>' +
      '<div class="sc-basis-nudge__actions">' +
      '<a href="' +
      senseEscHtml(nudge.link || 'ownsense.html?tab=mij&focus=basis') +
      '" class="sc-basis-nudge__primary" style="display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;padding:8px 14px;border-radius:10px;text-decoration:none;font-family:inherit;background:#3D2F1F;color:#F2E8D5;border:none;box-shadow:0 2px 8px rgba(61,47,31,.12)">' +
      senseEscHtml(nudge.linkLabel || 'Aanvullen') +
      '</a>' +
      (ak === 'sc'
        ? ''
        : '<button type="button" class="sc-basis-nudge__secondary" style="display:inline-flex;align-items:center;font-size:12px;font-weight:600;padding:6px 4px;border:none;background:transparent;color:#7A6F66;text-decoration:underline;cursor:pointer;font-family:inherit" onclick="dismissBasisprofielNudge(\'' +
          ak +
          "','" +
          nid +
          '\')">Later vandaag</button>') +
      '</div></div>'
    );
  }

  function renderBasisprofielNudgeIfNeeded(meta, appKey) {
    var nudge = getBasisprofielNudge(meta, appKey);
    if (!nudge) return '';
    return renderBasisprofielNudgeHtml(nudge, appKey);
  }

  function dismissBasisprofielNudge(appKey, nudgeId) {
    markBasisprofielNudgeSeen(appKey, nudgeId);
    var sel = '[data-nudge-id="' + String(nudgeId || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
    try {
      document.querySelectorAll('.sc-basis-nudge' + sel).forEach(function (el) {
        el.remove();
      });
    } catch (_e3) {}
  }

  function senseIsDirectlyLoadableImageUrl(u) {
    return (
      /^https?:\/\//i.test(String(u || '').trim()) ||
      /^data:/i.test(String(u || '').trim()) ||
      /^blob:/i.test(String(u || '').trim())
    );
  }

  function senseParseStorageRef(v) {
    var s = String(v || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) {
      if (/^data:/i.test(s) || /^blob:/i.test(s)) return null;
      return { bucket: '', path: s.replace(/^\/+/, '') };
    }
    var m = s.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?#]+)/i);
    if (!m) return null;
    var bucket = decodeURIComponent(String(m[1] || '').trim());
    var path = decodeURIComponent(String(m[2] || '').trim()).replace(/^\/+/, '');
    if (!bucket || !path) return null;
    return { bucket: bucket, path: path };
  }

  function senseIsLikelyExpiringStorageUrl(v) {
    return /\/storage\/v1\/object\/sign\//i.test(String(v || '').trim());
  }

  function senseOwnPhotoBucketHints() {
    return ['own-photos', 'datesense-photos', 'sense-photos', 'familysense-photos'];
  }

  async function senseRefreshPhotoRef(v, bucketHints, signFn) {
    var s = String(v || '').trim();
    if (!s) return '';
    signFn = typeof signFn === 'function' ? signFn : null;
    var ref = senseParseStorageRef(s);
    if (ref && ref.path && signFn) {
      if (ref.bucket) {
        var direct = await signFn(ref.bucket, ref.path);
        if (direct) return direct;
      }
      var buckets = Array.isArray(bucketHints) && bucketHints.length ? bucketHints : senseOwnPhotoBucketHints();
      for (var i = 0; i < buckets.length; i++) {
        var fromBucket = await signFn(String(buckets[i] || '').trim(), ref.path);
        if (fromBucket) return fromBucket;
      }
    }
    if (
      senseIsDirectlyLoadableImageUrl(s) &&
      !senseIsLikelyExpiringStorageUrl(s) &&
      !senseIsUnsafePhotoUrl(s)
    ) {
      return s;
    }
    return '';
  }

  function senseCollectOwnCategoryLines(ownCell) {
    var lines = [];
    ownCell = ownCell && typeof ownCell === 'object' ? ownCell : {};
    try {
      Object.values(ownCell.categories || {}).forEach(function (cat) {
        Object.values(cat || {}).forEach(function (v) {
          var t = String(v || '').trim();
          if (t) lines.push(t);
        });
      });
    } catch (_e) {}
    return lines;
  }

  global._ownAandachtspuntenCoachContext = '';

  function senseParseAandachtspuntEvidence(evidence) {
    if (!evidence) return [];
    if (Array.isArray(evidence)) return evidence;
    try {
      if (typeof evidence === 'string') return JSON.parse(evidence);
    } catch (_e) {}
    return [];
  }

  function senseIsEigenEvidenceItem(it) {
    return !!(it && String(it.type || '').trim() === 'eigen');
  }

  function senseIsEigenAandachtspuntRow(row) {
    return senseParseAandachtspuntEvidence(row && row.evidence).some(senseIsEigenEvidenceItem);
  }

  function senseAandachtspuntOriginLabel(row) {
    return senseIsEigenAandachtspuntRow(row) ? 'eigen reflectie' : 'bevestigd voorstel';
  }

  function senseIsAandachtspuntCompleted(row) {
    return !!(row && row.completed_at && String(row.completed_at).trim());
  }

  function senseActiveBevestigdeAandachtspunten(rows) {
    return (rows || []).filter(function (r) {
      return (
        r &&
        String(r.status || '')
          .trim()
          .toLowerCase() === 'bevestigd' &&
        !senseIsAandachtspuntCompleted(r)
      );
    });
  }

  function senseFormatAandachtspuntenCoachBlock(rows) {
    var active = senseActiveBevestigdeAandachtspunten(rows);
    if (!active.length) return '';
    var lines = [
      'BEVESTIGDE AANDACHTSPUNTEN (actief; respecteer in advies, niet opnieuw als nieuw voorstel behandelen):'
    ];
    active.forEach(function (row) {
      var name = String(row.soft_name || '').trim();
      if (!name) return;
      var label = senseAandachtspuntOriginLabel(row);
      var tip = String(row.tips_advice || '').trim();
      var line = '- [' + label + '] ' + name.substring(0, 200);
      if (tip) line += ' (werkadvies: ' + tip.substring(0, 160) + ')';
      lines.push(line);
    });
    lines.push(
      'EIGEN REFLECTIE = door de gebruiker zelf toegevoegd. BEVESTIGD VOORSTEL = bewust bevestigd na Sensei-voorstel.'
    );
    return lines.join('\n');
  }

  function appendOwnAandachtspuntenCoachContext(lines) {
    if (!lines) return;
    var block = String(global._ownAandachtspuntenCoachContext || '').trim();
    if (block) lines.push(block);
  }

  async function refreshOwnAandachtspuntenCoachContext(sb, userId) {
    global._ownAandachtspuntenCoachContext = '';
    if (!sb || !userId) return;
    try {
      var res = await sb
        .from('own_aandachtspunten')
        .select('soft_name,status,evidence,tips_advice,completed_at')
        .eq('user_id', userId)
        .eq('status', 'bevestigd')
        .order('confirmed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(40);
      if (res && res.error) return;
      var block = senseFormatAandachtspuntenCoachBlock((res && res.data) || []);
      if (block) global._ownAandachtspuntenCoachContext = block;
    } catch (_e2) {}
  }

  async function refreshOwnAandachtspuntenCoachContextAuto() {
    var sb = global.sb || global.__obSupabase;
    var uid = global.S && global.S.user && global.S.user.id;
    return refreshOwnAandachtspuntenCoachContext(sb, uid);
  }

  function senseBuildOwnRecoContextPack(ownCell, extra) {
    ownCell = ownCell && typeof ownCell === 'object' ? ownCell : { meta: {}, categories: {} };
    extra = extra && typeof extra === 'object' ? extra : {};
    var meta = senseExtractOwnBasisMetaFromOwnCell(ownCell, extra.hubFallback || null);
    var catLines = senseCollectOwnCategoryLines(ownCell);
    var recent = Array.isArray(extra.recentUserLines)
      ? extra.recentUserLines.map(function (x) { return String(x || '').trim(); }).filter(Boolean).slice(0, 10)
      : [];
    var summary = String(extra.summary != null ? extra.summary : ownCell.summary || '').trim();
    var lines = [];
    var displayName = String(extra.displayName || '').trim();
    if (displayName) lines.push('Naam: ' + displayName);
    appendOwnBasisMetaCoachContext(lines, meta);
    if (meta.birthdate && lines.join(' ').indexOf('leeftijd') < 0) {
      var age = senseCalcAgeFromBirthdate(meta.birthdate) || String(meta.age || '').trim();
      if (age) lines.push('Leeftijd: ' + age);
    }
    if (summary) lines.push('Samenvatting: ' + summary);
    if (catLines.length) lines.push('Profielantwoorden: ' + catLines.slice(0, 12).join(' | '));
    if (recent.length) lines.push('Recente eigen berichten: ' + recent.slice(0, 6).join(' | '));
    appendOwnAandachtspuntenCoachContext(lines);
    var sparse = catLines.length === 0 && recent.length === 0 && summary.length < 40;
    return {
      lines: lines,
      text: lines.length ? lines.join('\n') : '',
      sparse: sparse,
      catCount: catLines.length,
      recentCount: recent.length
    };
  }

  function senseIsRateLimitMessage(msg) {
    return /overbevraagd|\b429\b|rate.?limit|too many requests/i.test(String(msg || ''));
  }

  function senseRecoStatusNoticeHtml(msg) {
    var esc = function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };
    if (senseIsRateLimitMessage(msg)) {
      return (
        '<div style="display:flex;gap:10px;align-items:flex-start;background:rgba(245,158,11,.08);' +
        'border:1px solid rgba(245,158,11,.28);border-radius:12px;padding:11px 12px">' +
        '<span aria-hidden="true" style="font-size:16px;line-height:1.3">\u23F3</span>' +
        '<div style="font-size:13px;color:#7c5b16;line-height:1.5">' +
        '<strong>Even rustig aan.</strong> Sensei krijgt nu veel vragen tegelijk, dus je dagtip lukt zo meteen niet. ' +
        'Probeer over een minuutje opnieuw met "Vernieuw tip".' +
        '</div></div>'
      );
    }
    return (
      '<div style="font-size:13px;color:#9a6a1f;line-height:1.5">' +
      'Je dagtip lukte even niet. Tik op "Vernieuw tip" om het opnieuw te proberen.' +
      '<div style="font-size:11px;color:#9aa0a8;margin-top:4px">' + esc(msg) + '</div>' +
      '</div>'
    );
  }

  function senseSparseDailyRecoFallback(dayKey) {
    var tips = [
      'Een lichte tip voor vandaag: neem 5 minuten bewust rust zonder scherm. Een korte pauze helpt je hoofd tot rust komen.',
      'Hier is een algemene suggestie: kies één kleine stap die je vandaag wél kunt zetten. Klein is ook vooruit.',
      'Vandaag mag het licht zijn: drink een glas water en adem drie keer rustig in en uit voordat je verder gaat.',
      'Een haalbare tip: schrijf één zin op over wat je nu nodig hebt. Dat hoeft niet perfect te zijn.',
      'Neem vandaag een moment om buiten of bij een raam te staan. Frisse lucht en licht geven vaak wat ruimte.',
      'Plan bewust één moment van stilte in je dag, ook al is het maar twee minuten.',
      'Zet je telefoon even weg bij je eerste kop koffie of thee. Begin de dag met iets rustigs.',
      'Kies één ding dat je vandaag níet hoeft te doen. Dat maakt ruimte voor wat wél belangrijk is.'
    ];
    var key = String(dayKey || '').trim();
    if (!key) {
      try {
        var dt = new Date();
        key =
          dt.getFullYear() +
          '-' +
          (dt.getMonth() + 1 < 10 ? '0' : '') +
          (dt.getMonth() + 1) +
          '-' +
          (dt.getDate() < 10 ? '0' : '') +
          dt.getDate();
      } catch (_d) {
        key = '0';
      }
    }
    var hash = 0;
    for (var i = 0; i < key.length; i++) {
      hash = (hash + key.charCodeAt(i) * (i + 3)) % tips.length;
    }
    return { text: tips[hash], sparse: true };
  }

  function senseSparseDagAdviesFallback(dayKey) {
    var advices = [
      'Vandaag mag het licht zijn. Kies één kleine stap die je wél kunt zetten, ook al voelt de rest nog zwaar. Dat is al vooruit.',
      'Een warm algemeen dagadvies: neem bewust vijf minuten rust zonder scherm. Een korte pauze geeft je hoofd wat ruimte.',
      'Begin de dag rustig: drink een glas water en adem drie keer langzaam in en uit voordat je verder gaat.',
      'Plan bewust één moment van stilte in, ook al is het maar twee minuten. Stilte is geen luxe, het helpt je bij te stellen.',
      'Schrijf één zin op over wat je nu nodig hebt. Het hoeft niet mooi te zijn; helder voor jezelf is genoeg.',
      'Sta even bij een raam of loop kort naar buiten. Licht en frisse lucht geven vaak wat perspectief.',
      'Kies vandaag één ding dat je níet hoeft te doen. Dat maakt ruimte voor wat wél belangrijk is.',
      'Zet je telefoon even weg bij je eerste kop koffie of thee. Begin met iets rustigs in plaats van meteen te reageren.'
    ];
    var key = String(dayKey || '').trim();
    if (!key) {
      try {
        var dt = new Date();
        key =
          dt.getFullYear() +
          '-' +
          (dt.getMonth() + 1 < 10 ? '0' : '') +
          (dt.getMonth() + 1) +
          '-' +
          (dt.getDate() < 10 ? '0' : '') +
          dt.getDate();
      } catch (_d2) {
        key = '0';
      }
    }
    var hash = 0;
    for (var j = 0; j < key.length; j++) {
      hash = (hash + key.charCodeAt(j) * (j + 5)) % advices.length;
    }
    return { text: advices[hash], sparse: true };
  }

  /** Alleen via loadMsgs({ probeBeforeLoad: true }); routine pad = één query, geen extra round-trip. */
  var _senseMsgsProbeCache = {};
  var _senseMsgsProbeInflight = {};

  function senseMsgsProbeKey(uid, pn) {
    return String(uid || '') + '|' + String(pn || '');
  }

  function senseInvalidateProfileMsgsProbe(uid, pn) {
    delete _senseMsgsProbeCache[senseMsgsProbeKey(uid, pn)];
    delete _senseMsgsProbeCache[String(uid || '') + '|user-any'];
  }

  function senseMarkProfileMsgsProbe(uid, pn, hasMsgs) {
    if (!uid || !pn) return;
    _senseMsgsProbeCache[senseMsgsProbeKey(uid, pn)] = {
      state: hasMsgs ? 'has' : 'empty',
      at: Date.now()
    };
  }

  async function senseProbeProfileHasMsgs(sb, uid, pn, opt) {
    opt = opt && typeof opt === 'object' ? opt : {};
    if (!sb || !uid || !pn) return null;
    var key = senseMsgsProbeKey(uid, pn);
    var cached = _senseMsgsProbeCache[key];
    var maxAge = parseInt(opt.maxAgeMs, 10) || 300000;
    if (cached && Date.now() - cached.at < maxAge) return cached.state === 'has';
    if (_senseMsgsProbeInflight[key]) return _senseMsgsProbeInflight[key];
    var timeoutMs = parseInt(opt.timeoutMs, 10) || 2200;
    var withTimeoutFn = opt.withTimeout;
    var run = (async function () {
      try {
        var q = sb
          .from('sense_messages')
          .select('id')
          .eq('user_id', uid)
          .eq('profile_name', pn)
          .limit(1);
        var res;
        if (typeof withTimeoutFn === 'function') {
          res = await withTimeoutFn(q, timeoutMs, 'Berichten-probe timeout', {
            label: 'senseProbeProfileHasMsgs',
            meta: { profile: pn }
          });
        } else {
          res = await q;
        }
        if (res && res.error) return null;
        var has = !!(res && res.data && res.data.length);
        _senseMsgsProbeCache[key] = { state: has ? 'has' : 'empty', at: Date.now() };
        return has;
      } catch (_pe) {
        return null;
      } finally {
        delete _senseMsgsProbeInflight[key];
      }
    })();
    _senseMsgsProbeInflight[key] = run;
    return run;
  }

  async function senseProbeUserRoleHasMsgs(sb, uid, opt) {
    opt = opt && typeof opt === 'object' ? opt : {};
    if (!sb || !uid) return null;
    var key = String(uid || '') + '|user-any';
    var cached = _senseMsgsProbeCache[key];
    var maxAge = parseInt(opt.maxAgeMs, 10) || 300000;
    if (cached && Date.now() - cached.at < maxAge) return cached.state === 'has';
    if (_senseMsgsProbeInflight[key]) return _senseMsgsProbeInflight[key];
    var timeoutMs = parseInt(opt.timeoutMs, 10) || 2200;
    var withTimeoutFn = opt.withTimeout;
    var run = (async function () {
      try {
        var q = sb.from('sense_messages').select('id').eq('user_id', uid).eq('role', 'user').limit(1);
        var res;
        if (typeof withTimeoutFn === 'function') {
          res = await withTimeoutFn(q, timeoutMs, 'User-berichten-probe timeout', {
            label: 'senseProbeUserRoleHasMsgs',
            meta: {}
          });
        } else {
          res = await q;
        }
        if (res && res.error) return null;
        var has = !!(res && res.data && res.data.length);
        _senseMsgsProbeCache[key] = { state: has ? 'has' : 'empty', at: Date.now() };
        return has;
      } catch (_pu) {
        return null;
      } finally {
        delete _senseMsgsProbeInflight[key];
      }
    })();
    _senseMsgsProbeInflight[key] = run;
    return run;
  }

  function senseShouldUseSparseDailyRecoFallback(ownCell, recentUserLines) {
    var pack = senseBuildOwnRecoContextPack(ownCell, { recentUserLines: recentUserLines || [] });
    return !!pack.sparse;
  }

  function senseRecoNoFabricationRules(mode) {
    mode = mode === 'sparse' ? 'sparse' : 'rich';
    var rules =
      'KRITIEK - geen verzonnen context: noem NOOIT wat de gebruiker voelt, meemaakt, last heeft van of moeilijk vindt tenzij dat letterlijk of duidelijk parafraseerbaar in de gebruikerscontext staat. ' +
      'Gebruik NOOIT "Ik hoor dat...", "Ik merk dat..." of "Ik zie dat..." als openingszin tenzij de context dat expliciet bevestigt. ' +
      'Verzin geen eenzaamheid, zware vriendschap, spanning thuis, bindingangst of vergelijkbare emoties of situaties. ';
    if (mode === 'sparse') {
      rules +=
        'Context is beperkt (nieuw of weinig ingevuld profiel): start neutraal en warm, bijv. "Een lichte tip voor vandaag:" of "Hier is een algemene suggestie.". Houd de tip licht, haalbaar en algemeen; doe niet alsof je de gebruiker al kent.';
    } else {
      rules += 'Sluit alleen aan op wat expliciet in de context staat. Wees warm maar feitelijk; geen therapeutische aannames.';
    }
    return rules;
  }

  async function senseFetchDailyRecoTipText(opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    var cats = Array.isArray(opts.categories) ? opts.categories : [];
    var catTxt = cats.join(', ');
    var allowedDomains = Array.isArray(opts.allowedDomains) ? opts.allowedDomains : [];
    var coachName = String(opts.coachName || 'Sensei').trim();
    var focus = String(opts.focus || '').trim();
    var ownCell = opts.ownCell && typeof opts.ownCell === 'object' ? opts.ownCell : { meta: {}, categories: {} };
    var callAPI = opts.callAPI;
    if (typeof callAPI !== 'function') {
      return { text: '', sparse: true };
    }
    var recentUserLines = [];
    var packPre = senseBuildOwnRecoContextPack(ownCell, {
      displayName: opts.displayName,
      summary: ownCell.summary,
      recentUserLines: [],
      hubFallback: opts.hubFallback || null
    });
    if (!packPre.sparse && !opts.skipLoadMsgs && typeof opts.loadRecentUserLines === 'function') {
      try {
        recentUserLines = await opts.loadRecentUserLines();
      } catch (_lr) {}
    }
    var pack = senseBuildOwnRecoContextPack(ownCell, {
      displayName: opts.displayName,
      summary: ownCell.summary,
      recentUserLines: recentUserLines,
      hubFallback: opts.hubFallback || null
    });
    var noFab = senseRecoNoFabricationRules(pack.sparse ? 'sparse' : 'rich');
    var ctxBlock = pack.text || 'Nog weinig profielcontext beschikbaar.';
    var usr =
      'Context gebruiker (alleen dit gebruiken; niets erbij verzinnen):\n' +
      ctxBlock +
      '\n\nDoel: 1 korte, concrete dagtip voor vandaag' +
      (focus ? ' rond ' + focus : '') +
      '.';
    var sysSearch =
      'Je bent ' +
      coachName +
      '. Geef precies 1 korte, warme dagtip voor vandaag met 1 haalbaar voorstel en 1 echte link. Alleen categorieen: ' +
      catTxt +
      '. Gebruik alleen URL\'s die je met hoge zekerheid correct vindt; bij twijfel link naar een stabiele start- of zoekpagina op hetzelfde domein. ' +
      noFab +
      (focus ? ' Focus: ' + focus + '.' : '') +
      ' Nederlands.';
    var sysPlain =
      'Je bent ' +
      coachName +
      '. Geef precies 1 korte dagtip (max 5 zinnen). Geen links. ' +
      noFab +
      (focus ? ' Focus: ' + focus + '.' : '') +
      ' Nederlands.';
    var text = '';
    var apiTimeoutMs = pack.sparse ? 15000 : 22000;
    var apiTimeoutPlainMs = pack.sparse ? 15000 : 10000;
    if (pack.sparse) {
      try {
        text = await callAPI(sysPlain, [{ role: 'user', content: usr }], 360, apiTimeoutMs, null, {
          disable_web_search: true
        });
      } catch (eSparse) {
        console.warn('senseFetchDailyRecoTipText sparse plain', eSparse);
        var msgS = (eSparse && eSparse.message) ? String(eSparse.message) : '';
        if (senseIsRateLimitMessage(msgS)) throw eSparse;
        var fb = senseSparseDailyRecoFallback(opts.dayKey);
        if (fb && fb.text) return {text:fb.text,sparse:true,isFallback:true};
        throw eSparse;
      }
    } else {
      try {
        text = await callAPI(sysSearch, [{ role: 'user', content: usr }], 420, apiTimeoutMs, null, {
          allowed_domains: allowedDomains
        });
      } catch (e1) {
        console.warn('senseFetchDailyRecoTipText search', e1);
        var msg1 = (e1 && e1.message) ? String(e1.message) : '';
        if (senseIsRateLimitMessage(msg1)) throw e1;
        if (/timeout|AI request timeout/i.test(msg1)) throw e1;
        text = await callAPI(sysPlain, [{ role: 'user', content: usr }], 360, apiTimeoutPlainMs, null, {
          disable_web_search: true
        });
      }
    }
    return { text: String(text || '').trim(), sparse: pack.sparse };
  }

  var __senseFieldSaveClearTimers = {};

  function senseResolveFieldSaveEl(elOrId) {
    if (!elOrId) return null;
    if (typeof elOrId === 'object' && elOrId.nodeType === 1) return elOrId;
    return document.getElementById(String(elOrId || ''));
  }

  /** In-field save feedback: idle | saving | saved | error */
  function senseSetFieldSaveStatus(elOrId, state, opts) {
    opts = opts || {};
    var el = senseResolveFieldSaveEl(elOrId);
    if (!el) return;
    var timerKey = el.id || String(elOrId);
    if (__senseFieldSaveClearTimers[timerKey]) {
      clearTimeout(__senseFieldSaveClearTimers[timerKey]);
      __senseFieldSaveClearTimers[timerKey] = null;
    }
    var labels = {
      idle: '',
      saving: 'Bezig met opslaan…',
      saved: '✓ Opgeslagen',
      error: 'Opslaan mislukt'
    };
    var stateNorm =
      state === 'saving' || state === 'saved' || state === 'error' ? state : 'idle';
    el.textContent =
      stateNorm === 'idle' ? '' : String(opts.message || labels[stateNorm] || '');
    el.className = 'field-save-status' + (stateNorm !== 'idle' ? ' ' + stateNorm : '');
    el.setAttribute('aria-live', 'polite');
    if (stateNorm === 'idle') return;
    var durationMs =
      typeof opts.durationMs === 'number'
        ? opts.durationMs
        : stateNorm === 'saving'
          ? 0
          : stateNorm === 'error'
            ? 4200
            : 2600;
    if (durationMs > 0) {
      __senseFieldSaveClearTimers[timerKey] = setTimeout(function () {
        senseSetFieldSaveStatus(el, 'idle');
      }, durationMs);
    }
  }

  function senseFieldSaveIdFromTextareaId(taId) {
    var id = String(taId || '');
    var m = id.match(/^(?:oc|cc|qi|qm)-(.+)$/);
    if (!m) return 'fs-' + id;
    if (/^qi-/.test(id) || /^qm-/.test(id)) return 'qi-save-' + m[1];
    return 'oc-field-' + m[1];
  }

  var _senseLastActivityTouchAt = 0;
  var _senseLastActivityTouchBusy = false;
  var SENSE_ACTIVITY_TOUCH_MS = 5 * 60 * 1000;

  var SENSE_AUTH_STORAGE_DEFAULT = 'sensecorner-auth-v1';
  var _senseExpiredSessionHandling = false;

  function senseIsExpiredSessionError(err) {
    var msg = String((err && err.message) || err || '').toLowerCase();
    var code = String((err && err.code) || (err && err.error_code) || '').toLowerCase();
    if (code === 'bad_jwt' || code === 'invalid_grant' || code === 'session_not_found') return true;
    if (msg.indexOf('jwt expired') >= 0) return true;
    if (msg.indexOf('invalid refresh token') >= 0) return true;
    if (msg.indexOf('refresh token not found') >= 0) return true;
    if (msg.indexOf('session expired') >= 0) return true;
    if (msg.indexOf('token is expired') >= 0) return true;
    return false;
  }

  function senseExpiredSessionUserMessage() {
    return 'Je sessie is verlopen. Log opnieuw in om verder te gaan.';
  }

  function senseClearExpiredSessionStorage(storageKey) {
    try {
      localStorage.removeItem(storageKey || SENSE_AUTH_STORAGE_DEFAULT);
    } catch (_e) {}
  }

  function senseShowBootSessionExpiredBox(probe, appLabel, boxId) {
    var tip = 'Tip: log opnieuw in. Op Android met een snelkoppeling op je startscherm: verwijder de oude link en maak hem opnieuw na het inloggen.';
    try {
      if (probe) {
        probe.textContent = 'Sessie verlopen';
        probe.style.background = '#fff7d6';
        probe.style.borderColor = '#f0d27a';
        probe.style.color = '#7a5a00';
      }
      var id = boxId || 'senseBootSessionExpiredBox';
      var box = document.getElementById(id);
      if (!box) {
        box = document.createElement('div');
        box.id = id;
        box.style.cssText = 'position:fixed;top:calc(56px + var(--st));right:10px;max-width:min(92vw,640px);z-index:122;background:#fffbf0;border:1px solid #f0d27a;border-radius:12px;padding:10px 12px;font-size:12px;line-height:1.45;color:#7a5a00;white-space:pre-wrap;box-shadow:0 4px 14px rgba(0,0,0,.08)';
        document.body.appendChild(box);
      }
      box.textContent = String(appLabel || 'Sense') + ':\n' + senseExpiredSessionUserMessage() + '\n\n' + tip;
    } catch (_e2) {}
  }

  function senseShowSessionExpiredScreen(appLabel) {
    try {
      var mc = document.getElementById('mainContent');
      if (!mc) return;
      mc.innerHTML = '<div style="padding:28px 20px 36px;text-align:center;color:#5C4033">'
        + '<div style="font-size:22px;font-weight:800;margin-bottom:10px">Sessie verlopen</div>'
        + '<p style="font-size:15px;line-height:1.6;color:#666;margin:0 0 20px">' + senseExpiredSessionUserMessage() + '</p>'
        + '<button type="button" id="senseSessionExpiredLoginBtn" style="width:100%;max-width:280px;padding:14px 18px;border:none;border-radius:12px;background:var(--p,#7D6AAB);color:#fff;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit">Opnieuw inloggen</button>'
        + '<p style="font-size:12px;line-height:1.5;color:#888;margin-top:16px">Android-startscherm? Verwijder de oude snelkoppeling en maak hem opnieuw na het inloggen.</p>'
        + '</div>';
      var btn = document.getElementById('senseSessionExpiredLoginBtn');
      if (btn) {
        btn.addEventListener('click', function () {
          if (typeof global.goScreen === 'function') {
            try {
              global.goScreen('login');
            } catch (_e) {}
          }
        });
      }
    } catch (_e3) {
      console.warn('senseShowSessionExpiredScreen', appLabel, _e3);
    }
  }

  function senseRecoverExpiredSession(opts) {
    opts = opts || {};
    if (global.__senseRecoverExpiredDone) return;
    global.__senseRecoverExpiredDone = true;
    setTimeout(function () {
      global.__senseRecoverExpiredDone = false;
    }, 5000);
    senseClearExpiredSessionStorage(opts.storageKey);
    global.__senseSessionExpired = true;
    if (typeof opts.resetState === 'function') {
      try {
        opts.resetState();
      } catch (_e) {}
    }
    if (typeof opts.goLogin === 'function') {
      try {
        opts.goLogin();
      } catch (_e2) {}
    } else if (typeof global.goScreen === 'function') {
      try {
        global.goScreen('login');
      } catch (_e3) {}
    }
    var toastFn = opts.toast || global.toast;
    if (typeof toastFn === 'function') {
      try {
        toastFn(senseExpiredSessionUserMessage());
      } catch (_e4) {}
    }
  }

  function senseHandleExpiredSessionRejection(ev, opts) {
    opts = opts || {};
    var reason = ev && ev.reason;
    if (!senseIsExpiredSessionError(reason)) return false;
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    if (_senseExpiredSessionHandling) return true;
    _senseExpiredSessionHandling = true;
    senseClearExpiredSessionStorage(opts.storageKey);
    global.__senseSessionExpired = true;
    if (opts.probe && (opts.appLabel || opts.boxId)) {
      senseShowBootSessionExpiredBox(opts.probe, opts.appLabel, opts.boxId);
    }
    if (typeof opts.onExpired === 'function') {
      try {
        opts.onExpired();
      } catch (_e) {}
    } else if (opts.showScreen !== false) {
      senseShowSessionExpiredScreen(opts.appLabel);
    }
    setTimeout(function () {
      _senseExpiredSessionHandling = false;
    }, 3000);
    return true;
  }

  /** Heartbeat voor admin last_activity_at; max. eens per 5 min, fire-and-forget. */
  function senseTouchUserActivity(sb) {
    try {
      if (!sb || typeof sb.rpc !== 'function') return;
      var now = Date.now();
      if (now - _senseLastActivityTouchAt < SENSE_ACTIVITY_TOUCH_MS) return;
      if (_senseLastActivityTouchBusy) return;
      _senseLastActivityTouchBusy = true;
      sb.rpc('touch_user_activity')
        .then(function () {
          _senseLastActivityTouchAt = Date.now();
        })
        .catch(function () {})
        .finally(function () {
          _senseLastActivityTouchBusy = false;
        });
    } catch (_e) {}
  }

  /** Compacte crisisregel voor losse AI-prompts (fallback als SenseiCore niet geladen is). */
  function senseGetCrisisRegelText() {
    try {
      if (window.SenseiCore && typeof window.SenseiCore.getCrisisRegel === 'function') {
        return window.SenseiCore.getCrisisRegel();
      }
    } catch (_e) {}
    return 'CRISIS: Bij signalen van zelfdoding, zichzelf iets aandoen, niet meer kunnen of willen, acuut gevaar, ernstige zelfbeschadiging, of acuut huiselijk geweld (subtiel of expliciet): antwoord niet met gewone adviezen. Start je antwoord met [CRISIS] en wijs de gebruiker warm door naar professionele hulp of een crisislijn in hun regio.';
  }

  /** Detecteert en stript de [CRISIS]-marker uit AI-output. */
  function senseExtractCrisisFlag(text) {
    var s = String(text || '');
    var m = s.match(/^\s*\[CRISIS\]\s*/i);
    if (!m) return { crisis: false, text: s };
    return { crisis: true, text: s.slice(m[0].length).trim() };
  }

  var _SENSE_CRISIS_KEYWORD_PATTERNS = [
    /\bzelfmoord/i,
    /\bzelfdod/i,
    /\been\s+eind(e)?\s+(aan\s+)?(mijn|m'n|me|mn)?\s*leven/i,
    /\bniet\s+meer\s+(willen\s+)?leven/i,
    /\buit\s+het\s+leven\s+stappen/i,
    /\bmezelf\s+(iets|wat)\s+aandoen/i,
    /\bmezelf\s+(pijn(igen)?|kwetsen)/i,
    /\bdood\s+(wil(len)?|gaan)/i,
    /\bsterven\s+wil/i,
    /\bvan\s+de\s+(brug|toren|trap)/i,
    /\bsuicid/i,
    /\bsuïcid/i
  ];

  /** Client-side crisis-keywords (SelfSense). */
  function senseDetectCrisisKeywords(text) {
    var t = String(text || '').toLowerCase();
    return _SENSE_CRISIS_KEYWORD_PATTERNS.some(function (re) { return re.test(t); });
  }

  /** Statische crisiskaart voor Date/Family/Friend (geen volledige hulplijnenlijst). */
  function senseRenderCrisisCardHtml() {
    return '<div class="sense-crisis-card" style="margin:0 0 12px;padding:14px 14px;border-radius:14px;background:#FFF4F2;border:1px solid #E8BBB9;color:#3D2F1F;font-size:14px;line-height:1.55">'
      + '<div style="font-weight:800;margin-bottom:6px">Je hoeft dit niet alleen te dragen</div>'
      + '<div style="margin-bottom:8px">Wat je deelt klinkt zwaar. Sensei is geen vervanging voor echte hulp. Praat met iemand die er nu voor je kan zijn:</div>'
      + '<div>Zelfmoordlijn 1813: bel gratis <strong>1813</strong> of chat via <strong>zelfmoord1813.be</strong></div>'
      + '<div>Tele-Onthaal: bel <strong>106</strong> (24/7, anoniem)</div>'
      + '<div>Bij acuut gevaar: bel <strong>112</strong></div>'
      + '<div style="margin-top:10px;font-size:13px"><a href="selfsense.html" style="color:#8E2B20;font-weight:700;text-decoration:underline">Open SelfSense</a> voor het volledige overzicht van hulplijnen.</div>'
      + '</div>';
  }

  /** Stript [CRISIS], optioneel crisiskaart, formatteert AI-tekst via app-specifieke formatAiCard. */
  function senseWrapAiCardWithCrisis(formatAiCardFn, raw) {
    var crisisRes = senseExtractCrisisFlag(raw);
    var block = crisisRes.crisis ? senseRenderCrisisCardHtml() : '';
    var card = typeof formatAiCardFn === 'function'
      ? formatAiCardFn(crisisRes.text)
      : String(crisisRes.text || '');
    return { html: block + card, text: crisisRes.text, crisis: crisisRes.crisis };
  }

  global.senseGetCrisisRegelText = senseGetCrisisRegelText;
  global.senseExtractCrisisFlag = senseExtractCrisisFlag;
  global.senseDetectCrisisKeywords = senseDetectCrisisKeywords;
  global.senseRenderCrisisCardHtml = senseRenderCrisisCardHtml;
  global.senseWrapAiCardWithCrisis = senseWrapAiCardWithCrisis;
  global.senseIsUnsafePhotoUrl = senseIsUnsafePhotoUrl;
  global.senseIsAllowedReturnTo = senseIsAllowedReturnTo;
  global.senseNormalizeReturnTo = senseNormalizeReturnTo;
  global.senseCalcAgeFromBirthdate = senseCalcAgeFromBirthdate;
  global.senseOwnBasisHasAge = senseOwnBasisHasAge;
  global.senseOwnBasisHasLocation = senseOwnBasisHasLocation;
  global.senseOwnBasisHasGenderAnswer = senseOwnBasisHasGenderAnswer;
  global.senseOwnBasisMetaComplete = senseOwnBasisMetaComplete;
  global.senseCountOwnBasisSlots = senseCountOwnBasisSlots;
  global.senseExtractOwnBasisMeta = senseExtractOwnBasisMeta;
  global.senseExtractOwnBasisMetaServerOnly = senseExtractOwnBasisMetaServerOnly;
  global.senseParseOwnHubBasisFallback = senseParseOwnHubBasisFallback;
  global.senseExtractOwnBasisMetaFromOwnCell = senseExtractOwnBasisMetaFromOwnCell;
  global.senseOwnBasisProfileCompleteFromOwnCell = senseOwnBasisProfileCompleteFromOwnCell;
  global.senseEnrichOwnBasisMetaInCell = senseEnrichOwnBasisMetaInCell;
  global.senseFormatOwnBasisGender = senseFormatOwnBasisGender;
  global.senseOwnBasisContextParts = senseOwnBasisContextParts;
  global.appendOwnBasisMetaCoachContext = appendOwnBasisMetaCoachContext;
  global.getBasisprofielNudge = getBasisprofielNudge;
  global.markBasisprofielNudgeSeen = markBasisprofielNudgeSeen;
  global.renderBasisprofielNudgeIfNeeded = renderBasisprofielNudgeIfNeeded;
  global.renderBasisprofielNudgeHtml = renderBasisprofielNudgeHtml;
  global.dismissBasisprofielNudge = dismissBasisprofielNudge;
  global.senseIsDirectlyLoadableImageUrl = senseIsDirectlyLoadableImageUrl;
  global.senseParseStorageRef = senseParseStorageRef;
  global.senseIsLikelyExpiringStorageUrl = senseIsLikelyExpiringStorageUrl;
  global.senseOwnPhotoBucketHints = senseOwnPhotoBucketHints;
  global.senseRefreshPhotoRef = senseRefreshPhotoRef;
  global.senseCollectOwnCategoryLines = senseCollectOwnCategoryLines;
  global.senseBuildOwnRecoContextPack = senseBuildOwnRecoContextPack;
  global.senseParseAandachtspuntEvidence = senseParseAandachtspuntEvidence;
  global.senseIsEigenAandachtspuntRow = senseIsEigenAandachtspuntRow;
  global.senseAandachtspuntOriginLabel = senseAandachtspuntOriginLabel;
  global.senseActiveBevestigdeAandachtspunten = senseActiveBevestigdeAandachtspunten;
  global.senseFormatAandachtspuntenCoachBlock = senseFormatAandachtspuntenCoachBlock;
  global.appendOwnAandachtspuntenCoachContext = appendOwnAandachtspuntenCoachContext;
  global.refreshOwnAandachtspuntenCoachContext = refreshOwnAandachtspuntenCoachContext;
  global.refreshOwnAandachtspuntenCoachContextAuto = refreshOwnAandachtspuntenCoachContextAuto;
  global.senseRecoNoFabricationRules = senseRecoNoFabricationRules;
  global.senseIsRateLimitMessage = senseIsRateLimitMessage;
  global.senseRecoStatusNoticeHtml = senseRecoStatusNoticeHtml;
  global.senseSparseDailyRecoFallback = senseSparseDailyRecoFallback;
  global.senseSparseDagAdviesFallback = senseSparseDagAdviesFallback;
  global.senseProbeProfileHasMsgs = senseProbeProfileHasMsgs;
  global.senseProbeUserRoleHasMsgs = senseProbeUserRoleHasMsgs;
  global.senseInvalidateProfileMsgsProbe = senseInvalidateProfileMsgsProbe;
  global.senseMarkProfileMsgsProbe = senseMarkProfileMsgsProbe;
  global.senseShouldUseSparseDailyRecoFallback = senseShouldUseSparseDailyRecoFallback;
  global.senseFetchDailyRecoTipText = senseFetchDailyRecoTipText;
  global.senseSetFieldSaveStatus = senseSetFieldSaveStatus;
  global.senseFieldSaveIdFromTextareaId = senseFieldSaveIdFromTextareaId;
  global.senseTouchUserActivity = senseTouchUserActivity;
  global.senseIsExpiredSessionError = senseIsExpiredSessionError;
  global.senseExpiredSessionUserMessage = senseExpiredSessionUserMessage;
  global.senseClearExpiredSessionStorage = senseClearExpiredSessionStorage;
  global.senseShowBootSessionExpiredBox = senseShowBootSessionExpiredBox;
  global.senseShowSessionExpiredScreen = senseShowSessionExpiredScreen;
  global.senseRecoverExpiredSession = senseRecoverExpiredSession;
  global.senseHandleExpiredSessionRejection = senseHandleExpiredSessionRejection;

  /* ------------------------------------------------------------------ */
  /* Gateway-Chat Fase 4: bridge handoff + confirmed proposals          */
  /* ------------------------------------------------------------------ */
  global._gatewayHandoffSummary = '';
  global._gatewayHandoffWarmPending = false;
  global._gatewayProposalsCoachContext = '';
  global._gatewayConfirmedProposals = [];

  function senseIsUuidLike(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || '').trim());
  }

  function senseGatewayDomainFromAppKey(appKey) {
    var k = String(appKey || '').trim().toLowerCase();
    if (k === 'ds' || k === 'date' || k === 'datesense') return 'date';
    if (k === 'fs' || k === 'family' || k === 'familysense') return 'family';
    if (k === 'fr' || k === 'friend' || k === 'friendsense') return 'friend';
    if (k === 'ss' || k === 'self' || k === 'selfsense') return 'self';
    return '';
  }

  function senseParseHandoffIdFromUrl() {
    try {
      var sp = new URLSearchParams(global.location && global.location.search ? global.location.search : '');
      var id = String(sp.get('handoff') || '').trim();
      return senseIsUuidLike(id) ? id : '';
    } catch (_e) {
      return '';
    }
  }

  function senseHasGatewayHandoffInUrl() {
    return !!senseParseHandoffIdFromUrl();
  }

  function senseStripHandoffFromUrl() {
    try {
      var sp = new URLSearchParams(global.location && global.location.search ? global.location.search : '');
      if (!sp.has('handoff')) return;
      sp.delete('handoff');
      var rest = sp.toString();
      var path = (global.location && global.location.pathname) || '';
      if (typeof global.history !== 'undefined' && global.history.replaceState) {
        global.history.replaceState(null, '', path + (rest ? '?' + rest : ''));
      }
    } catch (_e) {}
  }

  /**
   * Haalt een open bridge_handoffs-rij op, zet consumed_at, strip URL, optioneel delete.
   * Ongeldig of al geconsumeerd: stil null. Geen toast.
   */
  async function senseConsumeBridgeHandoff(opts) {
    opts = opts || {};
    var sb = opts.sb;
    var userId = String(opts.userId || '').trim();
    var expectedDomain = String(opts.expectedDomain || '').trim().toLowerCase();
    var id = senseParseHandoffIdFromUrl();
    senseStripHandoffFromUrl();
    if (!sb || !userId || !id) return null;
    try {
      var q = sb.from('bridge_handoffs')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .is('consumed_at', null);
      if (expectedDomain) q = q.eq('target_domain', expectedDomain);
      var upd = await q.select('id,context_summary,target_domain').maybeSingle();
      if (upd && upd.error) return null;
      var row = upd && upd.data;
      if (!row || !String(row.context_summary || '').trim()) return null;
      var summary = String(row.context_summary || '').trim().substring(0, 2000);
      global._gatewayHandoffSummary = summary;
      global._gatewayHandoffWarmPending = true;
      try {
        await sb.from('bridge_handoffs').delete().eq('id', row.id).eq('user_id', userId);
      } catch (_del) {}
      return {
        id: row.id,
        summary: summary,
        target_domain: String(row.target_domain || expectedDomain || '').trim()
      };
    } catch (_e) {
      return null;
    }
  }

  function senseAppendGatewayHandoffCoachContext(lines) {
    if (!lines) return;
    var summary = String(global._gatewayHandoffSummary || '').trim();
    if (!summary) return;
    lines.push(
      'GATEWAY-HANDOFF (interne context uit de SenseCorner Gateway-chat; de gebruiker komt hier verder praten):'
    );
    lines.push(summary.substring(0, 1800));
    lines.push(
      'Gebruik dit als achtergrond. Lees de samenvatting niet letterlijk voor. Verwijs hoogstens kort en warm terug naar het eerdere gesprek, zonder transcript te herhalen.'
    );
  }

  function senseGatewayWarmOpenText(appLabel) {
    var label = String(appLabel || 'deze app').trim() || 'deze app';
    return 'Welkom terug. Ik neem mee wat je net in de SenseCorner-hoofdchat deelde, zodat je hier in '
      + label
      + ' meteen verder kunt zonder opnieuw te beginnen. Waar wil je nu op inzoomen?';
  }

  /**
   * Toont een korte warme Sensei-bubbel na handoff (geen transcript-dump).
   * opts: { chatAreaEl, senderName, appLabel, addMsgFn }
   */
  function senseRenderGatewayWarmOpenIfNeeded(opts) {
    opts = opts || {};
    if (!global._gatewayHandoffWarmPending) return false;
    if (!String(global._gatewayHandoffSummary || '').trim()) {
      global._gatewayHandoffWarmPending = false;
      return false;
    }
    var text = senseGatewayWarmOpenText(opts.appLabel);
    var sender = String(opts.senderName || 'Sensei').trim() || 'Sensei';
    var ca = opts.chatAreaEl || (typeof document !== 'undefined' ? document.getElementById('chatArea') : null);
    if (!ca) return false;
    global._gatewayHandoffWarmPending = false;
    try {
      if (typeof opts.addMsgFn === 'function') {
        opts.addMsgFn('ai', '<div>' + senseEscHtml(text) + '</div>', { importedFrom: 'hoofdchat' });
        return true;
      }
    } catch (_add) {}
    try {
      var wrap = document.createElement('div');
      wrap.className = 'msg-ai';
      wrap.innerHTML = '<div class="bbl-ai" style="opacity:0.92"><div class="sndr">'
        + senseEscHtml(sender)
        + '</div><div style="line-height:1.55">'
        + senseEscHtml(text)
        + '</div></div>';
      ca.appendChild(wrap);
      return true;
    } catch (_e) {
      global._gatewayHandoffWarmPending = true;
      return false;
    }
  }

  /**
   * Bepaalt waar een bevestigd Gateway-voorstel in sense_messages landt.
   * - self: altijd OWN Sense (SelfSense / hub-tijdlijn)
   * - date/family/friend + bekend contactdossier: dat dossier (Sensei leest buildDossierContextForAI)
   * - date/family/friend zonder dossier: '' = geen sense_messages-write;
   *   Sensei ziet het via coach-context uit gateway_proposals (geen orphan OWN-only notitie)
   */
  function senseGatewayProposalLandingProfile(domain, targetProfile) {
    var d = String(domain || '').trim().toLowerCase();
    var tp = String(targetProfile || '').trim();
    if (d === 'self') return 'OWN Sense';
    if (tp && !/^own\s*sense$/i.test(tp)) return tp.substring(0, 120);
    if (tp && /^own\s*sense$/i.test(tp) && (d === 'date' || d === 'family' || d === 'friend')) {
      /* Expliciet OWN Sense: feit over de gebruiker zelf binnen dat domein. */
      return 'OWN Sense';
    }
    return '';
  }

  function senseGatewayDomainScopeKey(domain) {
    var d = String(domain || '').trim().toLowerCase();
    if (d === 'date') return 'ds';
    if (d === 'family') return 'fs';
    if (d === 'friend') return 'fr';
    if (d === 'self') return 'ss';
    return '';
  }

  function senseFormatGatewayProposalsCoachBlock(rows) {
    var list = (rows || []).filter(function (r) {
      return r && String(r.proposal_text || '').trim() && String(r.status || '') === 'confirmed';
    });
    if (!list.length) return '';
    var lines = [
      'VANUIT GATEWAY GENOTEERD (gebruiker bevestigde dit eerder in OwnSense; behandel als bekende context, niet opnieuw als voorstel):'
    ];
    list.slice(0, 12).forEach(function (r) {
      var txt = String(r.proposal_text || '').trim().substring(0, 280);
      var dos = String(r.target_profile || '').trim();
      if (dos && !/^own\s*sense$/i.test(dos)) {
        lines.push('- [' + dos + '] ' + txt);
      } else {
        lines.push('- ' + txt);
      }
    });
    return lines.join('\n');
  }

  async function senseFetchConfirmedGatewayProposals(sb, userId, domain) {
    if (!sb || !userId || !domain) return [];
    try {
      var res = await sb.from('gateway_proposals')
        .select('id,proposal_text,status,target_domain,target_profile,resolved_at,created_at')
        .eq('user_id', userId)
        .eq('target_domain', domain)
        .eq('status', 'confirmed')
        .order('resolved_at', { ascending: false })
        .limit(20);
      if (res && res.error) {
        /* Oudere DB zonder target_profile: gracefully degrade. */
        var res2 = await sb.from('gateway_proposals')
          .select('id,proposal_text,status,target_domain,resolved_at,created_at')
          .eq('user_id', userId)
          .eq('target_domain', domain)
          .eq('status', 'confirmed')
          .order('resolved_at', { ascending: false })
          .limit(20);
        if (res2 && res2.error) return [];
        return (res2 && res2.data) || [];
      }
      return (res && res.data) || [];
    } catch (_e) {
      return [];
    }
  }

  async function senseRefreshGatewayProposalsCoachContext(sb, userId, domain) {
    global._gatewayProposalsCoachContext = '';
    global._gatewayConfirmedProposals = [];
    var rows = await senseFetchConfirmedGatewayProposals(sb, userId, domain);
    global._gatewayConfirmedProposals = rows || [];
    var block = senseFormatGatewayProposalsCoachBlock(rows);
    if (block) global._gatewayProposalsCoachContext = block;
    return rows;
  }

  function senseAppendGatewayProposalsCoachContext(lines) {
    if (!lines) return;
    var block = String(global._gatewayProposalsCoachContext || '').trim();
    if (block) lines.push(block);
  }

  function senseGatewayProposalMsgMarker(id) {
    return 'gwprop:' + String(id || '').trim();
  }

  /**
   * Maakt notities uit de SenseCorner-hoofdchat gebruikersvriendelijk:
   * verwijdert interne gwprop:-codes en hernoemt "Gateway" naar "hoofdchat".
   * Werkt op HTML én platte tekst (tijdlijn na stripHtml).
   */
  function senseSanitizeGwProposalUserFacing(htmlOrText) {
    var s = String(htmlOrText == null ? '' : htmlOrText);
    if (!s) return s;
    s = s.replace(/\bgwprop:[0-9a-fA-F-]{8,}\b\s*/g, '');
    s = s.replace(/Vanuit Gateway \(bevestigd\)/gi, 'Vanuit hoofdchat (bevestigd)');
    s = s.replace(/Vanuit Gateway genoteerd/gi, 'Vanuit hoofdchat genoteerd');
    s = s.replace(/Vanuit Gateway/gi, 'Vanuit hoofdchat');
    s = s.replace(/\bGateway-notitie\b/gi, 'Hoofdchat-notitie');
    s = s.replace(/\s{2,}/g, ' ');
    return s;
  }

  function senseGatewayProposalDossierHtml(row) {
    var id = String((row && row.id) || '').trim();
    var text = String((row && row.proposal_text) || '').trim().substring(0, 1000);
    /* Interne id alleen in data-attribuut (idempotentie); nooit zichtbaar in tijdlijn. */
    return '<div class="gw-dossier-note" data-gw-proposal-id="'
      + senseEscHtml(id)
      + '">Vanuit hoofdchat (bevestigd): '
      + senseEscHtml(text)
      + '</div>';
  }

  async function senseProposalAlreadyInDossier(sb, userId, profileName, proposalId) {
    if (!sb || !userId || !proposalId || !profileName) return false;
    var marker = senseGatewayProposalMsgMarker(proposalId);
    var attrNeedle = 'data-gw-proposal-id="' + String(proposalId).trim() + '"';
    try {
      var res = await sb.from('sense_messages')
        .select('id')
        .eq('user_id', userId)
        .eq('profile_name', profileName)
        .or('html.ilike.%' + marker + '%,html.ilike.%' + attrNeedle + '%')
        .limit(1);
      if (res && res.error) {
        /* Fallback als .or filter faalt: oude marker of nieuw data-attribuut apart. */
        var a = await sb.from('sense_messages')
          .select('id')
          .eq('user_id', userId)
          .eq('profile_name', profileName)
          .ilike('html', '%' + marker + '%')
          .limit(1);
        if (a && !a.error && a.data && a.data.length) return true;
        var b = await sb.from('sense_messages')
          .select('id')
          .eq('user_id', userId)
          .eq('profile_name', profileName)
          .ilike('html', '%' + attrNeedle + '%')
          .limit(1);
        return !!(b && !b.error && b.data && b.data.length);
      }
      return !!(res && res.data && res.data.length);
    } catch (_e) {
      return false;
    }
  }

  /**
   * Schrijft bevestigde gateway_proposals naar sense_messages in het juiste dossier,
   * idempotent via data-gw-proposal-id (en legacy gwprop:-marker).
   * Gebruiker bevestigde al in de SenseCorner-hoofdchat.
   * Zonder landing-profiel (date/family/friend zonder contact): skip write;
   * coach-context uit gateway_proposals blijft de Sensei-bron.
   */
  async function senseIngestConfirmedGatewayProposals(opts) {
    opts = opts || {};
    var sb = opts.sb;
    var userId = String(opts.userId || '').trim();
    var domain = String(opts.domain || '').trim();
    var forcedProfile = String(opts.profileName || '').trim();
    if (!sb || !userId || !domain) return [];
    var rows = Array.isArray(opts.rows) ? opts.rows : await senseFetchConfirmedGatewayProposals(sb, userId, domain);
    var written = [];
    var touchedProfiles = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !row.id) continue;
      var text = String(row.proposal_text || '').trim();
      if (!text) continue;
      var profileName = forcedProfile
        || senseGatewayProposalLandingProfile(domain, row.target_profile);
      if (!profileName) continue;
      try {
        var exists = await senseProposalAlreadyInDossier(sb, userId, profileName, row.id);
        if (exists) continue;
        var html = senseGatewayProposalDossierHtml(row);
        var ins = await sb.from('sense_messages').insert({
          user_id: userId,
          profile_name: profileName,
          role: 'user',
          html: html
        }).select('id').maybeSingle();
        if (ins && !ins.error && ins.data) {
          written.push(row.id);
          touchedProfiles[profileName] = 1;
        }
      } catch (_w) {}
    }
    if (written.length && typeof senseInvalidateProfileMsgsProbe === 'function') {
      Object.keys(touchedProfiles).forEach(function (pn) {
        try { senseInvalidateProfileMsgsProbe(userId, pn); } catch (_inv) {}
      });
    }
    return written;
  }

  /**
   * Coach-taken voor Home/Meldingen: bevestigde Gateway-notities (informatief).
   * opts: { escHtmlFn, escJsStrFn, openOwnAction, openDossierActionFn(name) }
   */
  function senseBuildGatewayProposalCoachTasks(opts) {
    opts = opts || {};
    var esc = typeof opts.escHtmlFn === 'function' ? opts.escHtmlFn : senseEscHtml;
    var openOwnAction = String(opts.openOwnAction || "viewDossier('OWN Sense')").trim();
    var openDosFn = typeof opts.openDossierActionFn === 'function' ? opts.openDossierActionFn : null;
    var rows = global._gatewayConfirmedProposals || [];
    var tasks = [];
    rows.slice(0, 5).forEach(function (r) {
      if (!r || !r.id) return;
      var txt = String(r.proposal_text || '').trim();
      if (!txt) return;
      var short = txt.length > 140 ? txt.substring(0, 140) + '…' : txt;
      var domain = String(r.target_domain || '').trim();
      var landing = senseGatewayProposalLandingProfile(domain, r.target_profile);
      var dossier = landing || 'OWN Sense';
      var action = openDosFn ? openDosFn(dossier) : (
        dossier === 'OWN Sense' ? openOwnAction : ("viewDossier('" + String(dossier).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "')")
      );
      var where = landing && !/^own\s*sense$/i.test(landing)
        ? (' bij <strong>' + esc(landing) + '</strong>')
        : '';
      tasks.push({
        id: 'gw-proposal-' + String(r.id),
        type: 's',
        prio: 'low',
        dossier: dossier,
        msg: 'Vanuit hoofdchat genoteerd' + where + ': <strong>' + esc(short) + '</strong>',
        openMsg: 'Nog openstaand: hoofdchat-notitie bekijken.',
        link: landing && !/^own\s*sense$/i.test(landing) ? ('Open ' + landing + ' →') : 'Open dossier →',
        action: action
      });
    });
    return tasks;
  }

  async function senseApplyGatewayBridgeBoot(opts) {
    opts = opts || {};
    var out = { handoff: null, proposals: [] };
    try {
      out.handoff = await senseConsumeBridgeHandoff({
        sb: opts.sb,
        userId: opts.userId,
        expectedDomain: opts.domain
      });
    } catch (_h) {}
    try {
      out.proposals = await senseRefreshGatewayProposalsCoachContext(opts.sb, opts.userId, opts.domain) || [];
    } catch (_p) {}
    try {
      /* Geen geforceerd OWN Sense meer: landing per rij via target_profile / domein. */
      await senseIngestConfirmedGatewayProposals({
        sb: opts.sb,
        userId: opts.userId,
        domain: opts.domain,
        rows: out.proposals
      });
    } catch (_i) {}
    /* Na late consume (fastPaint): warme open als Vertel al open staat. */
    if (out.handoff && global._gatewayHandoffWarmPending) {
      try {
        senseRenderGatewayWarmOpenIfNeeded({
          chatAreaEl: typeof document !== 'undefined' ? document.getElementById('chatArea') : null,
          senderName: opts.senderName || 'Sensei',
          appLabel: opts.appLabel || '',
          addMsgFn: typeof global.addMsg === 'function' ? global.addMsg : null
        });
      } catch (_w) {}
    }
    return out;
  }

  global.senseIsUuidLike = senseIsUuidLike;
  global.senseGatewayDomainFromAppKey = senseGatewayDomainFromAppKey;
  global.senseGatewayDomainScopeKey = senseGatewayDomainScopeKey;
  global.senseGatewayProposalLandingProfile = senseGatewayProposalLandingProfile;
  global.senseParseHandoffIdFromUrl = senseParseHandoffIdFromUrl;
  global.senseHasGatewayHandoffInUrl = senseHasGatewayHandoffInUrl;
  global.senseStripHandoffFromUrl = senseStripHandoffFromUrl;
  global.senseConsumeBridgeHandoff = senseConsumeBridgeHandoff;
  global.senseAppendGatewayHandoffCoachContext = senseAppendGatewayHandoffCoachContext;
  global.senseGatewayWarmOpenText = senseGatewayWarmOpenText;
  global.senseRenderGatewayWarmOpenIfNeeded = senseRenderGatewayWarmOpenIfNeeded;
  global.senseFormatGatewayProposalsCoachBlock = senseFormatGatewayProposalsCoachBlock;
  global.senseFetchConfirmedGatewayProposals = senseFetchConfirmedGatewayProposals;
  global.senseRefreshGatewayProposalsCoachContext = senseRefreshGatewayProposalsCoachContext;
  global.senseAppendGatewayProposalsCoachContext = senseAppendGatewayProposalsCoachContext;
  global.senseIngestConfirmedGatewayProposals = senseIngestConfirmedGatewayProposals;
  global.senseBuildGatewayProposalCoachTasks = senseBuildGatewayProposalCoachTasks;
  global.senseApplyGatewayBridgeBoot = senseApplyGatewayBridgeBoot;
  global.senseSanitizeGwProposalUserFacing = senseSanitizeGwProposalUserFacing;
})(typeof window !== 'undefined' ? window : this);
