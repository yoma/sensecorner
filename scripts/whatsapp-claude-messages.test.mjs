/**
 * WhatsApp webhook moet Claude-berichten afwisselen.
 * getHistory bevat het net opgeslagen user-bericht; de call plakt dat bericht
 * opnieuw achteraan. Zonder sanitatie weigert Claude (400) en Twilio herhaalt.
 *
 * Run: node scripts/whatsapp-claude-messages.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "edge-functions/whatsapp-webhook.edge.ts"), "utf8");

function extractFunction(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing function ${name}`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed function ${name}`);
}

function toJs(fn) {
  return fn
    .replace(/\(v:\s*unknown\)/g, "(v)")
    .replace(/:\s*WaClaudeIn\[\]/g, "")
    .replace(/:\s*WaClaudeTurn\[\]/g, "");
}

const api = new Function(
  `${toJs(extractFunction("norm"))}\n${toJs(extractFunction("sanitizeWhatsappClaudeMessages"))}\nreturn { sanitizeWhatsappClaudeMessages };`,
)();
const sanitize = api.sanitizeWhatsappClaudeMessages;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function roles(msgs) {
  return msgs.map((m) => m.role).join(",");
}

// Net opgeslagen bericht zit al in history én wordt opnieuw toegevoegd.
{
  const history = [{ role: "user", content: "In januari wil ik minder werken." }];
  const body = "In januari wil ik minder werken.";
  const out = sanitize([...history, { role: "user", content: body }]);
  assert(out.length === 1, "duplicate current user turn must collapse to one message");
  assert(out[0].role === "user" && out[0].content === body, "kept the user text once");
}

// Venster van 6 begint op een assistant-antwoord, plus de dubbele user-staart.
{
  const history = [
    { role: "assistant", content: "Vorige reactie" },
    { role: "user", content: "oké" },
    { role: "assistant", content: "En toen?" },
    { role: "user", content: "verder" },
  ];
  const body = "verder";
  const out = sanitize([...history, { role: "user", content: body }]);
  assert(out[0].role === "user", "conversation must start with user");
  assert(roles(out) === "user,assistant,user", "roles must alternate after dropping the leading assistant");
  assert(out[out.length - 1].content === "verder", "current turn kept once");
}

// Eerdere mislukte calls lieten alleen user-rijen achter.
{
  const history = [
    { role: "user", content: "eerste" },
    { role: "user", content: "tweede" },
  ];
  const out = sanitize([...history, { role: "user", content: "tweede" }]);
  assert(out.length === 1 && out[0].role === "user", "stacked user rows become one user turn");
  assert(out[0].content === "eerste\n\ntweede", "distinct user texts are kept");
}

// Gezond gesprek blijft afgewisseld, nieuw bericht komt erachter.
{
  const history = [
    { role: "user", content: "hoi" },
    { role: "assistant", content: "hey" },
  ];
  const out = sanitize([...history, { role: "user", content: "hoe gaat het" }]);
  assert(roles(out) === "user,assistant,user", "healthy history stays alternating");
  assert(out[2].content === "hoe gaat het", "new user turn appended");
}

assert(
  src.includes("sanitizeWhatsappClaudeMessages([...history, { role: \"user\", content: body }])"),
  "call site must sanitize history plus the current body before callClaude",
);

console.log("whatsapp-claude-messages.test.mjs: ok");
