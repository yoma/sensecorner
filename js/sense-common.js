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
    var apiTimeoutMs = pack.sparse ? 20000 : 45000;
    var apiTimeoutPlainMs = pack.sparse ? 20000 : 15000;
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
        if (senseIsRateLimitMessage(msg1)) {
          throw e1;
        }
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
})(typeof window !== 'undefined' ? window : this);
