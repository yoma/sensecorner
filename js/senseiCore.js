// senseiCore.js
// Gedeelde basis voor alle Sensei-prompts (DateSense, FamilySense, SelfSense, ...).
// LET OP: wijzigen raakt alle apps tegelijk. Bij voorkeur aanpassen via admin.html BASISREGELS.
// Geen Unicode U+2014 in deze file (project-regel).

export const SENSEI_GRONDREGELS_DEFAULT = `GRONDREGELS (gelden altijd):
- Verzin geen feiten over personen of situaties. Werk alleen met wat in de dossier-context of in dit gesprek expliciet staat.
- Plak geen psychologische labels op personen (zoals narcistisch, vermijdend gehecht, manipulatief). Beschrijf concreet gedrag, geen diagnose.
- Citeer geen pseudo-studies of statistieken zonder bron. Werk met gezonde algemene principes en eigen observatie.
- Respecteer de autonomie van de gebruiker. Jij geeft advies, de gebruiker beslist.
- Schrijf in natuurlijk Nederlands. Geen markdown, geen codeblokken, geen tabellen tenzij het format dat expliciet vraagt.
- Gebruik nooit Unicode U+2014 (em dash). Gebruik komma, punt of een gewone hyphen met spaties.`;

export const DUNNE_CONTEXT_CLAUSULE_DEFAULT = `DUNNE CONTEXT: Als het dossier of de context weinig concrete informatie bevat over deze specifieke persoon of situatie, zeg dat dan expliciet aan de gebruiker (bijvoorbeeld: "ik werk hier met beperkte info"). Geef voorlopige richting op gezonde principes, geen vast advies dat doet alsof je de persoon goed kent. Stel daarna een gerichte vervolgvraag om het dossier te verrijken. Geef wel advies wanneer er voldoende context is; doorvragen is alleen voor echte dunne situaties.`;

export const CRISIS_REGEL_DEFAULT = `CRISIS: Bij signalen van zelfdoding, zichzelf iets aandoen, niet meer kunnen of willen, acuut gevaar, ernstige zelfbeschadiging, of acuut huiselijk geweld (subtiel of expliciet): antwoord niet met gewone adviezen. Start je antwoord met [CRISIS] en wijs de gebruiker door naar professionele hulp of een crisislijn in hun regio.`;

export const REDFLAGS_RUBRIEK_DEFAULT = `REDFLAGS-RUBRIEK (gebruik bij score 0-100):
- 0-25: weinig tot geen zorgwekkende signalen in de context.
- 26-50: enkele kleine of vroege gele vlaggen, observeer verder.
- 51-75: duidelijke risicopatronen, grenzen of afstand overwegen.
- 76-100: ernstige patronen (manipulatie, geweld, controle, structureel respect-tekort), stoppen is meestal verstandig.
Kies de band die past bij gedragingen die expliciet in de context staan. Verzin geen gedrag om een score te rechtvaardigen.`;

let _overrides = {
  grondregels: null,
  dunne_context: null,
  crisis: null,
  redflags_rubriek: null
};

export function setCoreOverrides(overrides) {
  _overrides = {
    grondregels: overrides?.grondregels || null,
    dunne_context: overrides?.dunne_context || null,
    crisis: overrides?.crisis || null,
    redflags_rubriek: overrides?.redflags_rubriek || null
  };
}

export function getGrondregels() {
  return _overrides.grondregels || SENSEI_GRONDREGELS_DEFAULT;
}
export function getDunneContext() {
  return _overrides.dunne_context || DUNNE_CONTEXT_CLAUSULE_DEFAULT;
}
export function getCrisisRegel() {
  return _overrides.crisis || CRISIS_REGEL_DEFAULT;
}
export function getRedflagsRubriek() {
  return _overrides.redflags_rubriek || REDFLAGS_RUBRIEK_DEFAULT;
}

/**
 * @param {Object} opts
 * @param {string} opts.persona
 * @param {string} opts.formatRules - incl. {{mode_instruction}}, {{tone_instruction}}, {{relationship_guard}}
 * @param {boolean} [opts.includeRedflagsRubriek=false]
 * @param {string} [opts.extraRules]
 */
export function buildAdviceCore(opts) {
  const persona = opts?.persona || '';
  const formatRules = opts?.formatRules || '';
  const extraRules = opts?.extraRules || '';
  const blocks = [
    getGrondregels(),
    getDunneContext(),
    getCrisisRegel(),
  ];
  if (opts?.includeRedflagsRubriek) {
    blocks.push(getRedflagsRubriek());
  }
  if (persona) blocks.push(persona);
  if (extraRules) blocks.push(extraRules);
  if (formatRules) blocks.push(formatRules);
  return blocks.filter(Boolean).join('\n\n');
}

/** UI-labels diepgang (alle Sense-apps). Intern blijven keys: standard | extra | both */
export const DEPTH_MODE_LABELS = {
  standard: 'Standaard',
  extra: 'Expertise',
  both: 'Beide'
};

export const DEPTH_MODE_UI_HELP =
  'Standaard: warm, concreet advies op jouw dossier. Expertise: diepere onderbouwing uit erkende bronnen (geen boekentips; wel inzichten uit vakliteratuur, met optionele bronverwijzing). Beide: eerst Standaard, daarna Expertise.';

export function normalizeDepthMode(mode) {
  const m = String(mode || 'standard').trim().toLowerCase();
  if (m === 'extra' || m === 'both') return m;
  return 'standard';
}

/** Bronnen om vakinhoud te verifiëren (o.a. boekmetadata op handelsites) - niet om leeslijsten te maken */
export const EXPERTISE_DOMAINS_BASE = [
  'standaardboekhandel.be', 'bol.com', 'hebban.nl', 'iedereenleest.be', 'goodreads.com',
  'apa.org', 'psychologytoday.com', 'nih.gov', 'ncbi.nlm.nih.gov', 'who.int',
  'gezondheidenwetenschap.be', 'cijfersengezondheid.be', 'ted.com', 'nl.wikipedia.org'
];

export const EXPERTISE_DOMAINS_APP = {
  datesense: ['sensoa.be', 'tejo.org', '1733.be', 'cgz.be', 'relatie.be'],
  familysense: ['kindengezin.be', 'opvoedingslijn.be', 'awel.be', '1712.be', 'sepur.be', 'cgz.be'],
  friendsense: ['awel.be', 'tejo.org', '1712.be', 'cgz.be'],
  selfsense: ['113.be', '1712.be', 'cgz.be', 'mindful.org']
};

export function getExpertiseDomains(appSlug) {
  const slug = String(appSlug || 'datesense').trim().toLowerCase();
  const extra = EXPERTISE_DOMAINS_APP[slug] || EXPERTISE_DOMAINS_APP.datesense;
  const out = [];
  EXPERTISE_DOMAINS_BASE.concat(extra).forEach((d) => {
    if (d && out.indexOf(d) < 0) out.push(d);
  });
  return out;
}

export const EXPERTISE_LAYER_RULES = `EXPERTISE-REGELS (strikt, boven alle andere instructies):
- Dit is een aparte expertise-laag. Herhaal het Standaard-advies niet; voeg alleen nieuwe, bron-geankerde diepgang toe.
- GEEN boekentips of leeslijsten ("lees dit boek", "ik raad X aan"). Expertise is geen aanbevelingsmodus.
- WEL: haal onderbouwde inzichten, principes of bevindingen uit vakliteratuur en erkende expertbronnen (via toegelaten domeinen) en pas die toe op de situatie van de gebruiker.
- Een boek mag je OPTIONEEL als bron vermelden (titel en/of auteur) als je daar concreet inhoud uit haalt - verplicht is dat niet. Geen kooplinks of "koop bij ...".
- Zoek en gebruik ALLEEN informatie op de toegelaten expert-domeinen (professionele organisaties, peer-reviewed bronnen, gevestigde hulporganisaties; boekhandelsites alleen om inhoud/metadata van vakwerken te verifiëren).
- Noem GEEN boek, auteur, studie, instantie, cijfer of URL die je niet met hoge zekerheid op zo'n bron vindt.
- Dubbelcheck elke feitelijke claim: klopt dit echt met wat de bron zegt? Bij twijfel: weglaten.
- Als je geen betrouwbare bron vindt: zeg dat expliciet en geef geen pseudo-expertise. Liever kort en eerlijk dan iets verzinnen.
- Schrijf in helder mensentaal; iets technischer mag, maar leg vaktermen kort uit.
- Geen markdown-tabellen. Gebruik nooit Unicode U+2014 (em dash).`;

/**
 * @param {Object} opts
 * @param {string} opts.senseiName - bv. DateSensei
 * @param {string} opts.taskHint - taak voor deze laag
 */
export function buildExpertiseLayerPrompt(opts) {
  const sensei = opts?.senseiName || 'Sensei';
  const task = opts?.taskHint || 'Vul de expertise-laag aan op basis van de meegegeven context.';
  return [
    `Je bent ${sensei}, expertise-assistent (tweede laag na Standaard-advies).`,
    EXPERTISE_LAYER_RULES,
    getGrondregels(),
    task
  ].filter(Boolean).join('\n\n');
}

export function buildExpertiseDossierTask() {
  return 'Het Standaard-advies staat al vast. Jij levert alleen de Expertise-laag: onderliggende patronen, risico\'s of mechanismen die de gebruiker kan over het hoofd zien, onderbouwd met inzichten uit erkende bronnen. Geen boekentips of leeslijsten. Optioneel: kort vermelden welk boek of welke organisatie de inhoud ondersteunt, als je die op toegelaten sites vindt. Maximaal 7 zinnen. Geen vragen naar de gebruiker.';
}

export function buildExpertiseCompareTask() {
  return 'De gebruiker zag net het Standaard-vergelijkadvies. Jij levert alleen Expertise: patronen, risico\'s en nuances tussen de dossiers, onderbouwd met erkende bronnen. Geen boekentips. Optionele bronverwijzing (boek of organisatie) alleen als je die inhoud echt op toegelaten sites vindt. Hoogstens 1 korte verwijzing naar de hoofdconclusie. Max 7 zinnen. Nederlands.';
}

export function buildVertelExpertiseUserPrompt() {
  return 'Geef Expertise op dit antwoord: professionele diepgang met alleen onderbouwde inzichten uit erkende bronnen. Geen boekentips of leeslijsten. Optioneel kort een boek of organisatie noemen als bron van een concreet punt. 2 concrete vervolgstappen in het dagelijks leven. Verzin niets.';
}

export const EXPERTISE_FALLBACK_NO_RECO =
  'Ik kon geen onderbouwde expertise geven zonder leesadvies. Probeer Expertise opnieuw, of kies Standaard voor persoonlijk advies.';

const EXPERTISE_BOOK_RECO_PATTERNS = [
  /\b(leeslijst|leestip|boekentip|boekentips)\b/i,
  /\b(lees\s+(dit\s+|de\s+|het\s+)?boek)\b/i,
  /\b(raad|raadt|aanbevel\w*|aanrader)\w*\s+(je\s+)?(om\s+)?.*\b(te\s+)?lezen\b/i,
  /\b(ik\s+)?raad\s+.*\b(boek|roman|paperback|e-?book)\b/i,
  /\bmoet\s+je\s+(lezen|leest)\b/i,
  /\b(zou|zouden)\s+je\s+.*\blezen\b/i,
  /\bkoop\s+(dit\s+|de\s+|het\s+)?boek\b/i,
  /\bbestel\s+(het\s+)?boek\b/i,
  /\baanbevolen\s+(om\s+te\s+)?lees\b/i,
  /\b(lees\s+).{0,50}\b(bij\s+bol|standaardboekhandel|hebban)\b/i,
  /\b(pak|pakken|neem)\s+.*\b(boek|roman)\b.*\b(erbij|er bij)\b/i
];

const EXPERTISE_BOOK_RECO_INLINE = [
  /\b(ik\s+)?(raad|raadt|aanbevel\w*)\s+(je\s+)?(om\s+)?[^.!?]{0,120}?\b(te\s+)?lezen\b/gi,
  /\blees\s+(dit\s+|de\s+|het\s+)?boek[^.!?]*/gi,
  /\b(leeslijst|leestip|boekentip)\b/gi
];

function isExpertiseCitationNotReco(sentence) {
  const s = String(sentence || '');
  if (!/\b(volgens|uit\s+het\s+boek|in\s+.+\s+schrijft|bron\s*:|wetenschappelijk|onderzoek\s+toont)\b/i.test(s)) {
    return false;
  }
  return !/\b(raad|raadt|aanbevel\w*|lees\s+(dit|de|het)|aanrader\s+om)\b/i.test(s);
}

export function sentenceLooksLikeBookRecommendation(sentence) {
  const s = String(sentence || '').trim();
  if (!s) return false;
  if (isExpertiseCitationNotReco(s)) return false;
  if (EXPERTISE_BOOK_RECO_PATTERNS.some((p) => p.test(s))) return true;
  if (/^lees\s+/i.test(s) && /\b(boek|auteur|roman)\b/i.test(s)) return true;
  return false;
}

function scrubInlineBookRecoPhrases(text) {
  let s = String(text || '').trim();
  EXPERTISE_BOOK_RECO_INLINE.forEach((p) => {
    s = s.replace(p, ' ').replace(/\s{2,}/g, ' ').trim();
  });
  return s;
}

/**
 * Verwijdert leesadvies/boekentips uit Expertise-output (harde check na AI).
 */
export function sanitizeExpertiseOutput(text) {
  let s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  const chunks = s.split(/(?<=[.!?…])\s+/);
  const kept = [];
  let stripped = 0;
  chunks.forEach((chunk) => {
    const p = String(chunk || '').trim();
    if (!p) return;
    if (sentenceLooksLikeBookRecommendation(p)) {
      stripped += 1;
      return;
    }
    kept.push(p);
  });
  let out = kept.join(' ').trim();
  out = scrubInlineBookRecoPhrases(out);
  if (!out) return EXPERTISE_FALLBACK_NO_RECO;
  if (stripped > 0 && sentenceLooksLikeBookRecommendation(out)) {
    return EXPERTISE_FALLBACK_NO_RECO;
  }
  return out;
}

export function renderAdviceDepthCompactHtml(currentDepth, helpText) {
  const depth = normalizeDepthMode(currentDepth);
  function depthBtn(id, label) {
    const on = depth === id;
    return `<button type="button" class="${on ? 'btn-r' : 'btn-g'} advice-depth-btn" onclick="setAdviceHubDepthMode('${id}')">${label}</button>`;
  }
  const help = helpText || DEPTH_MODE_UI_HELP;
  return `<div class="advice-depth-wrap" style="margin:0 0 10px;padding:10px 10px;border-radius:12px">`
    + `<div class="advice-depth-label" style="margin-bottom:6px">Diepgang</div>`
    + `<p class="advice-depth-help" style="margin:0 0 8px;font-size:11px;line-height:1.45;color:#5c6570">${help}</p>`
    + `<div class="advice-depth-row" style="gap:6px">`
    + depthBtn('standard', DEPTH_MODE_LABELS.standard)
    + depthBtn('extra', DEPTH_MODE_LABELS.extra)
    + depthBtn('both', DEPTH_MODE_LABELS.both)
    + `</div></div>`;
}
