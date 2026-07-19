import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/sense-common.js", import.meta.url), "utf8");
const match = source.match(/function senseHandoffDossierKey\(name\) \{\n([\s\S]*?)\n  \}/);
assert.ok(match, "handoff dossier key helper must exist");

const dossierKey = new Function("name", match[1]);
assert.equal(dossierKey("AnnSense"), dossierKey("Ann"), "Sense suffix should be an explicit alias");
assert.notEqual(dossierKey("AnnaSense"), dossierKey("Ann"), "different contact names must stay distinct");

const focusStart = source.indexOf("function senseApplyHandoffDossierFocus(");
const focusEnd = source.indexOf("function senseFormatGatewayProposalsCoachBlock(", focusStart);
assert.ok(focusStart >= 0 && focusEnd > focusStart, "handoff focus function must exist");
const focus = source.slice(focusStart, focusEnd);
assert.match(
  focus,
  /senseHandoffDossierKey\(p2\) === dossierKey/,
  "fallback matching must compare explicit dossier aliases",
);
assert.doesNotMatch(
  focus,
  /indexOf\([^)]*\) === 0/,
  "handoff focus must not select arbitrary name prefixes",
);

console.log("Gateway handoff focus invariants passed.");
