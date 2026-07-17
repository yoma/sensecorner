import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const files = [
  "edge-functions/sensei-chat.edge.ts",
  "supabase/functions/sensei-chat/index.ts",
];
const sources = files.map((file) => [file, readFileSync(join(root, file), "utf8")]);

function assertOrder(source, before, after, label) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
  assert.notEqual(beforeIndex, -1, `${label}: missing ${before}`);
  assert.notEqual(afterIndex, -1, `${label}: missing ${after}`);
  assert.ok(beforeIndex < afterIndex, `${label}: expected reservation before Anthropic`);
}

for (const [file, source] of sources) {
  assert.match(source, /async function reserveAiRateSlot\(/, `${file}: missing reservation helper`);
  assert.match(source, /if \(counted\.count == null\)/, `${file}: quota read errors must fail closed`);
  assert.doesNotMatch(source, /function logGatewaySummaryUsage/, `${file}: summary usage is still logged after Claude`);

  const summaryStart = source.indexOf("async function handleGatewaySummaries");
  const serveStart = source.indexOf("Deno.serve", summaryStart);
  assert.notEqual(summaryStart, -1, `${file}: missing summary handler`);
  assert.notEqual(serveStart, -1, `${file}: missing request handler`);
  const summaryHandler = source.slice(summaryStart, serveStart);
  assertOrder(
    summaryHandler,
    'const reserved = await reserveAiRateSlot(userId, "gateway_summary");',
    "const text = await callAnthropicPlain(",
    `${file}: gateway summaries`,
  );
  assert.doesNotMatch(
    summaryHandler.slice(summaryHandler.indexOf("const text = await callAnthropicPlain(")),
    /ai_rate_log"\)\.insert/,
    `${file}: found post-Claude summary metering`,
  );

  const requestHandler = source.slice(serveStart);
  assertOrder(
    requestHandler,
    "const reserved = await reserveAiRateSlot(userId, mode);",
    'claudeRes = await fetch("https://api.anthropic.com/v1/messages"',
    `${file}: chat`,
  );
  assert.doesNotMatch(
    requestHandler.slice(requestHandler.indexOf("const claudeData = await claudeRes.json();")),
    /ai_rate_log"\)\.insert/,
    `${file}: found post-Claude chat metering`,
  );
}

assert.equal(sources[0][1], sources[1][1], "deployed sensei-chat copies diverged");

console.log("sensei-chat rate-limit invariants passed");
