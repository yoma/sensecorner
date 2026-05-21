/**
 * WhatsApp (Twilio) webhook, zelfde naam-/roepnaamlogica als sensei-chat + Sense-apps.
 * Deploy als Edge Function (bv. whatsapp-webhook). Secrets: zie bestaande env-vars.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM") || "whatsapp:+14155238886";
const TWILIO_WEBHOOK_URL = Deno.env.get("TWILIO_WEBHOOK_URL") || "";
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const OWN_SENSE_BAD = /^own\s*sense$/i;

function norm(v: unknown) {
  return String(v || "").trim();
}

function normalizePhoneE164(raw: string) {
  let s = norm(raw);
  s = s.replace(/^whatsapp:/i, "");
  s = s.replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    if (s.startsWith("0")) s = "+32" + s.slice(1);
    else s = "+" + s;
  }
  s = "+" + s.slice(1).replace(/\D/g, "");
  return /^\+\d{8,15}$/.test(s) ? s : "";
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

type RateLimitCheck =
  | { ok: true }
  | { ok: false; code: "RATE_LIMITED" | "RATE_LIMIT_UNAVAILABLE"; reply: string };

async function countRecentAiRequests(userId: string, windowStart: string) {
  return await sb
    .from("ai_rate_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);
}

async function reserveAiRequestSlot(userId: string): Promise<RateLimitCheck> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
  const limitReply = `Je AI-limiet is bereikt: maximaal ${RATE_LIMIT_MAX} berichten per uur. Probeer het straks opnieuw.`;
  const unavailableReply = "Ik kan je AI-limiet nu niet veilig controleren. Probeer het straks opnieuw.";

  const before = await countRecentAiRequests(userId, windowStart);
  if (before.error) {
    console.warn("ai_rate_log count failed:", before.error.message);
    return { ok: false, code: "RATE_LIMIT_UNAVAILABLE", reply: unavailableReply };
  }
  if ((before.count ?? 0) >= RATE_LIMIT_MAX) {
    return { ok: false, code: "RATE_LIMITED", reply: limitReply };
  }

  const inserted = await sb.from("ai_rate_log").insert({ user_id: userId });
  if (inserted.error) {
    console.warn("ai_rate_log insert failed:", inserted.error.message);
    return { ok: false, code: "RATE_LIMIT_UNAVAILABLE", reply: unavailableReply };
  }

  const after = await countRecentAiRequests(userId, windowStart);
  if (after.error) {
    console.warn("ai_rate_log recount failed:", after.error.message);
    return { ok: false, code: "RATE_LIMIT_UNAVAILABLE", reply: unavailableReply };
  }
  if ((after.count ?? 0) > RATE_LIMIT_MAX) {
    return { ok: false, code: "RATE_LIMITED", reply: limitReply };
  }

  return { ok: true };
}

function readNestedString(obj: Record<string, unknown>, path: string[]) {
  let cur: unknown = obj;
  for (const p of path) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return "";
    cur = (cur as Record<string, unknown>)[p];
  }
  return norm(cur);
}

function emailLocalFromAddress(email: string): string {
  const e = norm(email).toLowerCase();
  const at = e.indexOf("@");
  return at > 0 ? e.slice(0, at) : "";
}

/**
 * Alleen voor **auth**-fallback: naam === mail-local én ziet er uit als technische slug (lang, cijfers, of lange run-on lowercase).
 * Korte echte voornaam (bv. «pascale» bij pascale@…) niet weggooien. OWN Sense **props** worden nooit door deze functie gehaald.
 */
function isLikelyAuthSlugVersusEmail(name: string, emailLocal: string): boolean {
  const raw = norm(name);
  const loc = emailLocal.toLowerCase().replace(/[\s._-]+/g, "");
  const n = raw.toLowerCase().replace(/[\s._-]+/g, "");
  if (!n || !loc || n !== loc) return false;
  if (/\d/.test(raw)) return true;
  if (n.length >= 10) return true;
  if (raw === raw.toLowerCase() && n.length >= 8) return true;
  return false;
}

/**
 * OWN Sense props: expliciet door de gebruiker / SenseCorner; nooit filteren op e-mail.
 * Geen `name`/`username` (vaak OAuth-slug).
 */
function extractPrimaryNameFromProps(propsRaw: unknown): string {
  const props = asObj(propsRaw);
  const paths = [
    ["roepnaam"],
    ["meta", "roepnaam"],
    ["display_name"],
    ["meta", "display_name"],
    ["full_name"],
    ["meta", "full_name"],
    ["profile", "display_name"],
    ["profile", "full_name"],
  ];
  for (const c of paths) {
    const v = readNestedString(props, c);
    if (!v || OWN_SENSE_BAD.test(v)) continue;
    return v;
  }
  return "";
}

/** Andere namen dan de primaire aanhef (voor system context). */
function collectNameAliasesFromProps(propsRaw: unknown, primary: string): string[] {
  const primaryLow = primary.toLowerCase();
  const props = asObj(propsRaw);
  const pm = props.meta && typeof props.meta === "object" ? (props.meta as Record<string, unknown>) : {};
  const keys: (string | undefined)[] = [
    norm(props.roepnaam),
    norm(pm.roepnaam),
    norm(props.display_name),
    norm(pm.display_name),
    norm(props.full_name),
    norm(pm.full_name),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    if (!k || OWN_SENSE_BAD.test(k)) continue;
    const low = k.toLowerCase();
    if (low === primaryLow) continue;
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(k);
  }
  return out.slice(0, 4);
}

function looksLikeWhoAmI(text: string) {
  const t = norm(text).toLowerCase();
  if (!t) return false;
  return (
    /wie\s+ben\s+ik/.test(t) ||
    /weet\s+je.*wie.*ik\s+ben/.test(t) ||
    /weet\s+je.*beter.*wie\s+ik\s+ben/.test(t) ||
    /wie\s+ik\s+ben/.test(t) ||
    /\bken\s+je\s+mij\b/.test(t) ||
    /\bken\s+jij\s+mij\b/.test(t) ||
    /welke\s+user\s+ben\s+ik/.test(t) ||
    /wie\s+benk/.test(t)
  );
}

function startsWithName(text: string, name: string) {
  const t = norm(text).toLowerCase();
  const n = norm(name).toLowerCase();
  if (!t || !n) return false;
  return t.startsWith(`hey ${n}`) || t.startsWith(`dag ${n}`) || t.startsWith(`${n},`) || t.startsWith(`${n} `);
}

function forceNameGreeting(reply: string, displayName: string) {
  const r = norm(reply);
  const n = norm(displayName);
  if (!r) return n ? `Hey ${n}, ik ben er voor je.` : "Hey, ik ben er voor je.";
  if (!n) return r;
  if (startsWithName(r, n)) return r;
  const first = (r.split(/\n/)[0] || r).toLowerCase();
  const nl = n.toLowerCase();
  if (nl && first.includes(nl)) {
    return r;
  }
  return `Hey ${n}, ${r}`;
}

/** Geen uitroepteken direct na de roepnaam; geen nutteloze trailing «OK». */
function polishWhatsappReply(reply: string, displayName: string): string {
  let r = norm(reply);
  const n = norm(displayName);
  if (n) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    r = r.replace(new RegExp(`(^|[\\s,.;:])(${esc})\\s*!`, "gi"), "$1$2,");
    r = r.replace(/,\s*,/g, ",").replace(/\s+,/g, ", ");
  }
  r = r.replace(/\s+OK\s*$/i, "").trim();
  r = r.replace(/\n+\s*OK\s*$/i, "").trim();
  r = r.trim();
  if (!r || /^ok(\.|!)?$/i.test(r)) return "";
  // Geen typografische gedachtestreep (voelt snel «AI»); komma leest natuurlijker in WhatsApp.
  r = r.replace(/\u2014/g, ", ");
  r = r.replace(/,\s*,/g, ",").replace(/\s+,/g, ", ");
  return r;
}

/** Twilio mag de response-body niet als chatbericht tonen (lege body, status 200). */
function twilioWebhookAck(): Response {
  return new Response("", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

type OwnSenseRow = {
  user_id: string;
  name: string;
  phone: string;
  props: unknown;
  last_active?: string | null;
};

type PhoneLookup =
  | { kind: "ok"; row: OwnSenseRow }
  | { kind: "none" }
  | { kind: "ambiguous"; count: number };

/**
 * Legacy: gsm stond op `sense_profiles` (OWN Sense). Meer dan één rij = datafout.
 */
async function findOwnUserByPhoneLegacy(userPhone: string): Promise<PhoneLookup> {
  let res = await sb
    .from("sense_profiles")
    .select("user_id,name,phone,props,last_active")
    .eq("phone", userPhone)
    .eq("name", "OWN Sense")
    .order("last_active", { ascending: false });

  if (res.error && /last_active|column/i.test(String(res.error.message))) {
    res = await sb.from("sense_profiles").select("user_id,name,phone,props").eq("phone", userPhone).eq("name", "OWN Sense");
  } else if (res.error) {
    throw new Error(`own profile lookup failed: ${res.error.message}`);
  }

  const data = res.data;
  if (!data?.length) return { kind: "none" };
  if (data.length > 1) {
    console.warn("whatsapp-webhook: multiple OWN Sense rows for phone", userPhone, data.length);
    return { kind: "ambiguous", count: data.length };
  }
  const row = data[0];
  if (!row?.user_id) return { kind: "none" };
  return { kind: "ok", row: row as OwnSenseRow };
}

/**
 * Eerst optioneel account-nummer (`account_phone`); daarna legacy `sense_profiles.phone`.
 */
async function findOwnUserByPhone(userPhone: string): Promise<PhoneLookup> {
  const ac = await sb.from("account_phone").select("user_id,phone").eq("phone", userPhone).maybeSingle();
  if (ac.error && !/No rows|not found|JSON object|0 rows/i.test(String(ac.error.message))) {
    throw new Error(`account_phone lookup failed: ${ac.error.message}`);
  }
  if (ac.data?.user_id) {
    let prof = await sb
      .from("sense_profiles")
      .select("user_id,name,phone,props,last_active")
      .eq("user_id", ac.data.user_id)
      .eq("name", "OWN Sense")
      .maybeSingle();
    if (prof.error && /last_active|column/i.test(String(prof.error.message))) {
      prof = await sb.from("sense_profiles").select("user_id,name,phone,props").eq("user_id", ac.data.user_id).eq("name", "OWN Sense").maybeSingle();
    } else if (prof.error) {
      throw new Error(`own profile lookup failed: ${prof.error.message}`);
    }
    const row = prof.data;
    return {
      kind: "ok",
      row: {
        user_id: ac.data.user_id,
        name: "OWN Sense",
        phone: userPhone,
        props: row?.props ?? {},
        last_active: row?.last_active ?? null,
      },
    };
  }
  return findOwnUserByPhoneLegacy(userPhone);
}

/**
 * Primaire aanhef, gelijk aan sensei-chat: OWN Sense props eerst, dan auth user_metadata.
 * Auth-metadata: alleen slug-achtige mail-handles weglaten, geen korte echte namen.
 */
async function resolveDisplayName(ownUser: { user_id?: string; props?: unknown; name?: string } | OwnSenseRow | null): Promise<{
  displayName: string;
  emailLocal: string;
}> {
  if (!ownUser?.user_id) return { displayName: "", emailLocal: "" };

  let emailLocal = "";
  let meta: Record<string, unknown> = {};
  try {
    const u = await sb.auth.admin.getUserById(ownUser.user_id);
    emailLocal = emailLocalFromAddress(String(u?.data?.user?.email ?? ""));
    meta = asObj(u?.data?.user?.user_metadata);
  } catch (_e) {
    /* ignore */
  }

  const propsName = extractPrimaryNameFromProps(ownUser?.props);
  if (propsName) return { displayName: propsName, emailLocal };

  const authCandidates = [
    norm(meta.roepnaam),
    norm(meta.display_name),
    norm(meta.full_name),
    norm(meta.first_name),
  ];
  for (const authName of authCandidates) {
    if (!authName || OWN_SENSE_BAD.test(authName)) continue;
    if (emailLocal && isLikelyAuthSlugVersusEmail(authName, emailLocal)) continue;
    return { displayName: authName, emailLocal };
  }

  const n = norm(ownUser?.name);
  if (n && !OWN_SENSE_BAD.test(n) && !(emailLocal && isLikelyAuthSlugVersusEmail(n, emailLocal))) {
    return { displayName: n, emailLocal };
  }

  return { displayName: "", emailLocal };
}

const DOSSIER_CTX_MAX = 15000;

function truncateCtx(s: string, max: number) {
  const t = norm(s);
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

function stripHtmlLite(s: string) {
  return norm(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Wie dit dossier beschrijft (naam, partner, …) uit props/meta, geen foto-analyse. */
function extractDossierWhoSummary(propsRaw: unknown): string {
  const props = asObj(propsRaw);
  const paths: string[][] = [
    ["roepnaam"],
    ["meta", "roepnaam"],
    ["display_name"],
    ["meta", "display_name"],
    ["full_name"],
    ["meta", "full_name"],
    ["persoon"],
    ["meta", "persoon"],
    ["partner"],
    ["meta", "partner"],
    ["partner_naam"],
    ["meta", "partner_naam"],
    ["wie_is"],
    ["meta", "wie_is"],
    ["bio"],
    ["meta", "bio"],
    ["omschrijving"],
    ["meta", "omschrijving"],
  ];
  const seen = new Set<string>();
  const bits: string[] = [];
  for (const p of paths) {
    const v = readNestedString(props, p);
    if (!v || OWN_SENSE_BAD.test(v)) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    bits.push(v);
  }
  return bits.length ? `Wie / over wie dit dossier gaat: ${bits.join(" · ")}` : "";
}

/** OWN Sense `props.categories` + antwoorden als leesbare brok (geen app-labels vereist). */
function summarizePropsCategories(propsRaw: unknown, maxLen: number) {
  const props = asObj(propsRaw);
  const cats = props.categories;
  if (!cats || typeof cats !== "object" || Array.isArray(cats)) return "";
  const lines: string[] = [];
  for (const [catId, raw] of Object.entries(cats as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    const bits: string[] = [];
    for (const k of ["a0", "a1", "a2", "a3", "a4"]) {
      const v = norm(o[k]);
      if (v) bits.push(v);
    }
    if (bits.length) lines.push(`${catId}: ${bits.join(" | ")}`);
  }
  return truncateCtx(lines.join("\n"), maxLen);
}

function timelineRoleLabel(roleRaw: string): string {
  const x = norm(roleRaw).toLowerCase();
  if (x === "user") return "jij";
  if (x === "ai" || x === "assistant") return "ai";
  return x || "?";
}

/**
 * Laatste regels van de tijdlijn (alle dossiers / apps), zelfde bron als de tijdlijn-tab.
 * Chronologisch oud→nieuw zodat de slotregels het meest recente zijn.
 */
async function loadLatestTimelineTailBrief(userId: string): Promise<string> {
  const res = await sb
    .from("sense_messages")
    .select("role,html,profile_name,dossier,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(55);
  if (res.error) {
    console.warn("whatsapp-webhook timeline", res.error.message);
    return "";
  }
  const rows = (res.data || []) as Array<{
    role?: string;
    html?: string;
    profile_name?: string;
    dossier?: string;
    created_at?: string;
  }>;
  rows.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const tail = rows.slice(-28);
  const n = tail.length;
  const lines = tail.map((r, i) => {
    const tag = norm(r.profile_name) || norm(r.dossier) || "?";
    const who = timelineRoleLabel(String(r.role || ""));
    const isLast = i >= n - 6;
    const maxBody = isLast ? 920 : 560;
    const body = truncateCtx(stripHtmlLite(String(r.html || "")), maxBody);
    if (!body) return "";
    const stamp = isLast && r.created_at
      ? ` (${String(r.created_at).slice(0, 16).replace("T", " ")})`
      : "";
    return `[${tag}] ${who}:${stamp} ${body}`;
  }).filter(Boolean);
  return truncateCtx(lines.join("\n"), 9800);
}

/** Laatste AI-antwoorden = meest recente «advies» per app/dossier. */
async function loadLastAssistantAdviceBrief(userId: string): Promise<string> {
  const res = await sb
    .from("sense_messages")
    .select("html,profile_name,dossier,created_at")
    .eq("user_id", userId)
    .in("role", ["assistant", "ai"])
    .order("created_at", { ascending: false })
    .limit(16);
  if (res.error) {
    console.warn("whatsapp-webhook assistant msgs", res.error.message);
    return "";
  }
  const rows = (res.data || []) as Array<{ html?: string; profile_name?: string; dossier?: string; created_at?: string }>;
  rows.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const lines = rows.map((r) => {
    const tag = norm(r.profile_name) || norm(r.dossier) || "?";
    const body = truncateCtx(stripHtmlLite(String(r.html || "")), 420);
    return body ? `[${tag}] ${body}` : "";
  }).filter(Boolean);
  return truncateCtx(lines.join("\n"), 5200);
}

/**
 * Compact dossier voor WhatsApp: wie/summary/advies (geen foto-analyse).
 */
async function loadDossierContextForWhatsapp(userId: string): Promise<string> {
  let prof = await sb
    .from("sense_profiles")
    .select("props,summary,insight_all,insight_ds,insight_fs,insight_ss,insight_gen")
    .eq("user_id", userId)
    .eq("name", "OWN Sense")
    .maybeSingle();
  if (prof.error && /summary|column|does not exist/i.test(String(prof.error.message))) {
    prof = await sb
      .from("sense_profiles")
      .select("props,insight_all,insight_ds,insight_fs,insight_ss,insight_gen")
      .eq("user_id", userId)
      .eq("name", "OWN Sense")
      .maybeSingle();
  }
  if (prof.error && /column|does not exist/i.test(String(prof.error.message))) {
    prof = await sb.from("sense_profiles").select("props").eq("user_id", userId).eq("name", "OWN Sense").maybeSingle();
  } else if (prof.error) {
    console.warn("whatsapp-webhook dossier profile", prof.error.message);
  }
  const row = prof.error ? null : (prof.data as Record<string, unknown> | null);

  const blocks: string[] = [];
  if (prof.error) {
    blocks.push(`OWN Sense: laden mislukt (${truncateCtx(prof.error.message, 120)}).`);
  } else if (row) {
    const who = extractDossierWhoSummary(row.props);
    if (who) blocks.push(`OWN Sense: wie jij bent in de apps\n${who}`);
    const summ = truncateCtx(String(row.summary || ""), 1600);
    if (summ) blocks.push(`OWN Sense: korte samenvatting (uit app)\n${summ}`);
    for (const [label, key] of [
      ["Laatste bredere inzichten / advies (cross-app)", "insight_all"],
      ["Inzicht / advies (DateSense)", "insight_ds"],
      ["Inzicht / advies (FamilySense)", "insight_fs"],
      ["Inzicht / advies (SelfSense)", "insight_ss"],
      ["Inzicht / advies (algemeen)", "insight_gen"],
    ] as const) {
      const v = truncateCtx(String(row[key] || ""), 2600);
      if (v) blocks.push(`OWN Sense: ${label}\n${v}`);
    }
    const cat = summarizePropsCategories(row.props, 2200);
    if (cat) blocks.push("OWN Sense: vragenlijstantwoorden (aanvulling)\n" + cat);
  } else {
    blocks.push("OWN Sense: nog geen profielrij in de database (andere dossiers/chat kunnen hieronder wel staan).");
  }

  try {
    let others = await sb
      .from("sense_profiles")
      .select("name,props,summary")
      .eq("user_id", userId)
      .neq("name", "OWN Sense")
      .limit(8);
    if (others.error && /summary|column|does not exist/i.test(String(others.error.message))) {
      others = await sb.from("sense_profiles").select("name,props").eq("user_id", userId).neq("name", "OWN Sense").limit(8);
    }
    if (!others.error && others.data?.length) {
      for (const o of others.data as Array<{ name?: string; props?: unknown; summary?: string }>) {
        const nm = norm(o.name);
        if (!nm) continue;
        const bits: string[] = [];
        const who = extractDossierWhoSummary(o.props);
        if (who) bits.push(who);
        const summ = truncateCtx(String(o.summary || ""), 1400);
        if (summ) bits.push("Samenvatting (uit app): " + summ);
        const sc = summarizePropsCategories(o.props, 900);
        if (sc) bits.push("Vragenlijst / notities:\n" + sc);
        const inner = bits.length ? bits.join("\n\n") : "(nog weinig gestructureerde tekst in dit dossier)";
        blocks.push(`Dossier «${nm}»\n${truncateCtx(inner, 2000)}`);
      }
    }
  } catch (_e) {
    /* ignore */
  }

  try {
    const adv = await loadLastAssistantAdviceBrief(userId);
    if (adv) blocks.push("Laatste AI-adviezen (extra selectie; chronologisch)\n" + adv);
  } catch (_e) {
    /* ignore */
  }

  try {
    const tl = await loadLatestTimelineTailBrief(userId);
    if (tl) {
      blocks.push(
        "Laatste zinnen van de tijdlijn (alle dossiers; oud naar nieuw, onderaan het meest recent)\n" +
          "Deze regels zijn minstens zo belangrijk als samenvattingen: hier zit vaak de actuele toestand in.\n" +
          tl,
      );
    }
  } catch (_e) {
    /* ignore */
  }

  const out = blocks.join("\n\n");
  return truncateCtx(out, DOSSIER_CTX_MAX);
}

const DEFAULT_WHATSAPP_MIRROR_DOSSIER = "OWN Sense";

function escapeHtmlPlain(s: string) {
  return norm(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeMirrorDossierName(raw: string): string {
  const x = norm(raw).replace(/[\n\r\0\u000b]/g, "").slice(0, 80);
  return x || DEFAULT_WHATSAPP_MIRROR_DOSSIER;
}

type AccountPhoneMirrorRow = {
  phone: string | null;
  whatsapp_mirror_dossier: string | null;
  whatsapp_mirror_offer_dossier: string | null;
};

function isShortAffirmativeReply(text: string): boolean {
  const t = norm(text).toLowerCase();
  return /^(ja|jawel|jazeker|jaja|ok|oke|okay|prima|doe maar|akkoord|goed|yes|yep|tuurlijk|natuurlijk)\s*(!|\.|\?)?$/i.test(t);
}

function isShortNegativeReply(text: string): boolean {
  const t = norm(text).toLowerCase();
  return /^(nee|neen|nope|liever niet|niet nodig|nog niet|laat maar|toch niet)\s*(!|\.|\?)?$/i.test(t);
}

async function senseProfileNameExists(userId: string, name: string): Promise<boolean> {
  const n = sanitizeMirrorDossierName(name);
  const hit = await sb.from("sense_profiles").select("name").eq("user_id", userId).eq("name", n).maybeSingle();
  return !hit.error && !!hit.data?.name;
}

/** Woorden uit bericht (lowercase) voor voornaam-roepvarianten. */
function tokenizeWordsForProfileMatch(msg: string): string[] {
  const lowered = norm(msg).toLowerCase();
  return lowered.split(/[^a-zà-öø-ÿ0-9]+/).filter((w) => w.length >= 2);
}

/** Eén contactdossier uit bericht (bv. «pascale» / «pascal» → PascaleSense); bij twijfel null. */
async function inferNamedContactDossierFromMessage(userId: string, msg: string): Promise<string | null> {
  const res = await sb.from("sense_profiles").select("name").eq("user_id", userId);
  if (res.error) return null;
  const names = (res.data || []).map((r: { name?: string }) => norm(r.name)).filter(Boolean);
  const block = new Set(["OWN Sense", "WhatsApp"]);
  const lowered = norm(msg).toLowerCase();
  const words = tokenizeWordsForProfileMatch(msg);
  const matches: string[] = [];
  for (const n of names) {
    if (block.has(n)) continue;
    const nl = n.toLowerCase();
    if (lowered.includes(nl)) {
      matches.push(n);
      continue;
    }
    const stem = nl.replace(/sense$/i, "").replace(/[^a-zà-öø-ÿ0-9]/gi, "");
    if (stem.length < 3) continue;
    if (lowered.includes(stem)) {
      matches.push(n);
      continue;
    }
    // Roep-/typfoutvarianten: «pascal» t.o.v. stem «pascale», korte voornaam vs langere stem, enz.
    for (const w of words) {
      if (w.length < 4) continue;
      if (w === stem) {
        matches.push(n);
        break;
      }
      if (stem.startsWith(w)) {
        matches.push(n);
        break;
      }
      if (w.startsWith(stem) && stem.length >= 4) {
        matches.push(n);
        break;
      }
    }
  }
  const uniq = [...new Set(matches)];
  if (uniq.length === 1) return uniq[0];
  return null;
}

async function listContactDossierNames(userId: string): Promise<string[]> {
  const res = await sb.from("sense_profiles").select("name").eq("user_id", userId);
  if (res.error) return [];
  return (res.data || [])
    .map((r: { name?: string }) => norm(r.name))
    .filter((n) => !!n && !/^own\s*sense$/i.test(n) && !/^whatsapp$/i.test(n))
    .slice(0, 8);
}

function looksLikeDirectDossierChoice(msg: string): boolean {
  const t = norm(msg).toLowerCase();
  if (!t) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 3) return true;
  if (t.length <= 70 && /\b(dossier|onder|in|voor)\b/.test(t)) return true;
  return false;
}

async function getLastAssistantAppContext(userPhone: string): Promise<string> {
  const res = await sb
    .from("whatsapp_messages")
    .select("app_context")
    .eq("user_phone", userPhone)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) return "";
  return norm((res.data as { app_context?: string } | null)?.app_context);
}

async function resolveDossierChoiceFromMessage(userId: string, msg: string): Promise<string | null> {
  const dossiers = await listContactDossierNames(userId);
  if (!dossiers.length) return null;
  const lowered = norm(msg).toLowerCase();
  const words = tokenizeWordsForProfileMatch(msg);
  const hits: string[] = [];
  for (const dn of dossiers) {
    const nl = dn.toLowerCase();
    if (lowered.includes(nl)) {
      hits.push(dn);
      continue;
    }
    const stem = nl.replace(/sense$/i, "").replace(/[^a-zà-öø-ÿ0-9]/gi, "");
    if (stem.length >= 3 && lowered.includes(stem)) {
      hits.push(dn);
      continue;
    }
    for (const w of words) {
      if (w.length < 4) continue;
      if (w === stem || stem.startsWith(w) || w.startsWith(stem)) {
        hits.push(dn);
        break;
      }
    }
  }
  const uniq = [...new Set(hits)];
  if (uniq.length === 1) return uniq[0];
  return null;
}

async function getAccountPhoneMirrorRow(userId: string): Promise<AccountPhoneMirrorRow | null> {
  let sel = await sb
    .from("account_phone")
    .select("phone,whatsapp_mirror_dossier,whatsapp_mirror_offer_dossier")
    .eq("user_id", userId)
    .maybeSingle();
  if (sel.error && /whatsapp_mirror_offer_dossier|column|does not exist/i.test(String(sel.error.message || ""))) {
    sel = await sb.from("account_phone").select("phone,whatsapp_mirror_dossier").eq("user_id", userId).maybeSingle();
  } else if (sel.error && !/No rows|not found|JSON object|0 rows|PGRST116/i.test(String(sel.error.message || ""))) {
    console.warn("account_phone read", sel.error.message);
    return null;
  }
  const d = sel.data as Record<string, unknown> | null;
  if (!d) return null;
  return {
    phone: d.phone != null ? String(d.phone) : null,
    whatsapp_mirror_dossier: d.whatsapp_mirror_dossier != null ? String(d.whatsapp_mirror_dossier) : null,
    whatsapp_mirror_offer_dossier: d.whatsapp_mirror_offer_dossier != null ? String(d.whatsapp_mirror_offer_dossier) : null,
  };
}

async function mergeAccountPhoneMirrorPatch(
  userId: string,
  patch: Partial<{ phone: string | null; whatsapp_mirror_dossier: string; whatsapp_mirror_offer_dossier: string | null }>,
): Promise<void> {
  const cur = await getAccountPhoneMirrorRow(userId);
  const iso = new Date().toISOString();
  const mergedDossier = patch.whatsapp_mirror_dossier !== undefined
    ? patch.whatsapp_mirror_dossier
    : (cur?.whatsapp_mirror_dossier != null && norm(cur.whatsapp_mirror_dossier))
    ? sanitizeMirrorDossierName(cur.whatsapp_mirror_dossier)
    : DEFAULT_WHATSAPP_MIRROR_DOSSIER;
  const row: Record<string, unknown> = {
    user_id: userId,
    updated_at: iso,
    phone: patch.phone !== undefined ? patch.phone : (cur?.phone ?? null),
    whatsapp_mirror_dossier: mergedDossier,
    whatsapp_mirror_offer_dossier: patch.whatsapp_mirror_offer_dossier !== undefined
      ? patch.whatsapp_mirror_offer_dossier
      : (cur?.whatsapp_mirror_offer_dossier ?? null),
  };
  let up = await sb.from("account_phone").upsert(row as never, { onConflict: "user_id" });
  if (up.error && /whatsapp_mirror_offer_dossier|column|does not exist/i.test(String(up.error.message || ""))) {
    delete row.whatsapp_mirror_offer_dossier;
    up = await sb.from("account_phone").upsert(row as never, { onConflict: "user_id" });
  }
  if (up.error) console.warn("account_phone merge", up.error.message);
}

/**
 * Dossiernaam uit account_phone.whatsapp_mirror_dossier, alleen als er een `sense_profiles`-rij voor die user bestaat.
 * Anders OWN Sense, anders eerste beschikbaar dossier.
 */
async function resolveWhatsappMirrorDossier(userId: string): Promise<string> {
  let want = DEFAULT_WHATSAPP_MIRROR_DOSSIER;
  const ac = await sb.from("account_phone").select("whatsapp_mirror_dossier").eq("user_id", userId).maybeSingle();
  if (ac.error && !/column|does not exist|No rows|not found|JSON object|0 rows|PGRST116/i.test(String(ac.error.message || ""))) {
    console.warn("whatsapp mirror dossier read", ac.error.message);
  } else if (!ac.error && ac.data) {
    const w = sanitizeMirrorDossierName(String((ac.data as { whatsapp_mirror_dossier?: string }).whatsapp_mirror_dossier || ""));
    if (w) want = w;
  }
  const hit = await sb.from("sense_profiles").select("name").eq("user_id", userId).eq("name", want).maybeSingle();
  if (!hit.error && hit.data?.name) return want;
  const own = await sb.from("sense_profiles").select("name").eq("user_id", userId).eq("name", DEFAULT_WHATSAPP_MIRROR_DOSSIER).maybeSingle();
  if (!own.error && own.data?.name) return DEFAULT_WHATSAPP_MIRROR_DOSSIER;
  const any = await sb.from("sense_profiles").select("name").eq("user_id", userId).limit(1).maybeSingle();
  if (!any.error && any.data?.name) return String(any.data.name);
  return DEFAULT_WHATSAPP_MIRROR_DOSSIER;
}

/**
 * Spiegel naar `sense_messages` onder het gekozen dossier (profile_name = echte dossiernaam in de app).
 */
async function mirrorWhatsappToSenseTimeline(
  userId: string,
  role: "user" | "assistant",
  text: string,
  dossierName: string,
) {
  const t = norm(text);
  const dn = sanitizeMirrorDossierName(dossierName);
  if (!userId || !t) return;
  const timelineRole = role === "assistant" ? "ai" : "user";
  const html = `<p data-origin="whatsapp">${escapeHtmlPlain(t)}</p>`;
  const base = {
    user_id: userId,
    profile_name: dn,
    role: timelineRole,
    html,
  };
  let ins = await sb.from("sense_messages").insert({ ...base, dossier: dn });
  if (ins.error && /dossier|column|does not exist/i.test(String(ins.error.message))) {
    ins = await sb.from("sense_messages").insert(base);
  }
  if (ins.error) console.warn("whatsapp timeline mirror", ins.error.message);
}

async function saveMsg(
  userPhone: string,
  role: "user" | "assistant",
  content: string,
  appContext?: string | null,
  dossierName?: string | null,
) {
  const { error } = await sb.from("whatsapp_messages").insert({
    user_phone: userPhone,
    role,
    content,
    app_context: appContext ?? null,
    dossier_name: dossierName ?? null,
  });
  if (error) throw new Error(`save whatsapp_messages failed: ${error.message}`);
}

async function getHistory(userPhone: string) {
  const { data, error } = await sb
    .from("whatsapp_messages")
    .select("role,content")
    .eq("user_phone", userPhone)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) throw new Error(`history load failed: ${error.message}`);

  return (data || [])
    .reverse()
    .map((r: { role?: string; content?: string }) => ({
      role: r.role === "assistant" ? "assistant" as const : "user" as const,
      content: String(r.content || ""),
    }))
    .filter((m) => {
      const c = norm(m.content);
      if (!c) return false;
      if (m.role === "assistant" && /^ok\.?$/i.test(c)) return false;
      return true;
    });
}

type TwilioSendResult = { ok: true } | { ok: false; status: number; code?: number; message: string };

/** Verstuurt via Twilio; faalt zonder throw (webhook blijft 200, DB/spiegel blijft consistent). */
async function sendTwilio(to: string, body: string): Promise<TwilioSendResult> {
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      },
      body: new URLSearchParams({
        From: TWILIO_FROM,
        To: to,
        Body: body,
      }),
    });

    let j: Record<string, unknown> = {};
    try {
      j = (await r.json()) as Record<string, unknown>;
    } catch {
      console.warn("Twilio send: geen JSON-antwoord", r.status);
    }

    if (!r.ok) {
      const code = typeof j.code === "number" ? j.code : undefined;
      const msg = norm(j.message) || JSON.stringify(j);
      console.warn("Twilio send failed", { status: r.status, code, message: msg });
      return { ok: false, status: r.status, code, message: msg };
    }
    return { ok: true };
  } catch (e) {
    console.warn("Twilio send network error", e);
    return { ok: false, status: 0, message: norm(e instanceof Error ? e.message : e) };
  }
}

async function callClaude(system: string, messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system,
      messages,
    }),
  });

  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Claude call failed");
  return norm(j?.content?.[0]?.text || "") || "Ik kon je bericht even niet verwerken. Probeer nog eens.";
}

async function verifyTwilioSignature(req: Request, params: URLSearchParams): Promise<boolean> {
  if (!TWILIO_AUTH_TOKEN) return false;
  const signature = req.headers.get("X-Twilio-Signature") || "";
  if (!signature) return false;
  const url = TWILIO_WEBHOOK_URL || req.url;
  const sortedKeys = [...params.keys()].sort();
  let s = url;
  for (const k of sortedKeys) s += k + (params.get(k) ?? "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(TWILIO_AUTH_TOKEN),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(s));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return signature === expected;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const formData = await req.formData();
    const params = new URLSearchParams();
    for (const [k, v] of formData.entries()) params.append(k, String(v));

    if (!await verifyTwilioSignature(req, params)) {
      return new Response("Forbidden", { status: 403 });
    }

    const fromRaw = norm(formData.get("From"));
    const body = norm(formData.get("Body"));

    if (!body) return twilioWebhookAck();

    const userPhone = normalizePhoneE164(fromRaw);
    if (!userPhone) return twilioWebhookAck();

    await saveMsg(userPhone, "user", body);

    const lookup = await findOwnUserByPhone(userPhone);
    if (lookup.kind === "ambiguous") {
      const reply =
        "Dit WhatsApp-nummer staat op meer dan één oud OWN Sense-profiel in de database (legacy `sense_profiles.phone`). " +
        "Ik mag dan niet raden wie je bent. Laat een beheerder de dubbele koppeling opruimen. " +
        "Nieuwe koppeling: zet je gsm in SenseCorner onder account (optioneel voor WhatsApp).";
      await saveMsg(userPhone, "assistant", reply);
      await sendTwilio(fromRaw, reply);
      return twilioWebhookAck();
    }

    const ownUser = lookup.kind === "ok" ? lookup.row : null;
    let waMirrorDossier = "";
    let mirrorConsentHint = "";
    let consentMandatoryPrefix = "";
    if (ownUser?.user_id) {
      const uid = ownUser.user_id;
      const acRow = await getAccountPhoneMirrorRow(uid);
      let consentedMirrorThisTurn = false;

      if (isShortAffirmativeReply(body) && norm(acRow?.whatsapp_mirror_offer_dossier || "")) {
        const target = sanitizeMirrorDossierName(String(acRow!.whatsapp_mirror_offer_dossier));
        if (await senseProfileNameExists(uid, target)) {
          await mergeAccountPhoneMirrorPatch(uid, {
            whatsapp_mirror_dossier: target,
            whatsapp_mirror_offer_dossier: null,
          });
          consentedMirrorThisTurn = true;
        }
      } else if (isShortNegativeReply(body) && norm(acRow?.whatsapp_mirror_offer_dossier || "")) {
        await mergeAccountPhoneMirrorPatch(uid, { whatsapp_mirror_offer_dossier: null });
      }

      waMirrorDossier = await resolveWhatsappMirrorDossier(uid);

      const lastAssistantCtx = await getLastAssistantAppContext(userPhone);
      const awaitingDossierChoice = lastAssistantCtx === "dossier_select_prompt";
      if (awaitingDossierChoice && !isShortAffirmativeReply(body) && !isShortNegativeReply(body)) {
        const chosen = await resolveDossierChoiceFromMessage(uid, body);
        if (chosen) {
          await mergeAccountPhoneMirrorPatch(uid, {
            whatsapp_mirror_dossier: chosen,
            whatsapp_mirror_offer_dossier: null,
          });
          waMirrorDossier = chosen;
          await mirrorWhatsappToSenseTimeline(uid, "user", body, waMirrorDossier);
          const okReply = `Top, ik zet dit gesprek nu onder «${waMirrorDossier}». Stuur gerust verder.`;
          await saveMsg(userPhone, "assistant", okReply, "dossier_select_confirm", waMirrorDossier);
          await mirrorWhatsappToSenseTimeline(uid, "assistant", okReply, waMirrorDossier);
          await sendTwilio(fromRaw, okReply);
          return twilioWebhookAck();
        }
        const opts = await listContactDossierNames(uid);
        const optLine = opts.length
          ? `Kies er eentje: ${opts.join(", ")}.`
          : "Noem de dossiernaam exact zoals die in je app staat.";
        const reprompt = `Kleine check: onder welk dossier wil je dat ik dit gesprek opsla? ${optLine}`;
        await mirrorWhatsappToSenseTimeline(uid, "user", body, waMirrorDossier);
        await saveMsg(userPhone, "assistant", reprompt, "dossier_select_prompt", waMirrorDossier);
        await mirrorWhatsappToSenseTimeline(uid, "assistant", reprompt, waMirrorDossier);
        await sendTwilio(fromRaw, reprompt);
        return twilioWebhookAck();
      }

      if (!consentedMirrorThisTurn && !isShortAffirmativeReply(body) && !isShortNegativeReply(body)) {
        const inferredForConsent = await inferNamedContactDossierFromMessage(uid, body);
        if (inferredForConsent && inferredForConsent !== waMirrorDossier) {
          const prevOffer = norm(acRow?.whatsapp_mirror_offer_dossier || "");
          if (prevOffer !== inferredForConsent) {
            await mergeAccountPhoneMirrorPatch(uid, { whatsapp_mirror_offer_dossier: inferredForConsent });
          }
        } else if (inferredForConsent && inferredForConsent === waMirrorDossier) {
          await mergeAccountPhoneMirrorPatch(uid, { whatsapp_mirror_offer_dossier: null });
        } else if (!inferredForConsent) {
          const pending = norm(acRow?.whatsapp_mirror_offer_dossier || "");
          if (!pending && waMirrorDossier === DEFAULT_WHATSAPP_MIRROR_DOSSIER && !looksLikeDirectDossierChoice(body)) {
            const opts = await listContactDossierNames(uid);
            if (opts.length) {
              const ask = `Kleine check: over welk dossier gaat dit nu het meest? Kies er eentje: ${opts.join(", ")}.`;
              await mirrorWhatsappToSenseTimeline(uid, "user", body, waMirrorDossier);
              await saveMsg(userPhone, "assistant", ask, "dossier_select_prompt", waMirrorDossier);
              await mirrorWhatsappToSenseTimeline(uid, "assistant", ask, waMirrorDossier);
              await sendTwilio(fromRaw, ask);
              return twilioWebhookAck();
            }
          }
        }
      }

      const acFresh = await getAccountPhoneMirrorRow(uid);
      const pendingOffer = norm(acFresh?.whatsapp_mirror_offer_dossier || "");
      if (pendingOffer && pendingOffer !== waMirrorDossier) {
        consentMandatoryPrefix =
          `>>> TOESTEMMING: hoogste prioriteit in dit antwoord\n` +
          `Jullie praten over iemand met Sense-dossier «${pendingOffer}». Tot de gebruiker een kort «ja» stuurt, blijft de server WhatsApp spiegelen onder «${waMirrorDossier}».\n` +
          `Je MOET in dit antwoord (niet uitstellen, niet pas als ze zelf over «opslaan» of «dossier» vraagt) één warme zin opnemen die expliciet vraagt of het oké is om jullie gesprek verder onder «${pendingOffer}» te bewaren tot nader order.\n` +
          `Normaal max. 3 zinnen; nu max. 4 korte zinnen zodat inhoud + die vraag past. Geen kil app-/database-/handleidingstaal. Bij «nee» later: respectvol laten rusten.\n\n`;
        mirrorConsentHint =
          `\n\n(Zie blok hierboven: toestemming staat centraal.) Achtergrond: bij «ja» in een volgend kort bericht zet de server de koppeling zelf goed. Leg dat niet uit als stappenplan.`;
      }

      await mirrorWhatsappToSenseTimeline(uid, "user", body, waMirrorDossier);
    }
    const { displayName, emailLocal } = await resolveDisplayName(ownUser);
    const nameAliases = ownUser?.props
      ? collectNameAliasesFromProps(ownUser.props, displayName)
      : [];
    const aliasHint = nameAliases.length
      ? ` De gebruiker wordt ook wel genoemd als: ${nameAliases.join(", ")} (zelfde persoon; gebruik vooral de primaire naam voor de aanhef).`
      : "";

    const dossierBrief = ownUser?.user_id ? await loadDossierContextForWhatsapp(ownUser.user_id) : "";

    if (looksLikeWhoAmI(body)) {
      let reply = "";
      if (ownUser?.user_id) {
        if (displayName) {
          reply = `Hey ${displayName}, ik herken je account via dit WhatsApp-nummer. Je bent correct gekoppeld in SenseCorner.`;
        } else {
          reply =
            "Hey, ik herken je account via dit WhatsApp-nummer, maar ik zie nog geen duidelijke naam om je persoonlijk aan te spreken.";
        }
        if (dossierBrief.length > 80) {
          reply += " Ik laad ook je OWN Sense-dossier (vragen, inzichten, recente gesprekken) voor de volgende berichten. Vraag gerust door over inhoud.";
        } else if (dossierBrief.length) {
          reply += " Er staat al wat OWN Sense-info klaar; voor meer detail kun je je dossier in de app verder aanvullen.";
        } else {
          reply += " Ik zie nog weinig ingevuld OWN Sense-dossier; vul OWN Sense aan voor rijkere context.";
        }
      } else {
        reply =
          "Hey, ik vind nog geen gekoppeld account-nummer op dit telefoonnummer. " +
          "Zet je gsm optioneel in SenseCorner bij je account (WhatsApp), dan herken ik je meteen.";
      }

      await saveMsg(userPhone, "assistant", reply);
      if (ownUser?.user_id) await mirrorWhatsappToSenseTimeline(ownUser.user_id, "assistant", reply, waMirrorDossier);
      await sendTwilio(fromRaw, reply);
      return twilioWebhookAck();
    }

    const history = await getHistory(userPhone);
    const knownDossiers = ownUser?.user_id ? await listContactDossierNames(ownUser.user_id) : [];
    const knownDossiersLine = knownDossiers.length
      ? `Bekende contactdossiers voor deze gebruiker: ${knownDossiers.join(", ")}.`
      : "";

    let system = "";
    if (ownUser?.user_id) {
      const mirrorLabel = waMirrorDossier || DEFAULT_WHATSAPP_MIRROR_DOSSIER;
      const whatsappDossierScope =
        `WhatsApp-kanaal: berichten komen in de app-tijdlijn onder «${mirrorLabel}» (standaard instelbaar in SenseCorner). ` +
        "Als het duidelijk over één ander contactdossier gaat en dat nog niet jullie actieve koppeling is, volgt een warme toestemmingsvraag; bij een kort ja/nee daarop past de koppeling mee. Leg dat nooit uit als een handleiding. ";
      const dossierBlock = dossierBrief
        ? `\n\n--- Dossier(s) uit database (wie/summary/advies; ingekort) ---\n${dossierBrief}\n--- Einde dossier ---\n` +
          whatsappDossierScope +
          mirrorConsentHint +
          "Intern: wie, samenvattingen, adviezen en vooral de onderste regels van de tijdlijn zijn het meest actueel; negeer uiterlijk/foto. " +
          "Tegen de gebruiker: spreek nooit over «dossierblok», «database», «wat je in de app invult is wat ik zie» of vergelijkbare systeem-meta. Dat voelt kil. " +
          (knownDossiersLine ? (knownDossiersLine + " ") : "") +
          "Als de gebruiker een naam of dossier noemt dat in de bekende contactdossiers staat, zeg dan nooit dat je die persoon niet kent. " +
          "Als er weinig details zijn, zeg warm dat het dossier wel bestaat maar context nog dun is, en stel precies 1 gerichte vervolgvraag. " +
          "Als dezelfde naam mogelijk bij meerdere contexten past, vraag eerst kort om verduidelijking over wie het gaat. " +
          "Als je iemand weinig kent uit de context: zeg het warm en nieuwsgierig (bv. dat je Pascale graag beter zou leren kennen) en nodig uit om in eigen woorden te vertellen. Eén open vraag, geen technische verantwoording. " +
          "Verzin geen feiten over mensen; twijfel = zacht uitspreken zonder juridische of IT-toon. " +
          "Sluit nooit af met alleen «OK» of «Ok». Geen uitroepteken direct na de roepnaam van de gebruiker (dus niet «Yourieie!» maar «Yourieie,» of zonder leesteken). " +
          "Gebruik geen lange gedachtestreep tussen woorden; liever een komma of punt."
        : `\n\n(Er is nog weinig dossiertekst voor dit account, wees voorzichtig met aannames.)\n${whatsappDossierScope}${mirrorConsentHint}`;
      system =
        consentMandatoryPrefix +
        "Je bent Sensei. Laat je horen als een wijze, warme vriend: goed luisteren, zachte humor mag, geen helpdesk- of systeemtaal. Nederlands" +
        (consentMandatoryPrefix ? ", maximaal 4 korte zinnen in dit antwoord (toestemming)." : ", maximaal 3 zinnen.") +
        " " +
        "Verzin geen feiten over mensen of situaties. " +
        (displayName
          ? `Primaire aanhef (roepnaam): ${displayName}.${aliasHint} ` +
            "Gebruik die naam natuurlijk; niet dubbel in dezelfde zin forceren."
          : "Gebruik een warme neutrale aanspreking zonder naam.") +
        dossierBlock;
    } else {
      system =
        "Je bent Sensei, warme coach in het Nederlands. Max 3 zinnen. " +
        "Zeg vriendelijk dat er nog geen gekoppeld account-nummer is op dit telefoonnummer " +
        "en vraag om het optioneel te zetten in SenseCorner bij het account (WhatsApp), niet in het OWN Sense-dossier.";
    }

    if (ownUser?.user_id) {
      const quota = await reserveAiRequestSlot(ownUser.user_id);
      if (!quota.ok) {
        await saveMsg(userPhone, "assistant", quota.reply, quota.code.toLowerCase(), waMirrorDossier);
        await mirrorWhatsappToSenseTimeline(ownUser.user_id, "assistant", quota.reply, waMirrorDossier);
        await sendTwilio(fromRaw, quota.reply);
        return twilioWebhookAck();
      }
    }

    let reply = await callClaude(system, [...history, { role: "user", content: body }]);

    if (displayName) {
      reply = forceNameGreeting(reply, displayName);
    }
    reply = polishWhatsappReply(reply, displayName);
    if (!norm(reply)) {
      reply = displayName
        ? `${displayName}, ik ben er. Waar wil je het nu over hebben?`
        : "Ik ben er. Waar wil je het nu over hebben?";
    }

    await saveMsg(userPhone, "assistant", reply);
    if (ownUser?.user_id) await mirrorWhatsappToSenseTimeline(ownUser.user_id, "assistant", reply, waMirrorDossier);
    await sendTwilio(fromRaw, reply);

    return twilioWebhookAck();
  } catch (error) {
    console.error("whatsapp-webhook error:", error);
    return new Response("Error", { status: 500 });
  }
});
