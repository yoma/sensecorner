import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");

function assertBefore(src, before, after, label) {
  const b = src.indexOf(before);
  const a = src.indexOf(after);
  assert.notEqual(b, -1, `${label}: missing ${before}`);
  assert.notEqual(a, -1, `${label}: missing ${after}`);
  assert.ok(b < a, `${label}: expected ${before} before ${after}`);
}

{
  const src = read("selfsense.html");
  assert.match(src, /function mergeAandachtspuntEvidence\(/, "SelfSense has evidence merge helper");
  assert.match(src, /function mergeAandachtspuntTips\(/, "SelfSense preserves merged advice");
  assertBefore(src, "var mergedEvidence=mergeAandachtspuntEvidence(keepRow.evidence,removeRow.evidence)", ".update({status:'verworpen'", "SelfSense confirmed merge");
  assertBefore(src, "tips_advice:mergeAandachtspuntTips", ".update({status:'verworpen'", "SelfSense advice merge");
  assert.match(src, /type:'merge'[\s\S]*merged_id:removeId[\s\S]*merged_name:removeName/, "SelfSense records merge audit movement");
}

{
  const src = read("ownsense.html");
  assert.match(src, /function mergeAandachtspuntEvidence\(/, "OWNSense has evidence merge helper");
  assertBefore(src, "var newEvidence=mergeAandachtspuntEvidence(existing.evidence,proposal.evidence)", "updateOwnAandachtspuntRow(proposalId,{status:'verworpen'", "OWNSense proposal merge");
  assertBefore(src, "if(!updated)throw new Error('Bestemming is niet bijgewerkt.')", "updateOwnAandachtspuntRow(proposalId,{status:'verworpen'", "OWNSense destination write guard");
  assertBefore(src, "if(!rejected)throw new Error('Voorstel is niet verworpen.')", "patchOwnAandachtspuntLocal(proposalId,rejected)", "OWNSense rejection write guard");
}

console.log("attention merge invariants passed");
