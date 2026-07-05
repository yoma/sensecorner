import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

function functionBody(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} should exist`);
  const open = source.indexOf("{", start);
  assert.notEqual(open, -1, `${name} should have a body`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`${name} body was not closed`);
}

const selfSense = readFileSync(new URL("../selfsense.html", import.meta.url), "utf8");
const ownSense = readFileSync(new URL("../ownsense.html", import.meta.url), "utf8");

const selfMerge = functionBody(selfSense, "confirmSamenvoegen");
assert.match(selfSense, /function mergeAandachtspuntEvidence\(/, "SelfSense should have an evidence merge helper");
assert.match(selfMerge, /evidence:mergeAandachtspuntEvidence\(keepRow\.evidence,removeRow\.evidence\)/, "SelfSense merge should copy evidence to the kept row");
assert.ok(
  selfMerge.indexOf("await updateAandachtspuntRowLocal(keepId,patch)") <
    selfMerge.indexOf(".update({status:'verworpen'"),
  "SelfSense should persist the kept row before hiding the removed row",
);

const ownMerge = functionBody(ownSense, "mergeProposalIntoExisting");
assert.match(ownSense, /function mergeOwnAandachtspuntEvidence\(/, "OWNSense should have an evidence merge helper");
assert.match(ownMerge, /var newEvidence=mergeOwnAandachtspuntEvidence\(existing\.evidence,proposal\.evidence\)/, "OWNSense merge should preserve proposal evidence");
assert.ok(
  ownMerge.indexOf("if(!updated)throw new Error('Kon bestaand aandachtspunt niet bijwerken.')") <
    ownMerge.indexOf("updateOwnAandachtspuntRow(proposalId,{status:'verworpen'"),
  "OWNSense should not reject the proposal unless the destination update succeeded",
);
assert.match(ownMerge, /if\(!rejected\)throw new Error\('Kon voorstel niet verwerpen na samenvoegen\.'\)/, "OWNSense should notice a failed proposal rejection");

console.log("attention merge invariants ok");
