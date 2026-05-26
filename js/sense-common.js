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

  global.senseIsUnsafePhotoUrl = senseIsUnsafePhotoUrl;
  global.senseIsAllowedReturnTo = senseIsAllowedReturnTo;
  global.senseNormalizeReturnTo = senseNormalizeReturnTo;
})(typeof window !== 'undefined' ? window : this);
