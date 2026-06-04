/**
 * Gedeeld mirror-lifecycle model: status, intake, pauzeren en hub/app-gates.
 */
(function (global) {
  var PROFILE_NAME_BY_MIRROR = {
    date: "DateSense",
    family: "FamilySense",
    friend: "FriendSense",
    self: "SelfSense"
  };

  var PROFILE_MIRROR_BY_NAME = {
    datesense: "date",
    familysense: "family",
    friendsense: "friend",
    selfsense: "self"
  };

  var MIRROR_APP_KEYS = {
    date: "ds",
    family: "fs",
    friend: "fr",
    self: "ss"
  };

  var APP_MIRROR_IDS = {
    ds: "date",
    fr: "friend",
    fs: "family",
    ss: "self"
  };

  var OPTIONAL_MIRROR_IDS = ["date", "family", "friend"];

  var ANSWER_KEY_TO_SUB = {
    core_1: "core_friends_view",
    core_2: "core_daily_joy",
    core_3: "core_recharge",
    core_4: "core_emotion_sharing",
    core_5: "core_friction",
    date_1: "date_safety",
    date_2: "date_overcommit",
    family_1: "family_meaning",
    family_2: "family_friction",
    friend_1: "friend_values",
    friend_2: "friend_conflict",
    self_1: "actuele_situatie",
    self_2: "goede_dag",
    self_3: "doelen",
    self_4: "constraint",
    self_5: "self_checkin_mood",
    self_6: "steunbronnen"
  };

  var MIRROR_META = {
    date: {
      letter: "D",
      name: "DateSense",
      intro: "Nu iets over daten of je relatie.",
      q1: "Wat heb je nodig om je veilig te voelen bij iemand?",
      h1: "Denk aan hoe iemand met je praat, kijkt en luistert.",
      q2: "Wanneer voel je je het snelst onrustig of onzeker bij iemand.",
      h2: "Mag heel klein zijn: voor een afspraak, na een bericht, als het stil wordt.",
      sum: "Je merkt waar rust of duidelijkheid voor je telt. Je voelt ook momenten waar contact met iemand onzeker voelt. Dat neem ik mee."
    },
    family: {
      letter: "F",
      name: "FamilySense",
      intro: "Nu iets over familie.",
      q1: "Wat betekent familie voor jou?",
      h1: "Je eigen definitie: bloedband, keuze of allebei.",
      q2: "Zijn er problemen thuis waar je vaak op terugbotst?",
      h2: "Het mag een situatie zijn, niet per se een persoon.",
      sum: "Wat je over familie en thuis zei, neem ik mee zoals je het zelf formuleerde."
    },
    friend: {
      letter: "V",
      name: "FriendSense",
      intro: "Nu iets over vriendschap.",
      q1: "Wat vind je belangrijk in een vriendschap?",
      h1: "Denk aan wat je mist als het er niet is.",
      q2: "Hoe ga je om met meningsverschillen met een vriend?",
      h2: "Denk aan een recent voorbeeld, hoe klein ook.",
      sum: "Je weet wat een vriendschap voor jou echt maakt. En je merkt dat wrijving je iets kost. Dat neem ik mee."
    },
    self: {
      letter: "S",
      name: "SelfSense",
      intro: "Nu iets over jezelf. Dit is de intake van SelfSense.",
      questions: [
        {
          q: "Wat houdt je op dit moment het meest bezig? Wat heeft je hierheen gebracht?",
          h: "Beschrijf wat nu het meest op de voorgrond staat."
        },
        {
          q: "Wat zou voor jou nu een goede dag zijn? Of een dag die meevalt?",
          h: "Een klein teken van ademruimte is ook goed."
        },
        {
          q: "Wat wil je graag bereiken? Of voelt bereiken te veel als druk?",
          h: "Je mag ook zeggen dat je vooral rust zoekt."
        },
        { q: "Wat werkt absoluut niet voor jou?", h: "Noem dingen die Sensei beter niet voorstelt." },
        {
          q: "Hoe voel je je op dit moment?",
          options: [
            { id: "hetzelfde", label: "Ik voel me oké" },
            { id: "minder goed", label: "Het weegt soms" },
            { id: "heel zwaar", label: "Het is zwaar" },
            { id: "heel zwaar", label: "Het is overweldigend" }
          ]
        },
        {
          q: "Heb je dingen waarop je kunt terugvallen? Mensen, gewoontes, plekken, professionele hulp: wat voor jou werkt.",
          h: "Alles wat je ondersteunt mag hier staan."
        }
      ],
      sum: "Je bracht helder in kaart wat nu speelt, wat je nodig hebt en wat niet werkt voor jou. Dat is sterke basisinformatie voor SelfSense."
    }
  };

  var ANSWER_KEYS_BY_MIRROR = {
    date: ["date_1", "date_2"],
    family: ["family_1", "family_2"],
    friend: ["friend_1", "friend_2"],
    self: ["self_1", "self_2", "self_3", "self_4", "self_5", "self_6"]
  };

  var STATUS_LABELS = {
    active: "Actief",
    never_opened: "Nog niet gestart",
    paused: "On hold",
    setting_up: "Instellen"
  };

  function getMirrorQuestions(mirrorId, meta) {
    meta = meta || MIRROR_META[mirrorId];
    if (!meta) return [];
    if (Array.isArray(meta.questions) && meta.questions.length) return meta.questions;
    return [
      { q: meta.q1, h: meta.h1 },
      { q: meta.q2, h: meta.h2 }
    ];
  }

  function normalizeProfileNameKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function profileRowForMirror(rows, mirrorId) {
    var want = PROFILE_NAME_BY_MIRROR[mirrorId];
    if (!want) return null;
    var key = normalizeProfileNameKey(want);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (normalizeProfileNameKey(r && r.name) === key) return r;
    }
    return null;
  }

  function isProfilePaused(props) {
    props = props && typeof props === "object" ? props : {};
    if (String(props.mirror_status || "").toLowerCase() === "paused") return true;
    return !!String(props.paused_at || "").trim();
  }

  function normalizeOnboardingMirrors(inputSet) {
    var out = new Set(["own", "self"]);
    if (!inputSet || typeof inputSet.forEach !== "function") {
      out.add("date");
      return out;
    }
    inputSet.forEach(function (m) {
      if (m && m !== "own") out.add(m);
    });
    if (!out.has("self")) out.add("self");
    var optionalOn = OPTIONAL_MIRROR_IDS.filter(function (m) {
      return out.has(m);
    });
    if (!optionalOn.length) out.add("date");
    return out;
  }

  function countOptionalMirrors(selectedMirrors) {
    var n = 0;
    OPTIONAL_MIRROR_IDS.forEach(function (m) {
      if (selectedMirrors && selectedMirrors.has && selectedMirrors.has(m)) n++;
    });
    return n;
  }

  async function withRetries(fn, max) {
    max = max || 3;
    var lastErr;
    for (var attempt = 0; attempt < max; attempt++) {
      try {
        var out = await fn();
        if (out && out.error) throw new Error(out.error.message || "request error");
        return out;
      } catch (e) {
        lastErr = e;
        if (attempt < max - 1) {
          await new Promise(function (r) {
            setTimeout(r, 800);
          });
        }
      }
    }
    throw lastErr;
  }

  async function fetchProfiles(sb, userId) {
    if (!sb || !userId) return [];
    var res = await sb.from("sense_profiles").select("name,props,last_active").eq("user_id", userId);
    if (res && res.error) throw new Error(res.error.message || "Profielen laden mislukt");
    return Array.isArray(res.data) ? res.data : [];
  }

  function deriveStatusFromRow(row, appKey) {
    if (!row) return "never_opened";
    var props = row.props && typeof row.props === "object" ? row.props : {};
    if (isProfilePaused(props)) return "paused";
    try {
      if (sessionStorage.getItem("sc_mirror_setting_up_" + appKey) === "1") return "setting_up";
    } catch (_e) {}
    return "active";
  }

  async function getMirrorStatuses(sb, userId) {
    var rows = await fetchProfiles(sb, userId);
    var out = { ds: "never_opened", fr: "never_opened", fs: "never_opened", ss: "never_opened" };
    Object.keys(APP_MIRROR_IDS).forEach(function (appKey) {
      var mirrorId = APP_MIRROR_IDS[appKey];
      var row = profileRowForMirror(rows, mirrorId);
      out[appKey] = deriveStatusFromRow(row, appKey);
    });
    return out;
  }

  function setSettingUpFlag(appKey, on) {
    try {
      var k = "sc_mirror_setting_up_" + appKey;
      if (on) sessionStorage.setItem(k, "1");
      else sessionStorage.removeItem(k);
    } catch (_e) {}
  }

  async function mirrorHasOnboardingFacts(sb, userId, mirrorIdOrAppKey) {
    if (!sb || !userId) return false;
    var mirrorId = APP_MIRROR_IDS[mirrorIdOrAppKey] || mirrorIdOrAppKey;
    var keys = ANSWER_KEYS_BY_MIRROR[mirrorId];
    if (!keys || !keys.length) return false;
    var subs = keys.map(function (k) {
      return ANSWER_KEY_TO_SUB[k];
    });
    var res = await sb
      .from("own_facts")
      .select("id")
      .eq("user_id", userId)
      .eq("source_app", "onboarding")
      .in("subcategory", subs)
      .limit(1);
    return !!(res && res.data && res.data.length);
  }

  async function insertOnboardingFact(sb, userId, subcategory, factText) {
    if (!sb || !userId || !subcategory) return { error: new Error("Geen verbinding") };
    var row = {
      user_id: userId,
      category: "onboarding",
      subcategory: subcategory,
      fact_text: String(factText || "").trim(),
      source_app: "onboarding",
      source_dossier: null,
      source_session_id: null,
      confidence: 1.0,
      status: "accepted"
    };
    return withRetries(function () {
      return sb.from("own_facts").insert(row).select("id").maybeSingle();
    }, 2);
  }

  async function saveMirrorIntakeFacts(sb, userId, mirrorId, answersByKey) {
    answersByKey = answersByKey && typeof answersByKey === "object" ? answersByKey : {};
    var keys = ANSWER_KEYS_BY_MIRROR[mirrorId] || [];
    for (var i = 0; i < keys.length; i++) {
      var ak = keys[i];
      var sub = ANSWER_KEY_TO_SUB[ak];
      var text = String(answersByKey[ak] || "").trim();
      if (!sub || !text) continue;
      await insertOnboardingFact(sb, userId, sub, text);
    }
  }

  function buildAnswersFromIntake(mirrorId, responses) {
    var keys = ANSWER_KEYS_BY_MIRROR[mirrorId] || [];
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = String((responses && responses[i]) || "").trim();
    }
    return out;
  }

  async function activateMirror(sb, userId, mirrorIdOrAppKey, via) {
    if (!sb || !userId) return { error: new Error("Geen sessie") };
    var mirrorId = APP_MIRROR_IDS[mirrorIdOrAppKey] || mirrorIdOrAppKey;
    var name = PROFILE_NAME_BY_MIRROR[mirrorId];
    if (!name) return { error: new Error("Onbekende spiegel") };
    var appKey = MIRROR_APP_KEYS[mirrorId];
    var iso = new Date().toISOString();
    var sel = await sb
      .from("sense_profiles")
      .select("props")
      .eq("user_id", userId)
      .eq("name", name)
      .maybeSingle();
    var base =
      sel && sel.data && sel.data.props && typeof sel.data.props === "object" ? sel.data.props : {};
    var props = Object.assign({}, base, {
      activated_at: base.activated_at || iso,
      via: via || base.via || "hub",
      mirror_status: "active"
    });
    delete props.paused_at;
    var payload = {
      user_id: userId,
      name: name,
      phone: null,
      props: props,
      last_active: iso
    };
    var up = await withRetries(function () {
      return sb.from("sense_profiles").upsert(payload, { onConflict: "user_id,name" });
    }, 3);
    if (up && up.error) return { error: up.error };
    if (appKey) setSettingUpFlag(appKey, false);
    return { ok: true };
  }

  async function pauseMirror(sb, userId, mirrorIdOrAppKey) {
    if (!sb || !userId) return { error: new Error("Geen sessie") };
    var mirrorId = APP_MIRROR_IDS[mirrorIdOrAppKey] || mirrorIdOrAppKey;
    var name = PROFILE_NAME_BY_MIRROR[mirrorId];
    if (!name) return { error: new Error("Onbekende spiegel") };
    var row = await sb
      .from("sense_profiles")
      .select("props")
      .eq("user_id", userId)
      .eq("name", name)
      .maybeSingle();
    if (!row || !row.data) return { error: new Error("Spiegel is nog niet gestart") };
    var iso = new Date().toISOString();
    var props = Object.assign(
      {},
      row.data.props && typeof row.data.props === "object" ? row.data.props : {},
      { mirror_status: "paused", paused_at: iso }
    );
    var up = await sb
      .from("sense_profiles")
      .update({ props: props, last_active: iso })
      .eq("user_id", userId)
      .eq("name", name);
    if (up && up.error) return { error: up.error };
    return { ok: true };
  }

  async function resumeMirror(sb, userId, mirrorIdOrAppKey) {
    if (!sb || !userId) return { error: new Error("Geen sessie") };
    var mirrorId = APP_MIRROR_IDS[mirrorIdOrAppKey] || mirrorIdOrAppKey;
    return activateMirror(sb, userId, mirrorId, "reactivated");
  }

  async function saveSelectedMirrors(sb, userId, selectedMirrors) {
    if (!sb || !userId) return "";
    var normalized = normalizeOnboardingMirrors(selectedMirrors);
    var iso = new Date().toISOString();
    var extras = Array.from(normalized).filter(function (m) {
      return m !== "own";
    });
    for (var i = 0; i < extras.length; i++) {
      var id = extras[i];
      var name = PROFILE_NAME_BY_MIRROR[id];
      if (!name) continue;
      var payload = {
        user_id: userId,
        name: name,
        phone: null,
        props: { activated_at: iso, via: "onboarding", mirror_status: "active" },
        last_active: iso
      };
      var up = await withRetries(function () {
        return sb.from("sense_profiles").upsert(payload, { onConflict: "user_id,name" });
      }, 3);
      if (up && up.error) {
        var rawMsg = String(up.error.message || "");
        if (
          rawMsg.toLowerCase().indexOf("gereserveerd voor systeemgebruik") >= 0 ||
          rawMsg.toLowerCase().indexOf("validate_sense_profile_name") >= 0
        ) {
          return "db_reserved_name_guard";
        }
        return "Even een haperingetje. Ik probeer het opnieuw.";
      }
    }
    return "";
  }

  function statusPillClass(status, appKey) {
    if (status === "active") {
      if (appKey === "fr") return "badge badge-live-fr";
      if (appKey === "fs") return "badge badge-live-fs";
      if (appKey === "ss") return "badge badge-live-self";
      return "badge badge-live";
    }
    if (status === "paused") return "badge badge-mirror-paused";
    if (status === "setting_up") return "badge badge-mirror-setup";
    return "badge badge-mirror-muted";
  }

  function shouldDimAppCard(appKey, status) {
    if (appKey === "ss") return false;
    return status === "never_opened" || status === "paused";
  }

  function appHrefForKey(appKey) {
    var map = {
      ds: "datesense.html",
      fr: "friendsense.html",
      fs: "familysense.html",
      ss: "selfsense.html"
    };
    return map[appKey] || "";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var _intakeOpen = false;

  function closeIntakeModal() {
    var el = document.getElementById("scMirrorIntakeOverlay");
    if (el) el.remove();
    _intakeOpen = false;
  }

  function showMirrorIntakeModal(opts) {
    opts = opts || {};
    if (_intakeOpen) return;
    var mirrorId = APP_MIRROR_IDS[opts.appKey] || opts.mirrorId;
    var meta = MIRROR_META[mirrorId];
    if (!meta || !opts.sb || !opts.userId) return;
    _intakeOpen = true;
    setSettingUpFlag(opts.appKey || MIRROR_APP_KEYS[mirrorId], true);

    var questions = getMirrorQuestions(mirrorId, meta);
    var step = 0;
    var responses = [];

    var overlay = document.createElement("div");
    overlay.id = "scMirrorIntakeOverlay";
    overlay.className = "sc-mirror-overlay";
    overlay.setAttribute("role", "presentation");

    function renderStep() {
      var q = questions[step];
      var pct = questions.length ? Math.round(((step + 1) / questions.length) * 100) : 100;
      var body = "";
      if (q && Array.isArray(q.options) && q.options.length) {
        body =
          '<div class="sc-mirror-options">' +
          q.options
            .map(function (o, idx) {
              return (
                '<button type="button" class="sc-mirror-opt" data-opt="' +
                idx +
                '">' +
                escapeHtml(o.label) +
                "</button>"
              );
            })
            .join("") +
          "</div>";
      } else {
        body =
          '<textarea class="sc-mirror-input" id="scMirrorIntakeInput" rows="4" placeholder="Typ je antwoord…"></textarea>';
      }
      overlay.innerHTML =
        '<div class="sc-mirror-modal" role="dialog" aria-modal="true" aria-labelledby="scMirrorIntakeTitle">' +
        '<div class="sc-mirror-kicker">' +
        escapeHtml(meta.name) +
        " · " +
        (step + 1) +
        "/" +
        questions.length +
        "</div>" +
        '<h2 id="scMirrorIntakeTitle" class="sc-mirror-title">' +
        escapeHtml((q && q.q) || "") +
        "</h2>" +
        (q && q.h ? '<p class="sc-mirror-hint">' + escapeHtml(q.h) + "</p>" : "") +
        body +
        '<div class="sc-mirror-progress"><div class="sc-mirror-progress-fill" style="width:' +
        pct +
        '%"></div></div>' +
        '<div class="sc-mirror-actions">' +
        '<button type="button" class="sc-mirror-btn ghost" id="scMirrorIntakeLater">Later</button>' +
        '<button type="button" class="sc-mirror-btn primary" id="scMirrorIntakeNext">' +
        (step >= questions.length - 1 ? "Activeer en open" : "Volgende") +
        "</button>" +
        "</div></div>";
    }

    function finishNavigate() {
      closeIntakeModal();
      var href = opts.navigateTo || appHrefForKey(opts.appKey);
      if (href) {
        var url = href + (href.indexOf("?") >= 0 ? "&" : "?") + "sc_mirror_ok=" + encodeURIComponent(opts.appKey || "");
        window.location.href = url;
      } else if (typeof opts.onComplete === "function") {
        opts.onComplete();
      }
    }

    async function submitAll() {
      var answers = buildAnswersFromIntake(mirrorId, responses);
      try {
        await saveMirrorIntakeFacts(opts.sb, opts.userId, mirrorId, answers);
        await activateMirror(opts.sb, opts.userId, mirrorId, opts.via || "hub_intake");
      } catch (e) {
        if (typeof opts.onError === "function") opts.onError(e);
        else alert(String((e && e.message) || "Opslaan mislukt. Probeer opnieuw."));
        return;
      }
      finishNavigate();
    }

    function bindStep() {
      var later = document.getElementById("scMirrorIntakeLater");
      var next = document.getElementById("scMirrorIntakeNext");
      if (later) {
        later.addEventListener("click", function () {
          setSettingUpFlag(opts.appKey, false);
          closeIntakeModal();
        });
      }
      if (next) {
        next.addEventListener("click", async function () {
          var q = questions[step];
          var val = "";
          if (q && Array.isArray(q.options) && q.options.length) {
            var picked = overlay.querySelector(".sc-mirror-opt.picked");
            val = picked ? String(picked.textContent || "").trim() : "";
            if (!val) return;
          } else {
            var inp = document.getElementById("scMirrorIntakeInput");
            val = inp ? String(inp.value || "").trim() : "";
            if (!val) return;
          }
          responses[step] = val;
          if (step < questions.length - 1) {
            step++;
            renderStep();
            bindStep();
            return;
          }
          next.disabled = true;
          next.textContent = "Bezig…";
          await submitAll();
        });
      }
      overlay.querySelectorAll(".sc-mirror-opt").forEach(function (btn) {
        btn.addEventListener("click", function () {
          overlay.querySelectorAll(".sc-mirror-opt").forEach(function (b) {
            b.classList.remove("picked");
          });
          btn.classList.add("picked");
        });
      });
    }

    renderStep();
    document.body.appendChild(overlay);
    bindStep();
  }

  function showResumeConfirmModal(opts) {
    opts = opts || {};
    var meta = MIRROR_META[APP_MIRROR_IDS[opts.appKey]] || { name: "deze app" };
    var overlay = document.createElement("div");
    overlay.className = "sc-mirror-overlay";
    overlay.innerHTML =
      '<div class="sc-mirror-modal" role="dialog" aria-modal="true">' +
      "<h2 class=\"sc-mirror-title\">" +
      escapeHtml(meta.name) +
      " staat on hold</h2>" +
      '<p class="sc-mirror-hint">Je gegevens blijven bewaard. Sensei is hier inactief tot je heractiveert.</p>' +
      '<div class="sc-mirror-actions">' +
      '<button type="button" class="sc-mirror-btn ghost" id="scMirrorResumeCancel">Annuleren</button>' +
      '<button type="button" class="sc-mirror-btn primary" id="scMirrorResumeOk">Heractiveren</button>' +
      "</div></div>";
    document.body.appendChild(overlay);
    overlay.querySelector("#scMirrorResumeCancel").addEventListener("click", function () {
      overlay.remove();
    });
    overlay.querySelector("#scMirrorResumeOk").addEventListener("click", async function () {
      var btn = overlay.querySelector("#scMirrorResumeOk");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Bezig…";
      }
      var res = await resumeMirror(opts.sb, opts.userId, opts.appKey);
      overlay.remove();
      if (res && res.error) {
        if (typeof opts.onError === "function") opts.onError(res.error);
        return;
      }
      var href = opts.navigateTo || appHrefForKey(opts.appKey);
      if (href) {
        window.location.href = href + (href.indexOf("?") >= 0 ? "&" : "?") + "sc_mirror_ok=" + encodeURIComponent(opts.appKey);
      }
    });
  }

  function injectMirrorOverlayStyles() {
    if (document.getElementById("scMirrorHubStyles")) return;
    var st = document.createElement("style");
    st.id = "scMirrorHubStyles";
    st.textContent =
      ".sc-mirror-overlay{position:fixed;inset:0;z-index:1100;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px}" +
      ".sc-mirror-modal{width:min(440px,100%);max-height:90vh;overflow:auto;background:#F5F0E8;border-radius:16px;border:1px solid rgba(61,47,31,.14);padding:18px 16px 16px;box-shadow:0 20px 48px rgba(74,58,42,.2)}" +
      ".sc-mirror-kicker{font-size:11px;font-weight:700;color:rgba(61,47,31,.55);margin-bottom:8px}" +
      ".sc-mirror-title{font-family:Lora,serif;font-size:20px;color:#2A1810;margin:0 0 10px;line-height:1.35}" +
      ".sc-mirror-hint{font-size:13px;color:rgba(61,47,31,.65);line-height:1.55;margin:0 0 14px}" +
      ".sc-mirror-input{width:100%;border:1px solid rgba(61,47,31,.18);border-radius:12px;padding:10px 12px;font-size:14px;font-family:inherit;resize:vertical;min-height:88px}" +
      ".sc-mirror-options{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}" +
      ".sc-mirror-opt{border:1px solid rgba(61,47,31,.16);background:#fff;border-radius:12px;padding:10px 12px;font-size:14px;text-align:left;cursor:pointer;font-family:inherit}" +
      ".sc-mirror-opt.picked{border-color:#5C4033;background:rgba(188,205,192,.35);font-weight:600}" +
      ".sc-mirror-progress{height:4px;background:rgba(61,47,31,.1);border-radius:999px;margin:12px 0 14px;overflow:hidden}" +
      ".sc-mirror-progress-fill{height:100%;background:#5C4033;border-radius:999px;transition:width .25s ease}" +
      ".sc-mirror-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}" +
      ".sc-mirror-btn{border-radius:12px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid rgba(61,47,31,.2);background:#fff;color:#2A1810}" +
      ".sc-mirror-btn.primary{background:#2A1810;color:#F5F0E8;border-color:#2A1810}" +
      ".sc-mirror-btn.ghost{background:transparent}";
    document.head.appendChild(st);
  }

  function applyStatusToHubCard(card, appKey, status) {
    if (!card) return;
    var badge = card.querySelector(".app-footer .badge");
    if (badge) {
      badge.className = statusPillClass(status, appKey);
      badge.textContent = STATUS_LABELS[status] || STATUS_LABELS.active;
    }
    if (shouldDimAppCard(appKey, status)) card.classList.add("dimmed");
    else card.classList.remove("dimmed");
    card.setAttribute("data-mirror-status", status);
  }

  function mirrorOkFromUrl(appKey) {
    try {
      var p = new URLSearchParams(window.location.search).get("sc_mirror_ok");
      return p === appKey;
    } catch (_e) {
      return false;
    }
  }

  async function gateAppAfterAuth(opts) {
    opts = opts || {};
    var appKey = opts.appKey;
    if (!opts.sb || !opts.userId || !appKey) return true;
    if (mirrorOkFromUrl(appKey)) return true;
    injectMirrorOverlayStyles();
    var statuses = await getMirrorStatuses(opts.sb, opts.userId);
    var status = statuses[appKey];
    if (status === "active" || status === "setting_up") return true;
    if (status === "paused") {
      if (typeof opts.onPaused === "function") {
        opts.onPaused();
        return false;
      }
      showResumeConfirmModal({
        sb: opts.sb,
        userId: opts.userId,
        appKey: appKey,
        navigateTo: opts.appHref,
        onError: opts.onError
      });
      return false;
    }
    if (status === "never_opened") {
      var mirrorId = APP_MIRROR_IDS[appKey];
      var hasFacts = await mirrorHasOnboardingFacts(opts.sb, opts.userId, mirrorId);
      if (hasFacts) {
        await activateMirror(opts.sb, opts.userId, mirrorId, "onboarding_facts");
        return true;
      }
      if (typeof opts.onNeverOpened === "function") {
        opts.onNeverOpened();
        return false;
      }
      showMirrorIntakeModal({
        sb: opts.sb,
        userId: opts.userId,
        appKey: appKey,
        navigateTo: opts.appHref,
        via: "app_first_open",
        onError: opts.onError
      });
      return false;
    }
    return true;
  }

  function renderPausedBannerHtml(appKey) {
    var meta = MIRROR_META[APP_MIRROR_IDS[appKey]] || { name: "Deze app" };
    return (
      '<div class="sc-mirror-paused-banner" style="margin:16px;padding:16px 18px;border-radius:14px;border:1px solid rgba(61,47,31,.14);background:rgba(255,255,255,.7);text-align:center">' +
      "<div style=\"font-family:Lora,serif;font-size:18px;color:#2A1810;margin-bottom:8px\">" +
      escapeHtml(meta.name) +
      " staat on hold</div>" +
      '<p style="font-size:14px;color:rgba(61,47,31,.7);line-height:1.55;margin:0 0 14px">Je gegevens blijven bewaard. Sensei is hier inactief tot je heractiveert.</p>' +
      '<button type="button" id="scMirrorPausedReactivate" style="border:none;border-radius:12px;padding:10px 18px;font-size:14px;font-weight:600;background:#2A1810;color:#F5F0E8;cursor:pointer;font-family:inherit">Heractiveren</button>' +
      ' <a href="sensecorner.html" style="display:inline-block;margin-left:10px;font-size:13px;color:#5C4033">Terug naar SenseCorner</a></div>'
    );
  }

  var hub = {
    PROFILE_NAME_BY_MIRROR: PROFILE_NAME_BY_MIRROR,
    PROFILE_MIRROR_BY_NAME: PROFILE_MIRROR_BY_NAME,
    MIRROR_APP_KEYS: MIRROR_APP_KEYS,
    APP_MIRROR_IDS: APP_MIRROR_IDS,
    OPTIONAL_MIRROR_IDS: OPTIONAL_MIRROR_IDS,
    ANSWER_KEY_TO_SUB: ANSWER_KEY_TO_SUB,
    MIRROR_META: MIRROR_META,
    ANSWER_KEYS_BY_MIRROR: ANSWER_KEYS_BY_MIRROR,
    STATUS_LABELS: STATUS_LABELS,
    getMirrorQuestions: getMirrorQuestions,
    normalizeOnboardingMirrors: normalizeOnboardingMirrors,
    countOptionalMirrors: countOptionalMirrors,
    getMirrorStatuses: getMirrorStatuses,
    mirrorHasOnboardingFacts: mirrorHasOnboardingFacts,
    activateMirror: activateMirror,
    pauseMirror: pauseMirror,
    resumeMirror: resumeMirror,
    saveSelectedMirrors: saveSelectedMirrors,
    saveMirrorIntakeFacts: saveMirrorIntakeFacts,
    showMirrorIntakeModal: showMirrorIntakeModal,
    showResumeConfirmModal: showResumeConfirmModal,
    applyStatusToHubCard: applyStatusToHubCard,
    shouldDimAppCard: shouldDimAppCard,
    statusPillClass: statusPillClass,
    appHrefForKey: appHrefForKey,
    gateAppAfterAuth: gateAppAfterAuth,
    appEntryGate: gateAppAfterAuth,
    renderPausedBannerHtml: renderPausedBannerHtml,
    injectMirrorOverlayStyles: injectMirrorOverlayStyles,
    setSettingUpFlag: setSettingUpFlag,
    mirrorOkFromUrl: mirrorOkFromUrl
  };

  global.SenseMirrorHub = hub;
})(typeof window !== "undefined" ? window : this);
