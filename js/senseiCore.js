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
  datesense: ['sensoa.be', 'tejo.org', '1733.be', 'cgg.be', 'relatie.be'],
  familysense: ['kindengezin.be', 'opvoedingslijn.be', 'awel.be', '1712.be', 'cgg.be'],
  friendsense: ['awel.be', 'tejo.org', '1712.be', 'cgg.be'],
  selfsense: ['zelfmoord1813.be', '1712.be', 'cgg.be', 'mindful.org']
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

/* ============================================================================
 * GATEWAY-PROFIEL (centrale Sensei-chat op de SenseCorner-hub)
 *
 * MARKERPROTOCOL GATEWAY (zelfde patroon als [CRISIS]: client parseert en stript
 * voordat tekst gerenderd wordt; zie design/CenterChat/cursor-brief-gateway-chat.md):
 * - [CRISIS] staat aan het BEGIN van de respons (bestaand protocol, ongewijzigd)
 *   en heeft altijd voorrang: bij crisis geen voorstel, profielvraag of brug tonen.
 * - De drie gateway-markers staan aan het EINDE van de responstekst, na het antwoord:
 *   [VOORSTEL domein="date|family|friend|self" dossier="Naam" tekst="..."]
 *     Voorstel om iets te noteren in het dossier van het doeldomein. Optioneel attribuut
 *     dossier= exacte contact-/dossiernaam uit de context wanneer bekend (bv. "Lisa").
 *     Bij self mag dossier weggelaten worden (landt in OWN Sense). De client toont
 *     een voorstelkaart; pas na expliciete bevestiging wordt geschreven (propose-and-
 *     confirm, tabel gateway_proposals). Maximaal 1 per antwoordbeurt. Herhaal geen
 *     voorstel voor hetzelfde dossier/dezelfde feiten over beurten heen: de client
 *     houdt bij welke doelen al zijn aangeboden en negeert dubbele [VOORSTEL].
 *   [PROFIELVRAAG domein="..." vraag_id="..."]
 *     Markeert dat de laatste vraag in de antwoordtekst een profielvraag is.
 *     vraag_id-formaat: "{catId}:a{slotIndex}", bv. "familysense_focus:a2"
 *     (de categorie-arrays in ownsense.html / GW_OPEN_CATS in gateway-chat.js zijn de bron;
 *     er bestaan geen andere stabiele vraag-id's). Maximaal 1 per gesprek.
 *   [BRUG domein="..." reden="..."]
 *     Signaal voor de brugkaart naar de doel-app (context-handoff via tabel
 *     bridge_handoffs, alleen een handoff-id in de URL). Na de eerste beurt
 *     actief aanbieden zodra het domein helder is; niet elke zin; max 1 per gesprek.
 *     Na een voorstel voor een bekende persoon is de brug de natuurlijke volgende stap
 *     (in de domein-app is opslaan bij het actieve dossier al standaard).
 * - De limieten "1 profielvraag / 1 brug per gesprek" en "geen herhaald voorstel voor
 *   hetzelfde dossier" worden afgedwongen via de gespreksstatus (sense_sessions +
 *   client-side proposedTargets), niet alleen via de prompt: de client geeft de status
 *   mee in de context en negeert markers die de limiet zouden overschrijden.
 * ========================================================================== */

export const GATEWAY_DOMAIN_LABELS = {
  date: 'DateSense',
  family: 'FamilySense',
  friend: 'FriendSense',
  self: 'SelfSense'
};

export const GATEWAY_PERSONA = `Je bent Sensei, de centrale gids van SenseCorner. Gateway is de voordeur naar de apps: de gebruiker praat met jou zonder eerst een app te kiezen. Jij luistert over alle domeinen heen (DateSense: liefde en daten, FamilySense: gezin en familie, FriendSense: vriendschappen, SelfSense: zelfzorg en herstel), herkent tijdens het gesprek welk domein er speelt en legt verbanden tussen domeinen wanneer die concreet gegrond zijn in de meegeleverde context. Je schrijft nooit zelf iets weg: je stelt hoogstens voor om iets te noteren en de gebruiker beslist.`;

export const GATEWAY_GEDRAGSREGELS = `GEDRAGSREGELS GATEWAY (hard, altijd volgen):
- Antwoord altijd eerst inhoudelijk en empathisch op wat de gebruiker vertelt. Markers komen pas na de antwoordtekst.
- Maximaal 1 voorstel per antwoordbeurt. Maximaal 1 profielvraag per gesprek. Maximaal 1 brug per gesprek.
- Stel nooit een profielvraag en toon nooit een brug tijdens een emotionele ontlading of in je eerste antwoordbeurt van een gesprek.
- Kijk naar de STATUS GESPREK in de context: staat daar dat de profielvraag al gesteld is, gebruik dan nooit meer [PROFIELVRAAG]; staat daar dat de brug al getoond is, gebruik dan nooit meer [BRUG]; staan daar al aangeboden voorstellen (domein/dossier), herhaal die niet met opnieuw [VOORSTEL].
- Benoem verbanden tussen domeinen alleen als ze concreet gegrond zijn in de meegeleverde domeinsamenvattingen of het profiel. Geen speculatie, geen aannames over negatieve toestanden die nergens staan.
- Gebruik nooit scores of percentages in je antwoorden.
- Een voorstel ([VOORSTEL]) doe je alleen voor concrete, door de gebruiker zelf gedeelde informatie die het waard is om in een dossier te bewaren, en alleen als die info in dit gesprek nog niet is voorgesteld. Formuleer de voorsteltekst kort (1 zin, maximaal ongeveer 200 tekens), feitelijk en in de woorden van de gebruiker. Als het over een concrete persoon gaat en die dossiernaam bekend is uit de context of CONTACTEN, zet dan dossier="ExacteNaam" mee; verzin nooit een dossiernaam. Herhaal geen voorstel voor hetzelfde dossier of dezelfde feiten over beurten heen (ook niet na bevestiging of afwijzing). Echt nieuwe concrete info over een ander feit of een ander dossier mag wel opnieuw een [VOORSTEL] krijgen.
- Na een voorstel voor een bekende persoon of een helder domein (bijvoorbeeld familie/Ella): bied in de volgende natuurlijke beurt bij voorkeur [BRUG] naar die app aan, in plaats van opnieuw een opslaan-voorstel. In FamilySense/DateSense/FriendSense Vertel is opslaan bij het actieve dossier al standaard; blijf dus niet elke beurt [VOORSTEL] herhalen.
- Een profielvraag ([PROFIELVRAAG]) kies je uitsluitend uit de meegeleverde openstaande profielvragen, alleen als die natuurlijk in het gesprek past. Stel de vraag in je eigen warme woorden als laatste zin van je antwoord en zet de marker met het exacte vraag_id erachter.
- Een brug ([BRUG]): Gateway is de voordeur. Zodra na de eerste antwoordbeurt duidelijk is welk domein speelt (date, family, friend of self) en het onderwerp daar rustiger of dieper thuishoort dan in dit korte gesprek, bied je actief een brug aan. Doe dat niet in elke zin en niet bij elke beurt: hoogstens één keer per gesprek. Na een voorstel voor een bekend contact is de brug de logische volgende stap. De reden is 1 korte zin. Crisis heeft altijd voorrang: bij crisissignalen geen brug.`;

export const GATEWAY_MARKER_RULES = `MARKERPROTOCOL (machine-leesbaar, exact volgen):
- Schrijf eerst je volledige antwoord in natuurlijk Nederlands. Zet daarna, elk op een eigen regel aan het einde, hoogstens deze markers:
  [VOORSTEL domein="date|family|friend|self" dossier="ExacteDossiernaam" tekst="korte voorsteltekst"]
  [PROFIELVRAAG domein="date|family|friend|self" vraag_id="exact id uit de context"]
  [BRUG domein="date|family|friend|self" reden="korte reden"]
- Gebruik in domein altijd exact een van: date, family, friend, self.
- Attribuut dossier is optioneel: alleen zetten als de exacte dossiernaam bekend is; weglaten bij self of als de persoon onbekend is. Gebruik nooit Unicode U+2014.
- Gebruik geen dubbele aanhalingstekens binnen de tekst-, dossier- en reden-waarden.
- Maximaal 1 [VOORSTEL] per antwoordbeurt. Zet geen [VOORSTEL] voor een domein/dossier dat in STATUS GESPREK al als aangeboden voorstel staat; kies dan [BRUG] als dat nog mag, of geen marker.
- Bij crisissignalen geldt de CRISIS-regel: start je antwoord met [CRISIS], wijs warm door naar hulp en gebruik dan GEEN enkele gateway-marker.`;

export const GATEWAY_FORMAT_RULES = `OUTPUTREGELS: Schrijf in natuurlijk, warm Nederlands, maximaal 6 zinnen antwoordtekst per beurt. Geen markdown, geen codeblokken, geen tabellen, geen opsommingstekens. Gebruik nooit Unicode U+2014 (em dash); gebruik komma, punt of een gewone hyphen met spaties.`;

export const GATEWAY_ADVICE_CORE_OPTS = {
  persona: GATEWAY_PERSONA,
  extraRules: GATEWAY_GEDRAGSREGELS + '\n\n' + GATEWAY_MARKER_RULES,
  formatRules: GATEWAY_FORMAT_RULES
};

/** System-kern voor de Gateway-Chat: grondregels, dunne context en crisis komen
 *  ongewijzigd uit buildAdviceCore (single source of truth, identiek aan de apps). */
export function buildGatewayAdviceCore() {
  return buildAdviceCore(GATEWAY_ADVICE_CORE_OPTS);
}

/**
 * Contextblok voor de Gateway-Chat, in de volgorde van de brief:
 * OwnSense-profiel, bevestigde aandachtspunten, domeinsamenvattingen,
 * openstaande profielvragen, gespreksstatus.
 * @param {Object} ctx
 * @param {string} [ctx.ownProfielBlock] - regels uit het OWN-basisprofiel (bv. via senseOwnBasisContextParts)
 * @param {string} [ctx.aandachtspuntenBlock] - blok bevestigde aandachtspunten (bv. via senseFormatAandachtspuntenCoachBlock)
 * @param {Object} [ctx.domainSummaries] - { date, family, friend, self } met samenvattingstekst of leeg
 * @param {Object} [ctx.contactNamesByDomain] - { date:[], family:[], friend:[] } exacte dossiernamen
 * @param {Array}  [ctx.openQuestions] - max 3 items { domein, vraagId, vraag }
 * @param {boolean} [ctx.profileQuestionAsked] - profielvraag al gesteld in dit gesprek
 * @param {boolean} [ctx.bridgeShown] - brug al getoond in dit gesprek
 * @param {boolean} [ctx.isFirstTurn] - dit is de eerste antwoordbeurt van het gesprek
 * @param {Array}  [ctx.proposedTargets] - al aangeboden voorstellen deze sessie: [{ domein, dossier }]
 * @param {string} [ctx.confirmedProposalsBlock] - bevestigde gateway_proposals (alle domeinen)
 */
export function buildGatewayContextBlock(ctx) {
  const c = ctx || {};
  const parts = [];
  if (c.ownProfielBlock) {
    parts.push('PROFIEL VAN DE GEBRUIKER (OwnSense):\n' + String(c.ownProfielBlock).trim());
  }
  if (c.aandachtspuntenBlock) {
    parts.push(String(c.aandachtspuntenBlock).trim());
  }
  if (c.confirmedProposalsBlock) {
    parts.push(String(c.confirmedProposalsBlock).trim());
  }
  const sums = c.domainSummaries || {};
  const sumLines = [];
  ['date', 'family', 'friend', 'self'].forEach((d) => {
    const s = String(sums[d] || '').trim();
    if (s) sumLines.push('- ' + GATEWAY_DOMAIN_LABELS[d] + ' (' + d + '): ' + s);
  });
  if (sumLines.length) {
    parts.push('DOMEINSAMENVATTINGEN (feitelijk, recent; alleen hierop verbanden baseren):\n' + sumLines.join('\n'));
  }
  const contacts = c.contactNamesByDomain || {};
  const contactLines = [];
  ['date', 'family', 'friend'].forEach((d) => {
    const names = Array.isArray(contacts[d]) ? contacts[d].map(function (n) {
      return String(n || '').trim();
    }).filter(Boolean).slice(0, 24) : [];
    if (names.length) {
      contactLines.push('- ' + GATEWAY_DOMAIN_LABELS[d] + ' (' + d + '): ' + names.join(', '));
    }
  });
  if (contactLines.length) {
    parts.push('BEKENDE DOSSIERS (exacte namen voor optioneel dossier= in [VOORSTEL]; verzin geen andere namen):\n' + contactLines.join('\n'));
  }
  const qs = Array.isArray(c.openQuestions) ? c.openQuestions.slice(0, 3) : [];
  if (qs.length) {
    const qLines = qs.map(function (q) {
      return '- domein=' + String(q.domein || '') + ' vraag_id="' + String(q.vraagId || '') + '": ' + String(q.vraag || '').trim();
    });
    parts.push('OPENSTAANDE PROFIELVRAGEN (kies er hoogstens 1, alleen als het natuurlijk past):\n' + qLines.join('\n'));
  }
  const offered = Array.isArray(c.proposedTargets) ? c.proposedTargets : [];
  const offeredLabels = [];
  offered.forEach(function (t) {
    const dom = String((t && t.domein) || '').trim();
    if (!dom) return;
    const dos = String((t && t.dossier) || '').trim();
    offeredLabels.push(dos ? (dom + '/' + dos) : dom);
  });
  const offeredTxt = offeredLabels.length
    ? offeredLabels.join(', ') + ' (herhaal geen [VOORSTEL] voor deze doelen; bied bij voorkeur [BRUG] als dat nog mag)'
    : 'geen';
  parts.push('STATUS GESPREK: profielvraag al gesteld: ' + (c.profileQuestionAsked ? 'ja' : 'nee')
    + '; brug al getoond: ' + (c.bridgeShown ? 'ja' : 'nee')
    + '; eerste antwoordbeurt: ' + (c.isFirstTurn ? 'ja' : 'nee')
    + '; al aangeboden voorstellen deze sessie: ' + offeredTxt + '.');
  return parts.join('\n\n');
}

/** Volledige system prompt voor de Gateway-Chat: kernregels plus context. */
export function buildGatewaySystemPrompt(ctx) {
  return buildGatewayAdviceCore() + '\n\n' + buildGatewayContextBlock(ctx);
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
