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
const RATE_LIMIT_MAX_GATEWAY = 30;
// Samenvattingen bij openen: aparte pot, zodat bijpraten de chatlimiet niet opeet.
const RATE_LIMIT_MAX_GATEWAY_SUMMARY = 8;
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
  mode: "all" | "general" | "hub" | "gateway" | "gateway_summary",
): Promise<{ count: number | null; purposeSupported: boolean }> {
  let query = sb
    .from("ai_rate_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);
  if (mode === "hub") {
    query = query.in("purpose", [...OWNSENSE_HUB_PURPOSES]);
  } else if (mode === "gateway") {
    query = query.eq("purpose", "gateway");
  } else if (mode === "gateway_summary") {
    query = query.eq("purpose", "gateway_summary");
  } else if (mode === "general") {
    query = query.or(
      "purpose.is.null,and(purpose.neq.ownsense_hub,purpose.neq.ownsense_insight,purpose.neq.gateway,purpose.neq.gateway_summary)",
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

const GATEWAY_DOMAINS: { domain: string; vertelApp: string; label: string }[] = [
  { domain: "date", vertelApp: "datesense", label: "DateSense" },
  { domain: "family", vertelApp: "familysense", label: "FamilySense" },
  { domain: "friend", vertelApp: "friendsense", label: "FriendSense" },
  { domain: "self", vertelApp: "selfsense", label: "SelfSense" },
];

const GATEWAY_SUMMARY_MAX_SESSIONS = 5;
const GATEWAY_SUMMARY_MAX_MSGS = 40;
const GATEWAY_SUMMARY_MSG_CHARS = 280;
const GATEWAY_SUMMARY_TOTAL_CHARS = 6000;
const GATEWAY_SUMMARY_MAX_STORED_CHARS = 600;
const GATEWAY_SUMMARY_MAX_PER_OPEN = 2;

function buildDomainSummarySystem(label: string): string {
  return (
    `Je vat feitelijk samen wat er recent speelt in het ${label}-domein van de gebruiker, ` +
    "op basis van meegegeven gespreksfragmenten. Regels: maximaal 2 a 3 zinnen, alleen feiten " +
    "die letterlijk in de fragmenten staan, geen interpretaties, geen diagnoses, geen scores of " +
    "percentages, geen psychologische labels. Nederlands. Gebruik nooit Unicode U+2014 (em dash). " +
    "Antwoord met alleen de samenvatting, zonder aanhef of toelichting."
  );
}

async function callAnthropicPlain(
  system: string,
  userText: string,
  maxTokens: number,
): Promise<string | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 20000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userText }],
      }),
      signal: abort.signal,
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn("gateway summary Claude fout:", JSON.stringify(data?.error ?? data));
      return null;
    }
    const parts = Array.isArray(data?.content) ? data.content : [];
    const text = parts
      .filter((p: Record<string, unknown>) => p?.type === "text")
      .map((p: Record<string, unknown>) => String(p?.text ?? ""))
      .join(" ")
      .trim();
    return text || null;
  } catch (e) {
    console.warn("gateway summary call", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function logGatewaySummaryUsage(userId: string) {
  sb.from("ai_rate_log").insert({ user_id: userId, purpose: "gateway_summary" }).then(
    ({ error: logError }) => {
      if (logError && /purpose/i.test(String(logError.message || ""))) {
        sb.from("ai_rate_log").insert({ user_id: userId }).then(({ error: logError2 }) => {
          if (logError2) console.warn("Loggen mislukt:", logError2.message);
        });
      } else if (logError) {
        console.warn("Loggen mislukt:", logError.message);
      }
    },
  );
}

async function handleGatewaySummaries(userId: string, isAdmin: boolean): Promise<Response> {
  const updated: string[] = [];
  const skipped: string[] = [];
  let generatedThisOpen = 0;

  const existingRes = await sb
    .from("domain_summaries")
    .select("domain, source_updated_at")
    .eq("user_id", userId);
  if (existingRes.error) {
    console.warn("domain_summaries lezen:", existingRes.error.message);
    return json({ updated, skipped: GATEWAY_DOMAINS.map((d) => d.domain) });
  }
  const existing = new Map<string, string | null>();
  for (const row of existingRes.data ?? []) {
    existing.set(
      String(row.domain),
      row.source_updated_at ? String(row.source_updated_at) : null,
    );
  }

  /* Gateway-chat + bevestigde voorstellen: eenmalig laden voor alle domeinen. */
  const gwSesRes = await sb
    .from("sense_sessions")
    .select("id, updated_at")
    .eq("user_id", userId)
    .eq("vertel_app", "gateway")
    .order("updated_at", { ascending: false })
    .limit(GATEWAY_SUMMARY_MAX_SESSIONS);
  if (gwSesRes.error) {
    console.warn("gateway sessions lezen:", gwSesRes.error.message);
  }
  const gwSessions = gwSesRes.data ?? [];

  const propRes = await sb
    .from("gateway_proposals")
    .select("proposal_text, target_domain, target_profile, resolved_at, status")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .order("resolved_at", { ascending: false })
    .limit(40);
  if (propRes.error) {
    console.warn("gateway_proposals lezen:", propRes.error.message);
  }
  const confirmedProps = (propRes.data ?? []).filter((r) =>
    String(r?.proposal_text ?? "").trim()
  );

  for (const d of GATEWAY_DOMAINS) {
    if (generatedThisOpen >= GATEWAY_SUMMARY_MAX_PER_OPEN) {
      skipped.push(d.domain);
      continue;
    }

    if (!isAdmin) {
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
      const counted = await countAiRateLog(userId, windowStart, "gateway_summary");
      const maxAllowed = counted.purposeSupported
        ? RATE_LIMIT_MAX_GATEWAY_SUMMARY
        : RATE_LIMIT_MAX;
      if (counted.count != null && counted.count >= maxAllowed) {
        skipped.push(d.domain);
        continue;
      }
    }

    const sesRes = await sb
      .from("sense_sessions")
      .select("id, updated_at")
      .eq("user_id", userId)
      .eq("vertel_app", d.vertelApp)
      .order("updated_at", { ascending: false })
      .limit(GATEWAY_SUMMARY_MAX_SESSIONS);
    if (sesRes.error) {
      console.warn("sense_sessions lezen:", d.vertelApp, sesRes.error.message);
      skipped.push(d.domain);
      continue;
    }
    const appSessions = sesRes.data ?? [];
    const domainProps = confirmedProps.filter((r) =>
      String(r.target_domain || "") === d.domain
    );
    /* Neem Gateway-transcript mee als er bevestigde notities voor dit domein zijn. */
    const includeGateway = domainProps.length > 0;
    const sessions = includeGateway
      ? [...appSessions, ...gwSessions].slice(0, GATEWAY_SUMMARY_MAX_SESSIONS * 2)
      : appSessions;

    if (!sessions.length && !domainProps.length) {
      skipped.push(d.domain);
      continue;
    }

    const activityDates: string[] = [];
    for (const s of sessions) {
      if (s?.updated_at) activityDates.push(String(s.updated_at));
    }
    for (const p of domainProps) {
      if (p?.resolved_at) activityDates.push(String(p.resolved_at));
    }
    activityDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const lastActivity = activityDates[0] || "";
    const known = existing.get(d.domain);
    if (lastActivity && known && new Date(known) >= new Date(lastActivity)) {
      skipped.push(d.domain);
      continue;
    }

    const lines: string[] = [];
    let totalChars = 0;
    for (const p of domainProps.slice(0, 12)) {
      const dos = String(p.target_profile || "").trim();
      const txt = String(p.proposal_text || "").replace(/\s+/g, " ").trim()
        .slice(0, GATEWAY_SUMMARY_MSG_CHARS);
      const line = dos
        ? `Bevestigde notitie [${dos}]: ${txt}`
        : `Bevestigde notitie: ${txt}`;
      if (totalChars + line.length + 1 > GATEWAY_SUMMARY_TOTAL_CHARS) break;
      lines.push(line);
      totalChars += line.length + 1;
    }

    if (sessions.length) {
      const msgRes = await sb
        .from("sense_session_msgs")
        .select("role, content, created_at")
        .in("session_id", sessions.map((s) => s.id))
        .order("created_at", { ascending: false })
        .limit(GATEWAY_SUMMARY_MAX_MSGS);
      if (msgRes.error) {
        console.warn("sense_session_msgs lezen:", d.vertelApp, msgRes.error.message);
        if (!lines.length) {
          skipped.push(d.domain);
          continue;
        }
      } else {
        const chatLines: string[] = [];
        for (const m of msgRes.data ?? []) {
          const role = String(m.role ?? "") === "user" ? "Gebruiker" : "Sensei";
          const line = `${role}: ${
            String(m.content ?? "").replace(/\s+/g, " ").trim().slice(0, GATEWAY_SUMMARY_MSG_CHARS)
          }`;
          if (totalChars + line.length + 1 > GATEWAY_SUMMARY_TOTAL_CHARS) break;
          chatLines.push(line);
          totalChars += line.length + 1;
        }
        lines.push(...chatLines.reverse());
      }
    }

    if (!lines.length) {
      skipped.push(d.domain);
      continue;
    }
    const transcript = lines.join("\n");

    const text = await callAnthropicPlain(
      buildDomainSummarySystem(d.label),
      `Gespreksfragmenten en bevestigde notities (chronologisch waar van toepassing):\n${transcript}`,
      300,
    );
    if (!text) {
      skipped.push(d.domain);
      continue;
    }
    if (!isAdmin) logGatewaySummaryUsage(userId);

    const upRes = await sb.from("domain_summaries").upsert({
      user_id: userId,
      domain: d.domain,
      summary: text.slice(0, GATEWAY_SUMMARY_MAX_STORED_CHARS),
      source_updated_at: lastActivity || null,
      generated_at: new Date().toISOString(),
    }, { onConflict: "user_id,domain" });
    if (upRes.error) {
      console.warn("domain_summaries upsert:", d.domain, upRes.error.message);
      skipped.push(d.domain);
      continue;
    }
    updated.push(d.domain);
    generatedThisOpen += 1;
  }

  return json({ updated, skipped });
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

    const body = (await req.json()) as Record<string, unknown>;
    const isGateway = body?.gateway === true;
    const isOwnsenseHub = !isGateway &&
      (body?.ownsense_hub === true || body?.ownsense_insight === true);

    if (body?.gateway_summaries === true) {
      return await handleGatewaySummaries(userId, isAdmin);
    }

    if (!isAdmin) {
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
      const mode = isGateway ? "gateway" : (isOwnsenseHub ? "hub" : "general");
      const counted = await countAiRateLog(userId, windowStart, mode);
      const maxAllowed = counted.purposeSupported
        ? (isGateway
          ? RATE_LIMIT_MAX_GATEWAY
          : (isOwnsenseHub ? RATE_LIMIT_MAX_OWNSENSE_HUB : RATE_LIMIT_MAX))
        : RATE_LIMIT_MAX;
      if (counted.count != null && counted.count >= maxAllowed) {
        const label = isGateway
          ? "Sensei-berichten in de centrale Gateway-chat"
          : isOwnsenseHub
          ? "OWN Sense profiel-ai (inzichten en foto's)"
          : "Sensei-berichten in DateSense, FamilySense en SelfSense";
        return json({
          error: `Limiet bereikt: max ${maxAllowed} ${label} per uur. Probeer het later opnieuw.`,
          code: "AI_RATE_LIMIT",
        }, 429);
      }
    }

    let system = String(body?.system || "").trim();
    const maxTokens = Math.max(64, Math.min(2000, Number(body?.max_tokens || 800)));
    const model = String(body?.model || "claude-sonnet-4-6");
    const messagesRaw = Array.isArray(body?.messages) ? body.messages : [];
    if (!messagesRaw.length) return json({ error: "messages is required" }, 400);
    const messages: { role: string; content: unknown }[] = [];
    for (const m of messagesRaw) {
      if (!m || typeof m !== "object") continue;
      const rawRole = String((m as { role?: unknown }).role || "").toLowerCase();
      const role = rawRole === "user"
        ? "user"
        : (rawRole === "assistant" || rawRole === "ai" ? "assistant" : "");
      if (!role) continue;
      let content = (m as { content?: unknown }).content;
      if (content == null) continue;
      if (typeof content === "string") {
        content = content.replace(/\s+/g, " ").trim();
        if (!content) continue;
      } else if (Array.isArray(content)) {
        if (!content.length) continue;
      } else {
        content = String(content).replace(/\s+/g, " ").trim();
        if (!content) continue;
      }
      const prev = messages.length ? messages[messages.length - 1] : null;
      if (prev && prev.role === role && typeof prev.content === "string" && typeof content === "string") {
        if (prev.content === content) continue;
        prev.content = prev.content + "\n\n" + content;
        continue;
      }
      messages.push({ role, content });
    }
    while (messages.length && messages[0].role !== "user") messages.shift();
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

    if (!isAdmin) {
      const logRow: Record<string, unknown> = { user_id: userId };
      if (isGateway) logRow.purpose = "gateway";
      else if (isOwnsenseHub) logRow.purpose = "ownsense_hub";
      sb.from("ai_rate_log").insert(logRow).then(({ error: logError }) => {
        if (logError && (isOwnsenseHub || isGateway) && /purpose/i.test(String(logError.message || ""))) {
          sb.from("ai_rate_log").insert({ user_id: userId }).then(({ error: logError2 }) => {
            if (logError2) console.warn("Loggen mislukt:", logError2.message);
          });
        } else if (logError) {
          console.warn("Loggen mislukt:", logError.message);
        }
      });
    }

    return json(claudeData, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
