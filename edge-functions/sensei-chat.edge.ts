/**
 * sensei-chat: Anthropic-proxy met optionele dossier-snapshots en prompt caching.
 * DB: migrations/20260503_ai_flags_and_dossier_snapshots.sql (ai_feature_flags, ai_dossier_snapshot).
 * Flags standaard uit. Dev: SENSEI_FORCE_PROMPT_CACHE=true om caching te testen zonder DB-flag.
 * Prompt cache zit bij Anthropic (kortlevend), niet op user devices; snapshots wél in Supabase (cross-device).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_MAX_OWNSENSE_HUB = 24;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const OWNSENSE_HUB_PURPOSES = ["ownsense_hub", "ownsense_insight"] as const;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function getBearerToken(req: Request) {
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

const OWN_SENSE_BAD = /^own\s*sense$/i;

function normStr(v: unknown): string {
  return String(v ?? "").trim();
}

function emailLocalFromAddress(email: string): string {
  const e = normStr(email).toLowerCase();
  const at = e.indexOf("@");
  return at > 0 ? e.slice(0, at) : "";
}

function isLikelyAuthSlugVersusEmail(name: string, emailLocal: string): boolean {
  const raw = normStr(name);
  const loc = emailLocal.toLowerCase().replace(/[\s._-]+/g, "");
  const n = raw.toLowerCase().replace(/[\s._-]+/g, "");
  if (!n || !loc || n !== loc) return false;
  if (/\d/.test(raw)) return true;
  if (n.length >= 10) return true;
  if (raw === raw.toLowerCase() && n.length >= 8) return true;
  return false;
}

function pickFirstFromProps(candidates: string[]): string {
  for (const raw of candidates) {
    const s = normStr(raw);
    if (!s || OWN_SENSE_BAD.test(s)) continue;
    return s;
  }
  return "";
}

function pickFirstFromAuth(candidates: string[], emailLocal: string): string {
  for (const raw of candidates) {
    const s = normStr(raw);
    if (!s || OWN_SENSE_BAD.test(s)) continue;
    if (emailLocal && isLikelyAuthSlugVersusEmail(s, emailLocal)) continue;
    return s;
  }
  return "";
}

async function countAiRateLog(
  userId: string,
  windowStart: string,
  mode: "all" | "general" | "hub",
): Promise<{ count: number | null; purposeSupported: boolean }> {
  let query = sb
    .from("ai_rate_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);
  if (mode === "hub") {
    query = query.in("purpose", [...OWNSENSE_HUB_PURPOSES]);
  } else if (mode === "general") {
    query = query.or(
      "purpose.is.null,and(purpose.neq.ownsense_hub,purpose.neq.ownsense_insight)",
    );
  }
  const { count, error } = await query;
  if (!error) return { count: count ?? 0, purposeSupported: mode !== "all" };
  if (mode !== "all" && /purpose/i.test(String(error.message || ""))) {
    const fallback = await sb
      .from("ai_rate_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", windowStart);
    if (fallback.error) {
      console.warn("ai_rate_log fout:", fallback.error.message);
      return { count: null, purposeSupported: false };
    }
    return { count: fallback.count ?? 0, purposeSupported: false };
  }
  console.warn("ai_rate_log fout:", error.message);
  return { count: null, purposeSupported: false };
}

async function reserveAiRateLog(userId: string, purpose?: string): Promise<boolean> {
  const row: Record<string, unknown> = { user_id: userId };
  if (purpose) row.purpose = purpose;
  const ins = await sb.from("ai_rate_log").insert(row);
  if (!ins.error) return true;
  if (purpose && /purpose/i.test(String(ins.error.message || ""))) {
    const fallback = await sb.from("ai_rate_log").insert({ user_id: userId });
    if (!fallback.error) return true;
    console.warn("ai_rate_log reserveren mislukt:", fallback.error.message);
    return false;
  }
  console.warn("ai_rate_log reserveren mislukt:", ins.error.message);
  return false;
}

async function resolveRoepnaam(userId: string): Promise<string> {
  try {
    const authRes = await sb.auth.admin.getUserById(userId);
    const emailLocal = emailLocalFromAddress(String(authRes.data?.user?.email ?? ""));
    const meta = authRes.data?.user?.user_metadata;
    const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};

    const profRes = await sb
      .from("sense_profiles")
      .select("props")
      .eq("user_id", userId)
      .eq("name", "OWN Sense")
      .maybeSingle();
    if (profRes.error) console.warn("resolveRoepnaam profile", profRes.error.message);
    const props = profRes.data?.props;
    const p = props && typeof props === "object" ? (props as Record<string, unknown>) : {};
    const pm = p.meta && typeof p.meta === "object" ? (p.meta as Record<string, unknown>) : {};

    const fromProf = pickFirstFromProps([
      normStr(p.roepnaam), normStr(pm.roepnaam),
      normStr(p.display_name), normStr(pm.display_name),
      normStr(p.full_name), normStr(pm.full_name),
    ]);
    if (fromProf) return fromProf;

    const fromAuth = pickFirstFromAuth(
      [normStr(m.roepnaam), normStr(m.display_name), normStr(m.full_name), normStr(m.first_name)],
      emailLocal,
    );
    if (fromAuth) return fromAuth;
  } catch (e) {
    console.warn("resolveRoepnaam", e);
  }
  return "";
}

function augmentSystemWithRoepnaam(system: string, roep: string): string {
  const sys = String(system || "");
  if (!roep || sys.includes("ROEPNAAM_GEBRUIKER:")) return sys;
  return (
    `ROEPNAAM_GEBRUIKER: ${roep}\n` +
    "Spreek de gebruiker in natuurlijke taal consequent met deze roepnaam aan (geen andere koosnaam verzinnen). " +
    "Als de opdracht uitsluitend gestructureerde machine-output vraagt (bijv. strikt JSON), volg het gevraagde formaat en laat de roepnaam buiten die structuur.\n\n" +
    sys
  );
}

/** Ruwe token-schatting voor Anthropic cache-minimum (~1024 tokens). */
function estimateTokensRough(text: string): number {
  return Math.ceil(String(text || "").length / 4);
}

async function isFlagEnabled(userId: string, flagKey: string): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("is_flag_enabled", { p_flag: flagKey, p_user: userId });
    if (error) {
      if (!/function|does not exist|schema cache/i.test(String(error.message))) {
        console.warn("is_flag_enabled", flagKey, error.message);
      }
      return false;
    }
    return data === true;
  } catch (e) {
    console.warn("is_flag_enabled rpc", flagKey, e);
    return false;
  }
}

function forcePromptCacheFromEnv(): boolean {
  const v = String(Deno.env.get("SENSEI_FORCE_PROMPT_CACHE") ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Bouwt Anthropic web_search-tool uit client-body `{ tools: { web_search: { allowed_domains, max_search_queries }}}`. */
function buildAnthropicWebSearchTools(body: Record<string, unknown>): unknown[] | undefined {
  const tools = body?.tools;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) return undefined;
  const ws = (tools as Record<string, unknown>).web_search;
  if (!ws || typeof ws !== "object" || Array.isArray(ws)) return undefined;
  const domainsRaw = (ws as Record<string, unknown>).allowed_domains;
  const domains = Array.isArray(domainsRaw)
    ? domainsRaw.map((d) => String(d ?? "").trim()).filter(Boolean)
    : [];
  if (!domains.length) return undefined;
  const maxQ = Number((ws as Record<string, unknown>).max_search_queries);
  const maxUses = Math.max(1, Math.min(10, Number.isFinite(maxQ) ? maxQ : 3));
  return [{
    type: "web_search_20250305",
    name: "web_search",
    max_uses: maxUses,
    allowed_domains: domains,
  }];
}

/** Cross-device compacte context wanneer snapshot-generate (of handmatig) rijen vult. */
async function loadDossierSnapshotBlock(
  userId: string,
  profileName: string,
  scope: "own_lens" | "target_dossier",
): Promise<string | null> {
  const pn = normStr(profileName);
  if (!pn) return null;
  try {
    const res = await sb
      .from("ai_dossier_snapshot")
      .select("snapshot_text")
      .eq("user_id", userId)
      .eq("profile_name", pn)
      .eq("scope", scope)
      .maybeSingle();
    if (res.error) {
      if (!/relation|does not exist|schema cache/i.test(String(res.error.message))) {
        console.warn("ai_dossier_snapshot", res.error.message);
      }
      return null;
    }
    const t = normStr(res.data?.snapshot_text);
    return t || null;
  } catch (e) {
    console.warn("loadDossierSnapshotBlock", e);
    return null;
  }
}

/**
 * SenseCorner-intake (onboarding.html): admin heeft ai_access nog niet op true gezet,
 * maar samenvattingen en slotzin mogen wel. Alleen als er al onboarding-data is en
 * de intake nog niet met subcategory "completed" is afgesloten (zo blijft sensei-chat
 * dicht voor accounts die de intake nooit starten).
 */
async function mayUseSenseiDuringOnboarding(userId: string): Promise<boolean> {
  const completedRes = await sb
    .from("own_facts")
    .select("id")
    .eq("user_id", userId)
    .eq("source_app", "onboarding")
    .eq("subcategory", "completed")
    .maybeSingle();
  if (completedRes.error) {
    console.warn("onboarding gate completed check", completedRes.error.message);
    return false;
  }
  if (completedRes.data) return false;

  const startedRes = await sb
    .from("own_facts")
    .select("id")
    .eq("user_id", userId)
    .eq("source_app", "onboarding")
    .limit(1)
    .maybeSingle();
  if (startedRes.error) {
    console.warn("onboarding gate started check", startedRes.error.message);
    return false;
  }
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

    // ── AI access controle ────────────────────────────────────────────────
    const roleRes = await sb.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleRes.error) return json({ error: roleRes.error.message }, 500);
    const isAdmin = String(roleRes.data?.role || "").toLowerCase() === "admin";

    const accessRes = await sb.from("ai_access").select("ai_enabled").eq("user_id", userId).maybeSingle();
    if (accessRes.error) return json({ error: accessRes.error.message }, 500);
    let aiEnabled = !!accessRes.data?.ai_enabled;
    if (!isAdmin && !aiEnabled) {
      aiEnabled = await mayUseSenseiDuringOnboarding(userId);
    }
    if (!isAdmin && !aiEnabled) {
      return json({
        error: "AI toegang is nog niet geactiveerd voor je account. Vraag een admin om je te approven in SenseCorner.",
        code: "AI_ACCESS_PENDING",
      }, 403);
    }

    // ── Verzoek verwerken ─────────────────────────────────────────────────
    const body = (await req.json()) as Record<string, unknown>;
    const isOwnsenseHub = body?.ownsense_hub === true || body?.ownsense_insight === true;

    // ── Rate limiting (aparte bucket: OWN inzichten + foto-analyse) ───────
    if (!isAdmin) {
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
      const mode = isOwnsenseHub ? "hub" : "general";
      const counted = await countAiRateLog(userId, windowStart, mode);
      const maxAllowed = counted.purposeSupported
        ? (isOwnsenseHub ? RATE_LIMIT_MAX_OWNSENSE_HUB : RATE_LIMIT_MAX)
        : RATE_LIMIT_MAX;
      const label = isOwnsenseHub
        ? "OWN Sense profiel-ai (inzichten en foto's)"
        : "Sensei-berichten in DateSense, FamilySense en SelfSense";
      if (counted.count == null) {
        return json({ error: "Kan AI-gebruik niet controleren. Probeer later opnieuw.", code: "AI_RATE_LIMIT_UNAVAILABLE" }, 503);
      }
      if (counted.count >= maxAllowed) {
        return json({
          error: `Limiet bereikt: max ${maxAllowed} ${label} per uur. Probeer het later opnieuw.`,
          code: "AI_RATE_LIMIT",
        }, 429);
      }
      const purpose = counted.purposeSupported && isOwnsenseHub ? "ownsense_hub" : undefined;
      if (!await reserveAiRateLog(userId, purpose)) {
        return json({ error: "Kan AI-gebruik niet registreren. Probeer later opnieuw.", code: "AI_RATE_LIMIT_UNAVAILABLE" }, 503);
      }
      const rechecked = await countAiRateLog(userId, windowStart, mode);
      if (rechecked.count == null) {
        return json({ error: "Kan AI-gebruik niet controleren. Probeer later opnieuw.", code: "AI_RATE_LIMIT_UNAVAILABLE" }, 503);
      }
      if (rechecked.count > maxAllowed) {
        return json({
          error: `Limiet bereikt: max ${maxAllowed} ${label} per uur. Probeer het later opnieuw.`,
          code: "AI_RATE_LIMIT",
        }, 429);
      }
    }

    // Optioneel: owner_profile / target_profile (dossiernamen) + flag use_snapshots
    // → compacte tekst uit ai_dossier_snapshot (zelfde data op alle devices).
    let system = String(body?.system || "").trim();
    const maxTokens = Math.max(64, Math.min(2000, Number(body?.max_tokens || 800)));
    const model = String(body?.model || "claude-sonnet-4-6");
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (!messages.length) return json({ error: "messages is required" }, 400);

    const roep = await resolveRoepnaam(userId);

    const ownerProfileOpt = normStr(body?.owner_profile);
    const targetProfileOpt = normStr(body?.target_profile);
    if ((await isFlagEnabled(userId, "use_snapshots")) && (ownerProfileOpt || targetProfileOpt)) {
      const extraBits: string[] = [];
      if (ownerProfileOpt) {
        const snap = await loadDossierSnapshotBlock(userId, ownerProfileOpt, "own_lens");
        if (snap) {
          extraBits.push(
            `<eigenaar_snapshot dossier="${ownerProfileOpt.replace(/"/g, "'")}">\n${snap}\n</eigenaar_snapshot>`,
          );
        }
      }
      if (targetProfileOpt) {
        const snap = await loadDossierSnapshotBlock(userId, targetProfileOpt, "target_dossier");
        if (snap) {
          extraBits.push(
            `<subject_snapshot dossier="${targetProfileOpt.replace(/"/g, "'")}">\n${snap}\n</subject_snapshot>`,
          );
        }
      }
      if (extraBits.length) {
        system =
          "Gebruik onderstaande dossier-snapshots als feitelijke context (platte tekst). Vul niets in dat daar tegenstreept.\n\n" +
          extraBits.join("\n\n") +
          "\n\n" +
          system;
      }
    }

    system = augmentSystemWithRoepnaam(system, roep);

    const usePromptCache =
      forcePromptCacheFromEnv() || (await isFlagEnabled(userId, "use_prompt_caching"));
    const minTokensForCache = 1024;
    const anthropicHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    };
    let systemPayload: unknown = system;
    if (usePromptCache && estimateTokensRough(system) >= minTokensForCache) {
      systemPayload = [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
      anthropicHeaders["anthropic-beta"] = "prompt-caching-2024-07-31";
    }

    const anthropicTools = buildAnthropicWebSearchTools(body);
    const anthropicPayload: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      system: systemPayload,
      messages,
    };
    if (anthropicTools?.length) {
      anthropicPayload.tools = anthropicTools;
    }

    // ── Anthropic aanroepen ───────────────────────────────────────────────
    const claudeAbort = new AbortController();
    const claudeTimer = setTimeout(() => claudeAbort.abort(), 25000);
    let claudeRes: Response;
    try {
      claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: anthropicHeaders,
        body: JSON.stringify(anthropicPayload),
        signal: claudeAbort.signal,
      });
    } finally {
      clearTimeout(claudeTimer);
    }

    const claudeData = await claudeRes.json();
    if (!claudeRes.ok) {
      console.error("Claude API fout:", JSON.stringify(claudeData));
      return json({ error: claudeData?.error?.message || "Claude call failed" }, claudeRes.status);
    }

    return json(claudeData, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
