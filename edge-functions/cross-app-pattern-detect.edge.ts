/**
 * Cross-app gedragspatroon detectie.
 * Leest sense_messages (role=user) over alle apps, detecteert terugkerende
 * eerste-persoons gedragspatronen van de gebruiker zelf.
 * Evidence: { message_id, created_at, app, excerpt }
 * Schrijft naar own_aandachtspunten (status: voorgesteld).
 * Vereist handmatige goedkeuring in OWNSense — geen auto-accept.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const LOOKBACK_DAYS = 90;
const MAX_MESSAGES_LOAD = 80;
const MAX_CHARS_PER_MSG = 400;
const MAX_CONFIRMED_FACTS = 30;
const MAX_PROFILE_TEXT_CHARS = 800;
// Een "context" = unieke combinatie van app + dag.
// Zo tellen meerdere gesprekken op dezelfde dag in verschillende apps mee,
// maar tellen 10 berichten in 1 gesprek op 1 dag als slechts 1 context.
const MIN_DISTINCT_CONTEXTS = 3;
const MAX_PROPOSALS = 3;
const MAX_EVIDENCE_PER_PROPOSAL = 5;
const OFFLINE_MODEL = "claude-opus-4-6";
const RATE_LIMIT_MAX = 6;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_PURPOSE = "cross_app_pattern_detect";

// OWN Sense berichten hebben hoogste betrouwbaarheid (praten over zichzelf).
// Andere apps bevatten ook berichten over andere personen — striktere filtering.
const HIGH_TRUST_PROFILES = ["OWN Sense", "ownsense"];

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type MessageRow = {
  id: string;
  created_at: string;
  profile_name: string;
  html: string;
  plain: string; // afgeleid
};

type EvidenceItem = {
  message_id: string;
  created_at: string;
  app: string;
  excerpt: string;
};

type OwnFactRow = {
  fact_text: string;
  is_constraint: boolean | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function normStr(v: unknown): string {
  return String(v ?? "").trim();
}

function getBearerToken(req: Request): string {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

async function resolveAuthUserId(req: Request): Promise<string | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const res = await authClient.auth.getUser();
  return res?.data?.user?.id ?? null;
}

function stripHtml(html: string): string {
  return normStr(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, max: number): string {
  s = normStr(s);
  return s.length <= max ? s : s.slice(0, max) + "…";
}

function dayKey(iso: string): string {
  return (iso || "").slice(0, 10);
}

function profileToApp(profileName: string): string {
  const p = normStr(profileName).toLowerCase();
  if (p === "own sense" || p === "ownsense") return "OWN Sense";
  if (p.startsWith("datesense")) return "DateSense";
  if (p.startsWith("familysense")) return "FamilySense";
  if (p.startsWith("friendsense")) return "FriendSense";
  if (p.startsWith("selfsense") || p === "own sense") return "SelfSense";
  return normStr(profileName) || "Onbekend";
}

function isHighTrustProfile(profileName: string): boolean {
  const p = normStr(profileName).toLowerCase();
  return p === "own sense" || p === "ownsense";
}

/** Bericht is relevant als het voldoende tekst bevat en niet te kort is. */
function isRelevantMessage(plain: string): boolean {
  const s = normStr(plain);
  if (s.length < 15) return false;
  // Sla korte single-word antwoorden over
  const words = s.split(/\s+/).filter(Boolean);
  return words.length >= 4;
}

function wordOverlapScore(a: string, b: string): number {
  const wa = a.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter((x) => x.length > 2);
  const wb = b.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter((x) => x.length > 2);
  if (!wa.length || !wb.length) return 0;
  const set = new Set(wa);
  let hit = 0;
  for (const w of wb) if (set.has(w)) hit++;
  return hit / Math.max(wa.length, wb.length);
}

function safeJsonParse(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}

function extractAssistantText(claudeData: Record<string, unknown>): string {
  const content = claudeData?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && typeof b === "object" && (b as Record<string, unknown>).type === "text")
    .map((b) => normStr((b as Record<string, unknown>).text))
    .join("\n")
    .trim();
}

async function countRate(userId: string): Promise<number | null> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  const q = sb.from("ai_rate_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart)
    .eq("purpose", RATE_PURPOSE);
  const { count, error } = await q;
  if (!error) return count ?? 0;
  // purpose-kolom bestaat mogelijk niet
  if (/purpose/i.test(String(error.message))) {
    const fb = await sb.from("ai_rate_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", windowStart);
    if (fb.error) return null;
    return fb.count ?? 0;
  }
  return null;
}

async function reserveRate(userId: string): Promise<boolean> {
  const ins = await sb.from("ai_rate_log").insert({ user_id: userId, purpose: RATE_PURPOSE });
  if (!ins.error) return true;
  if (ins.error && /purpose/i.test(String(ins.error.message))) {
    const fb = await sb.from("ai_rate_log").insert({ user_id: userId });
    if (!fb.error) return true;
    console.warn("ai_rate_log reserve failed:", fb.error.message);
    return false;
  }
  console.warn("ai_rate_log reserve failed:", ins.error.message);
  return false;
}

async function loadMessages(userId: string): Promise<MessageRow[]> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const res = await sb
    .from("sense_messages")
    .select("id, created_at, profile_name, html")
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES_LOAD);
  if (res.error) throw new Error(res.error.message);
  return (res.data || []).map((r) => {
    const plain = stripHtml(normStr(r.html));
    return {
      id: normStr(r.id),
      created_at: normStr(r.created_at),
      profile_name: normStr(r.profile_name),
      html: normStr(r.html),
      plain,
    };
  }).filter((r) => isRelevantMessage(r.plain));
}

async function loadConfirmedFacts(userId: string): Promise<OwnFactRow[]> {
  const res = await sb
    .from("own_facts")
    .select("fact_text, is_constraint")
    .eq("user_id", userId)
    .eq("status", "accepted")
    .neq("subcategory", "completed")
    .order("updated_at", { ascending: false })
    .limit(MAX_CONFIRMED_FACTS);
  if (res.error) { console.warn("loadConfirmedFacts", res.error.message); return []; }
  return (res.data || []).map((r) => ({
    fact_text: normStr(r.fact_text),
    is_constraint: !!r.is_constraint,
  })).filter((r) => r.fact_text.length > 0);
}

async function loadProfile(userId: string): Promise<{ roepnaam: string; samenvatting: string }> {
  try {
    const res = await sb
      .from("sense_profiles")
      .select("props, algemeen_text")
      .eq("user_id", userId)
      .eq("name", "OWN Sense")
      .maybeSingle();
    if (res.error || !res.data) return { roepnaam: "", samenvatting: "" };
    const props = res.data.props as Record<string, unknown> ?? {};
    const meta = (props.meta as Record<string, unknown>) ?? {};
    const candidates = [
      normStr(props.roepnaam), normStr(meta.roepnaam),
      normStr(props.display_name), normStr(meta.display_name),
    ].filter((s) => s && !/^own\s*sense$/i.test(s));
    return {
      roepnaam: candidates[0] || "",
      samenvatting: truncate(normStr(res.data.algemeen_text), MAX_PROFILE_TEXT_CHARS),
    };
  } catch (e) {
    console.warn("loadProfile", e);
    return { roepnaam: "", samenvatting: "" };
  }
}

async function loadExistingForDedup(userId: string): Promise<{ soft_name: string }[]> {
  const res = await sb
    .from("own_aandachtspunten")
    .select("soft_name")
    .eq("user_id", userId)
    .in("status", ["voorgesteld", "bevestigd"])
    .order("created_at", { ascending: false })
    .limit(30);
  if (res.error) return [];
  return (res.data || []).map((r) => ({ soft_name: normStr(r.soft_name) }));
}

function isDuplicate(softName: string, existing: { soft_name: string }[]): boolean {
  for (const ex of existing) {
    if (wordOverlapScore(softName, ex.soft_name) > 0.5) return true;
  }
  return false;
}

function isRejectedSpeculative(text: string): boolean {
  const s = normStr(text).toLowerCase();
  if (!s) return true;
  if (/\b(lijkt|mogelijk|potentieel|vermoedelijk|waarschijnlijk|schijnt)\b/.test(s)) return true;
  if (/\d+\s*%|\bprocent\b|\bscore\b/.test(s)) return true;
  return false;
}

function formatMessagesForPrompt(msgs: MessageRow[]): string {
  return msgs.map((m) => {
    const app = profileToApp(m.profile_name);
    const trust = isHighTrustProfile(m.profile_name) ? " [hoge-vertrouwen]" : "";
    const excerpt = truncate(m.plain, MAX_CHARS_PER_MSG);
    return `id=${m.id} | datum=${dayKey(m.created_at)} | app=${app}${trust}\ntekst: ${excerpt}`;
  }).join("\n\n---\n\n");
}

function formatFactsForPrompt(facts: OwnFactRow[]): string {
  if (!facts.length) return "(geen)";
  return facts.map((f) => `- ${f.fact_text}`).join("\n");
}

/** Pass 1: detecteer kandidaat-patronen */
function buildDetectSystemPrompt(): string {
  return `Je bent een zorgvuldige gedragsanalist voor een persoonlijk coaching-systeem.

TAAK: Identificeer terugkerende gedragspatronen die DE GEBRUIKER ZELF toont en die het waard zijn om bewust van te zijn — uitdagingen, triggers, reactiepatronen of terugkerende moeilijkheden.

WAT WEL een aandachtspunt is:
- Terugkerende emotionele reacties: "ik raak snel geïrriteerd", "ik trek me terug als het spannend wordt"
- Gedragspatronen met impact: "ik stel moeilijke gesprekken steeds uit", "ik ga over mijn grenzen als iemand iets vraagt"
- Triggers: "ik reageer heftig als ik me niet gehoord voel"
- Terugkerende moeilijkheden: "ik vind het moeilijk om nee te zeggen"

WAT GEEN aandachtspunt is:
- Positieve gewoonten of voorkeuren: "ik voel me beter als ik sport" → NIET voorstellen
- Neutrale observaties: "ik hou van muziek", "ik werk graag 's ochtends" → NIET voorstellen
- Eenmalige situaties, ook al zijn ze negatief

STRIKTE REGELS:
1. EERSTE PERSOON VERPLICHT: alleen als de gebruiker het expliciet over zichzelf zegt met "ik", "me", "mij", "ik merk dat ik", "ik reageer", "ik voel".
2. NOOIT ANDEREN TOESCHRIJVEN: "hij is ongeduldig", "mijn partner reageert snel" → patronen van ANDEREN, nooit van de gebruiker.
3. REACTIES OP ANDEREN ZIJN WEL GELDIG: "ik raak geïrriteerd als hij te laat is" → patroon VAN DE GEBRUIKER.
4. MINIMUM: patroon zichtbaar in minstens ${MIN_DISTINCT_CONTEXTS} verschillende gesprekscontexten (app + dag).
5. GEEN SPECULATIE: geen "lijkt", "mogelijk", "waarschijnlijk", "potentieel".
6. [hoge-vertrouwen] berichten (OWN Sense) meest betrouwbaar. Andere apps vereisen extra zekerheid.
7. Bij twijfel: geen voorstel. Een lege lijst is een correct antwoord.

OUTPUT: Alleen geldig JSON, geen markdown.
Schema: {"proposals": [{"soft_name": "zachte eerste-persoon omschrijving (ik-vorm, max 12 woorden)", "evidence_ids": ["msg-id-1", "msg-id-2", ...]}]}
Maximaal ${MAX_PROPOSALS} voorstellen. Elk voorstel minstens 3 evidence_ids op verschillende datums.`;
}

function buildDetectUserPrompt(
  msgs: MessageRow[],
  facts: OwnFactRow[],
  profile: { roepnaam: string; samenvatting: string },
): string {
  const contextLines: string[] = [];
  if (profile.roepnaam) contextLines.push(`roepnaam: ${profile.roepnaam}`);
  if (profile.samenvatting) contextLines.push(`profiel: ${profile.samenvatting}`);
  const factsText = formatFactsForPrompt(facts);

  return `=== BERICHTEN VAN DE GEBRUIKER (enige bron voor patronen) ===
${formatMessagesForPrompt(msgs)}

=== CONTEXT (alleen voor begrip, nooit als bewijs) ===
${contextLines.join("\n") || "(geen)"}

Bevestigde feiten over de gebruiker (context, geen bewijs):
${factsText}

Analyseer de berichten en geef JSON volgens schema.`;
}

/** Pass 2: valideer of het patroon echt over de gebruiker gaat (niet over iemand anders) */
function buildValidateSystemPrompt(): string {
  return `Je bent een nauwkeurige validatie-AI voor een persoonlijk coaching-systeem.

TAAK: Controleer of een voorgesteld gedragspatroon daadwerkelijk over DE GEBRUIKER ZELF gaat, niet over iemand anders die de gebruiker beschrijft.

Geef voor elk voorstel: {"id": <index>, "valid": true/false, "reason": "kort"}

GELDIG (valid: true):
- Gebruiker schrijft expliciet in eerste persoon dat hij/zij dit zelf ervaart of doet
- Bijv: "ik raak snel ongeduldig", "ik merk dat ik me terugtrek", "ik reageer heftig"

ONGELDIG (valid: false):
- Patroon is gebaseerd op beschrijving van iemand ANDERS
- Bijv: "mijn partner is ongeduldig" → over partner, niet over gebruiker
- Te weinig duidelijk bewijs dat het over de gebruiker gaat
- Speculatief of afgeleid

OUTPUT: Alleen geldig JSON array: [{"id": 0, "valid": true, "reason": "..."}, ...]`;
}

function buildValidateUserPrompt(
  proposals: { soft_name: string; evidence_ids: string[] }[],
  msgById: Map<string, MessageRow>,
): string {
  const lines: string[] = [];
  proposals.forEach((p, i) => {
    lines.push(`Voorstel ${i}: "${p.soft_name}"`);
    lines.push("Bewijs-berichten:");
    for (const id of p.evidence_ids.slice(0, 4)) {
      const m = msgById.get(id);
      if (m) {
        const trust = isHighTrustProfile(m.profile_name) ? " [hoge-vertrouwen]" : "";
        lines.push(`  - ${dayKey(m.created_at)} | ${profileToApp(m.profile_name)}${trust}: "${truncate(m.plain, 200)}"`);
      }
    }
    lines.push("");
  });
  return lines.join("\n");
}

async function callClaude(system: string, userContent: string, maxTokens: number): Promise<string> {
  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort(), 35000);
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: OFFLINE_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: abortCtrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error(String((data as { error?: { message?: string } })?.error?.message || "Claude error"));
  return extractAssistantText(data);
}

async function mayUseSenseiDuringOnboarding(userId: string): Promise<boolean> {
  const completedRes = await sb.from("own_facts").select("id")
    .eq("user_id", userId).eq("source_app", "onboarding").eq("subcategory", "completed").maybeSingle();
  if (completedRes.error || completedRes.data) return false;
  const startedRes = await sb.from("own_facts").select("id")
    .eq("user_id", userId).eq("source_app", "onboarding").limit(1).maybeSingle();
  if (startedRes.error) return false;
  return !!startedRes.data;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
      return json({ error: "Missing required server secrets" }, 500);
    }

    const userId = await resolveAuthUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    // AI access check
    const roleRes = await sb.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const isAdmin = String(roleRes.data?.role || "").toLowerCase() === "admin";
    const accessRes = await sb.from("ai_access").select("ai_enabled").eq("user_id", userId).maybeSingle();
    let aiEnabled = !!accessRes.data?.ai_enabled;
    if (!isAdmin && !aiEnabled) aiEnabled = await mayUseSenseiDuringOnboarding(userId);
    if (!isAdmin && !aiEnabled) {
      return json({ error: "AI toegang niet geactiveerd.", code: "AI_ACCESS_PENDING" }, 403);
    }

    // Rate limiting
    if (!isAdmin) {
      const counted = await countRate(userId);
      if (counted == null) {
        return json({ ok: false, reason: "rate_unavailable", user_message: "AI-gebruik kan nu niet veilig gecontroleerd worden. Probeer later opnieuw." }, 503);
      }
      if (counted != null && counted >= RATE_LIMIT_MAX) {
        return json({ ok: false, reason: "rate_limited", user_message: "Probeer de patroondetectie over een uur opnieuw." }, 429);
      }
    }

    // Data laden
    const msgs = await loadMessages(userId);

    // Controleer minimum aantal gesprekscontexten (app + dag)
    const distinctContexts = new Set(msgs.map((m) => `${profileToApp(m.profile_name)}|${dayKey(m.created_at)}`));
    if (distinctContexts.size < MIN_DISTINCT_CONTEXTS) {
      return json({
        ok: true,
        reason: "too_few_contexts",
        distinct_contexts: distinctContexts.size,
        min_required: MIN_DISTINCT_CONTEXTS,
        inserted: 0,
        proposals: [],
        user_message: "Er zijn nog te weinig gesprekscontexten om betrouwbare patronen te herkennen.",
      });
    }

    const msgById = new Map(msgs.map((m) => [m.id, m]));
    const [facts, profile, existing] = await Promise.all([
      loadConfirmedFacts(userId),
      loadProfile(userId),
      loadExistingForDedup(userId),
    ]);

    // Pass 1: detectie
    const detectSys = buildDetectSystemPrompt();
    const detectUsr = buildDetectUserPrompt(msgs, facts, profile);
    if (!isAdmin) {
      if (!await reserveRate(userId)) {
        return json({ ok: false, reason: "rate_unavailable", user_message: "AI-gebruik kan nu niet veilig geregistreerd worden. Probeer later opnieuw." }, 503);
      }
      const rechecked = await countRate(userId);
      if (rechecked == null) {
        return json({ ok: false, reason: "rate_unavailable", user_message: "AI-gebruik kan nu niet veilig gecontroleerd worden. Probeer later opnieuw." }, 503);
      }
      if (rechecked > RATE_LIMIT_MAX) {
        return json({ ok: false, reason: "rate_limited", user_message: "Probeer de patroondetectie over een uur opnieuw." }, 429);
      }
    }
    const detectRaw = await callClaude(detectSys, detectUsr, 1000);
    const detectCleaned = detectRaw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const detectParsed = safeJsonParse(detectCleaned) as Record<string, unknown> | null;
    const rawProposals = Array.isArray(detectParsed?.proposals) ? detectParsed!.proposals as { soft_name: string; evidence_ids: string[] }[] : [];

    if (!rawProposals.length) {
      return json({ ok: true, reason: "no_proposals_detected", inserted: 0, proposals: [] });
    }

    // Valideer evidence_ids bestaan en haal minimale datums op
    const filteredProposals = rawProposals
      .slice(0, MAX_PROPOSALS)
      .filter((p) => {
        if (!p || typeof p !== "object") return false;
        const name = normStr(p.soft_name);
        if (!name || isRejectedSpeculative(name)) return false;
        const validIds = (p.evidence_ids || []).filter((id) => msgById.has(normStr(id)));
        if (validIds.length < MIN_DISTINCT_CONTEXTS) return false;
        const contexts = new Set(validIds.map((id) => {
          const m = msgById.get(normStr(id))!;
          return `${profileToApp(m.profile_name)}|${dayKey(m.created_at)}`;
        }));
        return contexts.size >= MIN_DISTINCT_CONTEXTS;
      });

    if (!filteredProposals.length) {
      return json({ ok: true, reason: "no_valid_proposals_after_filter", inserted: 0, proposals: [] });
    }

    // Pass 2: validatie — is het patroon echt over de gebruiker?
    const validateSys = buildValidateSystemPrompt();
    const validateUsr = buildValidateUserPrompt(filteredProposals, msgById);
    const validateRaw = await callClaude(validateSys, validateUsr, 600);
    const validateCleaned = validateRaw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const validateParsed = safeJsonParse(validateCleaned) as { id: number; valid: boolean }[] | null;

    const validIndexes = new Set<number>();
    if (Array.isArray(validateParsed)) {
      for (const v of validateParsed) {
        if (v && typeof v === "object" && v.valid === true && typeof v.id === "number") {
          validIndexes.add(v.id);
        }
      }
    } else {
      // Bij parse-fout: conservatief, alle proposals doorlaten (Pass 1 had al filters)
      filteredProposals.forEach((_, i) => validIndexes.add(i));
    }

    const validatedProposals = filteredProposals.filter((_, i) => validIndexes.has(i));
    if (!validatedProposals.length) {
      return json({ ok: true, reason: "rejected_by_validation", inserted: 0, proposals: [] });
    }

    // Wegschrijven naar own_aandachtspunten
    const insertedRows: { id: string; soft_name: string }[] = [];
    let skippedDuplicates = 0;

    for (const p of validatedProposals) {
      const softName = normStr(p.soft_name);
      if (isDuplicate(softName, existing)) { skippedDuplicates++; continue; }

      const evidenceItems: EvidenceItem[] = (p.evidence_ids || [])
        .map((id) => normStr(id))
        .filter((id) => msgById.has(id))
        .slice(0, MAX_EVIDENCE_PER_PROPOSAL)
        .map((id) => {
          const m = msgById.get(id)!;
          return {
            message_id: id,
            created_at: m.created_at,
            app: profileToApp(m.profile_name),
            excerpt: truncate(m.plain, 120),
          };
        });

      // Minimaal 3 verschillende gesprekscontexten (app + dag) in evidence
      const evContexts = new Set(evidenceItems.map((e) => `${e.app}|${dayKey(e.created_at)}`));
      if (evContexts.size < MIN_DISTINCT_CONTEXTS) { continue; }

      const ins = await sb.from("own_aandachtspunten").insert({
        user_id: userId,
        soft_name: softName,
        evidence: evidenceItems,
        tips_advice: null,
        status: "voorgesteld",
        source_app: "cross-app",
      }).select("id, soft_name").single();

      if (ins.error) { console.warn("insert aandachtspunt", ins.error.message); continue; }
      const row = { id: String(ins.data?.id || ""), soft_name: softName };
      insertedRows.push(row);
      existing.push({ soft_name: softName });
      if (insertedRows.length >= MAX_PROPOSALS) break;
    }

    return json({
      ok: true,
      reason: insertedRows.length ? "proposals_inserted" : "no_new_proposals",
      inserted: insertedRows.length,
      skipped_duplicates: skippedDuplicates,
      proposals: insertedRows,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("cross-app-pattern-detect", msg);
    return json({ error: msg }, 500);
  }
});
