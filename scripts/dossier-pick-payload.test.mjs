/**
 * Koppelen vanuit Vertel-geschiedenis geeft een numerieke index of een array
 * van indexen mee. Object.assign({}, 0) en Object.assign({}, [2, 5]) maken
 * daar een leeg of lengteloos object van, zodat er niets in het dossier belandt.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const helperSrc = fs.readFileSync(new URL("../js/sense-common.js", import.meta.url), "utf8");
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(helperSrc, sandbox);
const prepare = sandbox.sensePrepareDossierPickPayload;
assert.equal(typeof prepare, "function");

function oldAssign(payload) {
  return payload ? Object.assign({}, payload) : {};
}

const rows = [
  { text: "eerste bericht", dossier: "" },
  { text: "tweede bericht", dossier: "EmmaSense" },
  { text: "derde bericht", dossier: "" },
];

const single = prepare(0, true, function () { return "Emma"; });
assert.equal(single.payload, 0, "index 0 moet een number blijven");
assert.equal(rows[single.payload].text, "eerste bericht");
assert.equal(oldAssign(0) && rows[oldAssign(0)], undefined);
assert.equal(single.suggestedName, "Emma");

const later = prepare(2, true, function () { return "Emma"; });
assert.equal(later.payload, 2);
assert.equal(rows[later.payload].text, "derde bericht");
assert.deepEqual(Object.keys(oldAssign(2)), []);

const bulkIdxs = [0, 2];
const bulk = prepare(bulkIdxs, true, function () { return "Noah"; });
assert.ok(Array.isArray(bulk.payload));
assert.equal(bulk.payload.length, 2);
assert.deepEqual(bulk.payload, [0, 2]);
assert.notEqual(bulk.payload, bulkIdxs, "bulk-lijst wordt gekopieerd");
const linked = [];
for (let i = 0; i < bulk.payload.length; i++) linked.push(rows[bulk.payload[i]].text);
assert.deepEqual(linked, ["eerste bericht", "derde bericht"]);
const wiped = oldAssign(bulkIdxs);
assert.equal(wiped.length, undefined);

const save = prepare(
  { sid: "sv1", text: "verhaal", suggestedName: "" },
  true,
  function () { return "Katrien"; },
);
assert.equal(save.payload.sid, "sv1");
assert.equal(save.payload.text, "verhaal");
assert.equal(save.payload.suggestedName, "Katrien");
assert.equal(save.suggestedName, "Katrien");

const named = prepare({ sid: "sv2", suggestedName: "Mila" }, true, function () { return "Katrien"; });
assert.equal(named.payload.suggestedName, "Mila");
assert.equal(named.suggestedName, "Mila");

const focus = prepare({ contacts: ["EmmaSense", "OWN Sense"] }, false, function () { return "Katrien"; });
assert.deepEqual(focus.payload.contacts, ["EmmaSense", "OWN Sense"]);
assert.equal(focus.suggestedName, "");
assert.equal(focus.payload.suggestedName, undefined);

const empty = prepare(null, true, function () { return ""; });
assert.equal(JSON.stringify(empty.payload), JSON.stringify({ suggestedName: "" }));
assert.equal(empty.suggestedName, "");
const closed = prepare(null, false, function () { return "Katrien"; });
assert.equal(JSON.stringify(closed.payload), "{}");
assert.equal(closed.suggestedName, "");

for (const file of ["datesense.html", "familysense.html", "friendsense.html"]) {
  const html = fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
  assert.match(html, /sensePrepareDossierPickPayload\(payload,/);
  assert.doesNotMatch(html, /payload\?Object\.assign\(\{\},payload\)/);
  assert.match(html, /openDossierPickModal\(\s*'Kies dossier',[\s\S]*?'single',\s*idx\s*\)/);
  assert.match(html, /targets\.map\(function\(t\)\{return t\.idx;\}\)/);
}

console.log("dossier-pick-payload: ok");
