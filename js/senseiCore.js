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
