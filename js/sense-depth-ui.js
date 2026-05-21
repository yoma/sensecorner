/**
 * Gedeelde diepgang-UI en expertise-hulp voor DateSense, FamilySense, FriendSense, SelfSense.
 * Vereist senseiCore-loader.js (window.SenseiCore); heeft fallbacks als die nog laadt.
 */
(function () {
  function sc() {
    return window.SenseiCore || {};
  }

  function depthHelp() {
    return sc().DEPTH_MODE_UI_HELP
      || 'Standaard: warm, concreet advies. Expertise: onderbouwde inzichten (geen boekentips). Beide: eerst Standaard, daarna Expertise.';
  }

  function renderDepth(currentDepth, helpText) {
    if (sc().renderAdviceDepthCompactHtml) {
      return sc().renderAdviceDepthCompactHtml(currentDepth, helpText || depthHelp());
    }
    var depth = (sc().normalizeDepthMode || function (m) {
      var x = String(m || 'standard').toLowerCase();
      return (x === 'extra' || x === 'both') ? x : 'standard';
    })(currentDepth);
    function btn(id, label) {
      var on = depth === id;
      return '<button type="button" class="' + (on ? 'btn-r' : 'btn-g') + ' advice-depth-btn" onclick="setAdviceHubDepthMode(\'' + id + '\')">' + label + '</button>';
    }
    return '<div class="advice-depth-wrap" style="margin:0 0 10px;padding:10px 10px;border-radius:12px">'
      + '<div class="advice-depth-label" style="margin-bottom:6px">Diepgang</div>'
      + '<p class="advice-depth-help" style="margin:0 0 8px;font-size:11px;line-height:1.45;color:#5c6570">' + (helpText || depthHelp()) + '</p>'
      + '<div class="advice-depth-row" style="gap:6px">'
      + btn('standard', 'Standaard') + btn('extra', 'Expertise') + btn('both', 'Beide')
      + '</div></div>';
  }

  function getExpertiseDomains() {
    var slug = window.SENSE_APP_NAME || 'datesense';
    if (sc().getExpertiseDomains) return sc().getExpertiseDomains(slug);
    return ['standaardboekhandel.be', 'bol.com', 'hebban.nl', 'apa.org', 'nih.gov', 'who.int'];
  }

  function buildDossierExpertiseSys(senseiName) {
    if (sc().buildExpertiseLayerPrompt && sc().buildExpertiseDossierTask) {
      return sc().buildExpertiseLayerPrompt({
        senseiName: senseiName,
        taskHint: sc().buildExpertiseDossierTask()
      });
    }
    return 'Je bent ' + senseiName + '. Expertise-laag: alleen onderbouwde info van erkende bronnen, nooit verzinnen. Max 7 zinnen.';
  }

  function buildCompareExpertiseSys(senseiName) {
    if (sc().buildExpertiseLayerPrompt && sc().buildExpertiseCompareTask) {
      return sc().buildExpertiseLayerPrompt({
        senseiName: senseiName,
        taskHint: sc().buildExpertiseCompareTask()
      });
    }
    return 'Je bent ' + senseiName + '. Expertise na vergelijking: alleen erkende bronnen, nooit verzinnen. Max 7 zinnen.';
  }

  function vertelExpertiseUserPrompt() {
    if (sc().buildVertelExpertiseUserPrompt) return sc().buildVertelExpertiseUserPrompt();
    return 'Geef expertise met alleen onderbouwde bronnen; verzin niets. 2 vervolgstappen.';
  }

  function sanitizeOutput(text) {
    if (sc().sanitizeExpertiseOutput) return sc().sanitizeExpertiseOutput(text);
    return String(text || '').trim();
  }

  window.SenseDepthUi = {
    depthHelp: depthHelp,
    renderDepth: renderDepth,
    getExpertiseDomains: getExpertiseDomains,
    buildDossierExpertiseSys: buildDossierExpertiseSys,
    buildCompareExpertiseSys: buildCompareExpertiseSys,
    vertelExpertiseUserPrompt: vertelExpertiseUserPrompt,
    sanitizeOutput: sanitizeOutput,
    expertiseEmptyUserMsg: 'Expertise kon niet worden toegevoegd. Controleer je verbinding of kies opnieuw Expertise / Beide.',
    expertiseSectionLabel: 'Expertise',
    standardSectionLabel: 'Standaard'
  };
})();
