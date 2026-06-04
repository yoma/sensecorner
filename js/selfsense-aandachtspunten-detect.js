/**
 * Fire-and-forget trigger voor SelfSense aandachtspunten-detectie (Fase 2).
 * Vereist: sb (Supabase client), SURL, ingelogde sessie met AI-toegang.
 */
(function (global) {
  "use strict";

  function getSupabaseUrl() {
    return String(global.SURL || global.SUPABASE_URL || "").trim();
  }

  async function getAccessToken() {
    var sb = global.sb || global.__obSupabase;
    if (!sb || !sb.auth) return "";
    try {
      var sess = await sb.auth.getSession();
      return sess && sess.data && sess.data.session && sess.data.session.access_token
        ? String(sess.data.session.access_token)
        : "";
    } catch (_e) {
      return "";
    }
  }

  /**
   * Roept de offline detectie-edge function aan.
   * Gebruikt in selfsense.html (na check-in + debounced home-bootstrap) en onboarding.html.
   * @param {Object} [opts]
   * @param {boolean} [opts.awaitResult=false] - wacht op JSON-antwoord (home-bootstrap, tests)
   * @returns {Promise<Object|null>} geparsed JSON of null bij netwerk/auth-fout
   */
  async function detectSelfsenseAandachtspuntenFireAndForget(opts) {
    opts = opts || {};
    var base = getSupabaseUrl();
    if (!base) {
      console.warn("[aandachtspunten-detect] geen SURL");
      return null;
    }
    var token = await getAccessToken();
    if (!token) return null;
    var url = base.replace(/\/$/, "") + "/functions/v1/selfsense-aandachtspunten-detect";
    try {
      var res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({})
      });
      var raw = await res.text();
      var data = null;
      try {
        data = JSON.parse(raw);
      } catch (_pe) {
        data = { ok: false, raw: raw, status: res.status };
      }
      if (!res.ok && data && !data.error) {
        data = Object.assign({}, data, { ok: false, httpStatus: res.status });
      }
      return data;
    } catch (err) {
      console.warn("[aandachtspunten-detect]", err);
      return null;
    }
  }

  global.detectSelfsenseAandachtspuntenFireAndForget = detectSelfsenseAandachtspuntenFireAndForget;
})(typeof window !== "undefined" ? window : globalThis);
