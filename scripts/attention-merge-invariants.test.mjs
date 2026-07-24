import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

function assertBefore(source, before, after, label) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after);
  assert.notEqual(beforeIndex, -1, `${label}: missing ${before}`);
  assert.notEqual(afterIndex, -1, `${label}: missing ${after}`);
  assert.ok(beforeIndex < afterIndex, `${label}: expected ${before} before ${after}`);
}

{
  const source = read("selfsense.html");
  assert.match(source, /function mergeAandachtspuntEvidence\(/, "SelfSense has evidence merge helper");
  assert.match(source, /function mergeAandachtspuntTips\(/, "SelfSense preserves merged advice");
  assertBefore(
    source,
    "var mergedEvidence=mergeAandachtspuntEvidence(keepRow.evidence,removeRow.evidence)",
    ".update({status:'verworpen'",
    "SelfSense confirmed merge",
  );
  assertBefore(
    source,
    "tips_advice:mergeAandachtspuntTips",
    ".update({status:'verworpen'",
    "SelfSense advice merge",
  );
  assert.match(
    source,
    /type:'merge'[\s\S]*merged_id:removeId[\s\S]*merged_name:removeName/,
    "SelfSense records merge audit movement",
  );
}

{
  const source = read("ownsense.html");
  assert.match(source, /function mergeAandachtspuntEvidence\(/, "OWNSense has evidence merge helper");
  assertBefore(
    source,
    "var newEvidence=mergeAandachtspuntEvidence(existing.evidence,proposal.evidence)",
    "updateOwnAandachtspuntRow(proposalId,{status:'verworpen'",
    "OWNSense proposal merge",
  );
  assertBefore(
    source,
    "if(!updated)throw new Error('Bestemming is niet bijgewerkt.')",
    "updateOwnAandachtspuntRow(proposalId,{status:'verworpen'",
    "OWNSense destination write guard",
  );
  assertBefore(
    source,
    "if(!rejected)throw new Error('Voorstel is niet verworpen.')",
    "patchOwnAandachtspuntLocal(proposalId,rejected)",
    "OWNSense rejection write guard",
  );
}

console.log("attention merge invariants passed");
