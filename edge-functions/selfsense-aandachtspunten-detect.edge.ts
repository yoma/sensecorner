/**
 * SelfSense aandachtspunten detectie (Fase 2, offline).
 * Endpoint: POST /functions/v1/selfsense-aandachtspunten-detect
 * Bron: uitsluitend selfsense_checkins. Schrijft naar own_aandachtspunten (status voorgesteld).
 * tips_advice blijft leeg tot bevestiging (Fase 3+).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const MIN_RELEVANT_CHECKINS = 4;
const MAX_PROPOSALS = 3;
const LOOKBACK_DAYS = 90;
const MAX_CHECKINS_LOAD = 40;
const OFFLINE_MODEL = "claude-opus-4-6";
const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_PURPOSE = "selfsense_aandachtspunten_detect";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DUNNE_CONTEXT_DEFAULT =
  "DUNNE CONTEXT: Als het dossier of de context weinig concrete informatie bevat over deze specifieke persoon of situatie, zeg dat dan expliciet aan de gebruiker (bijvoorbeeld: ik werk hier met beperkte info). Geef voorlopige richting op gezonde principes, geen vast advies dat doet alsof je de persoon goed kent. Stel daarna een gerichte vervolgvraag om het dossier te verrijken. Geef wel advies wanneer er voldoende context is; doorvragen is alleen voor echte dunne situaties.";

const AANDACHTSPUNTEN_DUNNE_EXTRA =
  "AANDACHTSPUNTEN-DETECTIE (SelfSense, offline): Je leest alleen de meegeleverde check-in rijen. Bij onvoldoende of te vage inhoud verzin je geen aandachtspunten. Geef dan insufficient: true en een warme user_message in het Nederlands: eerlijk dat er nog te weinig info is, uitnodigend naar verder invullen van check-ins en vragen, geen verwijt, geen patroon verzinnen. Gebruik nooit Unicode U+2014 (em dash).";

const AANDACHTSPUNTEN_EXTRACT_RULES = `AANDACHTSPUNTEN-EXTRACTIE (strikt, parallel aan own_facts):
- Output: alleen geldig JSON-object, geen markdown.
- Maximaal ${MAX_PROPOSALS} voorstellen in proposals-array (0-${MAX_PROPOSALS}).
- Elk voorstel: soft_name (zachte, niet-oordelende eerste-persoon formulering, kort), evidence (array met 2-6 items).
- Elk evidence-item: exact {"checkin_id":"<uuid>","created_at":"<ISO8601>"} en checkin_id MOET in de meegeleverde lijst staan.
- Geen scores, percentages, cijfers of interpretatielabels.
- Verboden in soft_name: lijkt, mogelijk, potentieel, vermoedelijk, waarschijnlijk, schijnt, neemt een houding aan, bevindt zich in een stadium, wijst op.
- Alleen patronen die expliciet en herhaald in meerdere check-ins terugkomen; geen eenmalige stemming als vast patroon.
- tips_advice: nooit invullen (laat weg of null).
- Bij twijfel: lege proposals en insufficient true met user_message.`;

type CheckinRow = {
  id: string;
  created_at: string;
  answer: string;
  note: string | null;
};

type EvidenceItem = { checkin_id: string; created_at: string };

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

function isRelevantCheckin(row: CheckinRow): boolean {
  const answer = normStr(row.answer);
  if (!answer) return false;
  const note = normStr(row.note);
  // Relevant: expliciete stemming (niet "niet vandaag") of voldoende toelichting in note.
  if (answer !== "niet vandaag") return true;
  return note.length >= 8;
}

function warmInsufficientDataMessage(): string {
  return (
    "Ik heb nog te weinig van je gehoord om eerlijke patronen te herkennen. Dat is geen probleem, " +
    "het betekent gewoon dat we nog wat moeten opbouwen. Hoe meer je je check-ins en vragen invult, " +
    "hoe beter ik kan zien wat er bij jou terugkomt. Zullen we daarmee starten?"
  );
}

function isRejectedSpeculativeText(text: string): boolean {
  const s = normStr(text).toLowerCase();
  if (!s) return true;
  if (/\b(lijkt|mogelijk|potentieel|vermoedelijk|waarschijnlijk|schijnt)\b/.test(s)) return true;
  if (/\bbevindt\s+zich\s+in\s+.+\s+stadium\b/.test(s)) return true;
  if (/\bneemt\s+.+\s+houding\s+aan\b/.test(s)) return true;
  if (/\d+\s*%|\bprocent\b|\bscore\b/.test(s)) return true;
  return false;
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
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

/** Zelfde onboarding-gate als sensei-chat: intake gestart, nog niet completed. */
async function mayUseSenseiDuringOnboarding(userId: string): Promise<boolean> {
  const completedRes = await sb
    .from("own_facts")
    .select("id")
    .eq("user_id", userId)
    .eq("source_app", "onboarding")
    .eq("subcategory", "completed")
    .maybeSingle();
  if (completedRes.error || completedRes.data) return false;

  const startedRes = await sb
    .from("own_facts")
    .select("id")
    .eq("user_id", userId)
    .eq("source_app", "onboarding")
    .limit(1)
    .maybeSingle();
  if (startedRes.error) return false;
  return !!startedRes.data;
}

async function loadDunneContextClause(): Promise<string> {
  try {
    const res = await sb
      .from("sensei_core_overrides")
      .select("value")
      .eq("key", "dunne_context")
      .maybeSingle();
    const v = normStr(res.data?.value);
    return v || DUNNE_CONTEXT_DEFAULT;
  } catch {
    return DUNNE_CONTEXT_DEFAULT;
  }
}

async function countRate(userId: string): Promise<number | null> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  let query = sb
    .from("ai_rate_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);
  query = query.eq("purpose", RATE_PURPOSE);
  const { count, error } = await query;
  if (!error) return count ?? 0;
  if (/purpose/i.test(String(error.message || ""))) {
    const fallback = await sb
      .from("ai_rate_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", windowStart);
    if (fallback.error) return null;
    return fallback.count ?? 0;
  }
  return null;
}

async function logRate(userId: string): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, purpose: RATE_PURPOSE };
  const ins = await sb.from("ai_rate_log").insert(row);
  if (ins.error && /purpose/i.test(String(ins.error.message || ""))) {
    await sb.from("ai_rate_log").insert({ user_id: userId });
  }
}

async function loadRelevantCheckins(userId: string): Promise<CheckinRow[]> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const res = await sb
    .from("selfsense_checkins")
    .select("id, created_at, answer, note")
    .eq("user_id", userId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(MAX_CHECKINS_LOAD);
  if (res.error) throw new Error(res.error.message);
  const rows = (res.data || []) as CheckinRow[];
  return rows.filter(isRelevantCheckin);
}

function formatCheckinsForPrompt(rows: CheckinRow[]): string {
  return rows
    .map((r) => {
      const note = normStr(r.note);
      return [
        `id=${r.id}`,
        `created_at=${r.created_at}`,
        `answer=${r.answer}`,
        note ? `note=${note}` : "note=",
      ].join(" | ");
    })
    .join("\n");
}

function normalizeEvidence(
  raw: unknown,
  checkinById: Map<string, CheckinRow>,
): EvidenceItem[] {
  if (!Array.isArray(raw)) return [];
  const out: EvidenceItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const cid = normStr((item as Record<string, unknown>).checkin_id);
    if (!cid || seen.has(cid) || !checkinById.has(cid)) continue;
    const row = checkinById.get(cid)!;
    out.push({ checkin_id: cid, created_at: row.created_at });
    seen.add(cid);
    if (out.length >= 6) break;
  }
  return out.length >= 2 ? out : [];
}

async function loadExistingForDedup(userId: string): Promise<
  { soft_name: string; evidence: EvidenceItem[] }[]
> {
  const res = await sb
    .from("own_aandachtspunten")
    .select("soft_name, evidence")
    .eq("user_id", userId)
    .in("status", ["voorgesteld", "bevestigd"])
    .order("created_at", { ascending: false })
    .limit(30);
  if (res.error) return [];
  return (res.data || []).map((r) => ({
    soft_name: normStr(r.soft_name),
    evidence: Array.isArray(r.evidence) ? (r.evidence as EvidenceItem[]) : [],
  }));
}

function isDuplicateProposal(
  softName: string,
  evidence: EvidenceItem[],
  existing: { soft_name: string; evidence: EvidenceItem[] }[],
): boolean {
  const ids = new Set(evidence.map((e) => e.checkin_id));
  for (const ex of existing) {
    if (wordOverlapScore(softName, ex.soft_name) > 0.55) return true;
    const exIds = (ex.evidence || []).map((e) => normStr(e.checkin_id)).filter(Boolean);
    if (exIds.length && ids.size) {
      const overlap = exIds.filter((id) => ids.has(id)).length;
      if (overlap >= Math.min(2, Math.min(exIds.length, ids.size))) return true;
    }
  }
  return false;
}

function buildSystemPrompt(dunneContext: string): string {
  return [
    dunneContext,
    AANDACHTSPUNTEN_DUNNE_EXTRA,
    AANDACHTSPUNTEN_EXTRACT_RULES,
    'JSON-schema: {"insufficient":boolean,"user_message":string|null,"proposals":[{"soft_name":string,"evidence":[{"checkin_id":string,"created_at":string}]}]}',
  ].join("\n\n");
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

    const roleRes = await sb.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const isAdmin = String(roleRes.data?.role || "").toLowerCase() === "admin";
    const accessRes = await sb.from("ai_access").select("ai_enabled").eq("user_id", userId).maybeSingle();
    let aiEnabled = !!accessRes.data?.ai_enabled;
    if (!isAdmin && !aiEnabled) {
      aiEnabled = await mayUseSenseiDuringOnboarding(userId);
    }
    if (!isAdmin && !aiEnabled) {
      return json({
        error: "AI toegang is nog niet geactiveerd voor je account.",
        code: "AI_ACCESS_PENDING",
      }, 403);
    }

    if (!isAdmin) {
      const counted = await countRate(userId);
      if (counted != null && counted >= RATE_LIMIT_MAX) {
        return json({
          ok: false,
          reason: "rate_limited",
          user_message: "Even rustig aan: probeer de aandachtspunten-detectie over een uur opnieuw.",
        }, 429);
      }
    }

    const relevant = await loadRelevantCheckins(userId);
    const relevantCount = relevant.length;

    if (relevantCount < MIN_RELEVANT_CHECKINS) {
      return json({
        ok: true,
        reason: "too_few_checkins",
        relevant_count: relevantCount,
        min_required: MIN_RELEVANT_CHECKINS,
        inserted: 0,
        user_message: warmInsufficientDataMessage(),
        proposals: [],
      });
    }

    const checkinById = new Map(relevant.map((r) => [r.id, r]));
    const dunne = await loadDunneContextClause();
    const system = buildSystemPrompt(dunne);
    const userContent =
      `Check-ins (${relevantCount} relevante rijen, laatste ${LOOKBACK_DAYS} dagen):\n` +
      formatCheckinsForPrompt(relevant) +
      "\n\nAnalyseer en geef JSON volgens schema.";

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: OFFLINE_MODEL,
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    const claudeData = (await claudeRes.json()) as Record<string, unknown>;
    if (!claudeRes.ok) {
      console.error("aandachtspunten Claude:", JSON.stringify(claudeData));
      return json({ error: (claudeData as { error?: { message?: string } })?.error?.message || "Claude call failed" }, claudeRes.status);
    }

    if (!isAdmin) await logRate(userId);

    const rawText = extractAssistantText(claudeData);
    const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = safeJsonParse(cleaned) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") {
      return json({ ok: true, reason: "parse_error", inserted: 0, proposals: [] });
    }

    if (parsed.insufficient === true) {
      const msg = normStr(parsed.user_message) || warmInsufficientDataMessage();
      return json({
        ok: true,
        reason: "ai_insufficient",
        relevant_count: relevantCount,
        inserted: 0,
        user_message: msg,
        proposals: [],
      });
    }

    const existing = await loadExistingForDedup(userId);
    const rawProposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
    const insertedRows: { id: string; soft_name: string; evidence: EvidenceItem[] }[] = [];
    let skippedDuplicates = 0;

    for (const p of rawProposals.slice(0, MAX_PROPOSALS)) {
      if (!p || typeof p !== "object") continue;
      const softName = normStr((p as Record<string, unknown>).soft_name);
      if (!softName || isRejectedSpeculativeText(softName)) continue;
      const evidence = normalizeEvidence((p as Record<string, unknown>).evidence, checkinById);
      if (!evidence.length) continue;
      if (isDuplicateProposal(softName, evidence, existing)) {
        skippedDuplicates++;
        continue;
      }
      const ins = await sb.from("own_aandachtspunten").insert({
        user_id: userId,
        soft_name: softName,
        evidence,
        tips_advice: null,
        status: "voorgesteld",
        source_app: "selfsense",
      }).select("id, soft_name, evidence").single();
      if (ins.error) {
        console.warn("own_aandachtspunten insert", ins.error.message);
        continue;
      }
      const row = {
        id: String(ins.data?.id || ""),
        soft_name: softName,
        evidence,
      };
      insertedRows.push(row);
      existing.push(row);
      if (insertedRows.length >= MAX_PROPOSALS) break;
    }

    return json({
      ok: true,
      reason: insertedRows.length ? "proposals_inserted" : "no_proposals",
      relevant_count: relevantCount,
      inserted: insertedRows.length,
      skipped_duplicates: skippedDuplicates,
      proposals: insertedRows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
