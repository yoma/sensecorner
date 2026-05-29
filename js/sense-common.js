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

  function senseOwnBasisMetaComplete(meta) {
    meta = meta && typeof meta === 'object' ? meta : {};
    return !!(
      String(meta.birthdate || '').trim() &&
      (String(meta.city || '').trim() || String(meta.country || '').trim())
    );
  }

  /** props.meta + legacy props-root + optioneel hub-bridge (zelfde velden als OwnSense hubState). */
  function senseExtractOwnBasisMeta(props, hubFallback) {
    props = props && typeof props === 'object' ? props : {};
    var meta =
      props.meta && typeof props.meta === 'object' ? Object.assign({}, props.meta) : {};
    ['birthdate', 'city', 'country', 'gender', 'gender_custom', 'age'].forEach(function (k) {
      if (!String(meta[k] || '').trim() && props[k] != null && String(props[k]).trim()) {
        meta[k] = String(props[k]).trim();
      }
    });
    if (hubFallback && typeof hubFallback === 'object') {
      ['birthdate', 'city', 'country', 'gender', 'gender_custom'].forEach(function (k) {
        if (!String(meta[k] || '').trim()) meta[k] = String(hubFallback[k] || '').trim();
      });
    }
    return meta;
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
    if (city) parts.push('woonplaats ' + city);
    var country = String(meta.country || '').trim();
    if (country && !city) parts.push('land ' + country);
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
      return true;
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
    if (senseOwnBasisMetaComplete(meta)) {
      if (!String(meta.gender || '').trim() && !senseBasisprofielNudgeSeenToday(appKey, 'gender')) {
        return {
          id: 'gender',
          title: 'Optioneel: geslacht',
          message: 'Als je wilt, vul je geslacht aan in je basisprofiel. Sensei kan advies dan iets beter afstemmen. Je mag dit ook overslaan.',
          link: link,
          linkLabel: 'Basisprofiel openen'
        };
      }
      return null;
    }
    if (senseBasisprofielNudgeSeenToday(appKey, 'basis')) return null;
    var missing = [];
    if (!String(meta.birthdate || '').trim()) missing.push('geboortedatum');
    if (!String(meta.city || '').trim() && !String(meta.country || '').trim()) missing.push('woonplaats');
    var msg =
      missing.length === 2
        ? 'Vul je geboortedatum en gemeente aan in OwnSense. Dat helpt Sensei om advies beter op jouw leeftijd en regio af te stemmen.'
        : 'Vul je ' + missing.join(' en ') + ' aan in OwnSense. Dat helpt Sensei om advies beter op jou af te stemmen.';
    return {
      id: 'basis',
      title: 'Basisprofiel aanvullen',
      message: msg,
      link: link,
      linkLabel: 'Nu aanvullen'
    };
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
      '<button type="button" class="sc-basis-nudge__secondary" style="display:inline-flex;align-items:center;font-size:12px;font-weight:600;padding:6px 4px;border:none;background:transparent;color:#7A6F66;text-decoration:underline;cursor:pointer;font-family:inherit" onclick="dismissBasisprofielNudge(\'' +
      ak +
      "','" +
      nid +
      '\')">Later vandaag</button>' +
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

  global.senseIsUnsafePhotoUrl = senseIsUnsafePhotoUrl;
  global.senseIsAllowedReturnTo = senseIsAllowedReturnTo;
  global.senseNormalizeReturnTo = senseNormalizeReturnTo;
  global.senseCalcAgeFromBirthdate = senseCalcAgeFromBirthdate;
  global.senseOwnBasisMetaComplete = senseOwnBasisMetaComplete;
  global.senseExtractOwnBasisMeta = senseExtractOwnBasisMeta;
  global.senseFormatOwnBasisGender = senseFormatOwnBasisGender;
  global.senseOwnBasisContextParts = senseOwnBasisContextParts;
  global.appendOwnBasisMetaCoachContext = appendOwnBasisMetaCoachContext;
  global.getBasisprofielNudge = getBasisprofielNudge;
  global.markBasisprofielNudgeSeen = markBasisprofielNudgeSeen;
  global.renderBasisprofielNudgeIfNeeded = renderBasisprofielNudgeIfNeeded;
  global.renderBasisprofielNudgeHtml = renderBasisprofielNudgeHtml;
  global.dismissBasisprofielNudge = dismissBasisprofielNudge;
})(typeof window !== 'undefined' ? window : this);
