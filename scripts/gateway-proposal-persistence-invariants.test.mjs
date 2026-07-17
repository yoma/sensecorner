import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file) => readFileSync(join(process.cwd(), file), "utf8");
const common = read("js/sense-common.js");
const gateway = read("js/gateway-chat.js");

const ingestStart = common.indexOf("async function senseIngestConfirmedGatewayProposals");
const ingestEnd = common.indexOf("function senseBuildGatewayProposalCoachTasks", ingestStart);
assert.notEqual(ingestStart, -1, "missing proposal ingest helper");
assert.notEqual(ingestEnd, -1, "missing proposal ingest boundary");
const ingest = common.slice(ingestStart, ingestEnd);
assert.match(ingest, /var failOnWriteError = opts\.failOnWriteError === true;/);
assert.match(ingest, /if \(exists\) \{\s*written\.push\(row\.id\);/);
assert.match(ingest, /else if \(failOnWriteError\) \{\s*throw/);
assert.match(ingest, /if \(failOnWriteError\) throw _w;/);

const resolveStart = gateway.indexOf("async function gwResolveProposal");
const resolveEnd = gateway.indexOf("async function gwApplyProfileAnswer", resolveStart);
assert.notEqual(resolveStart, -1, "missing proposal resolver");
assert.notEqual(resolveEnd, -1, "missing proposal resolver boundary");
const resolve = gateway.slice(resolveStart, resolveEnd);
assert.match(resolve, /failOnWriteError: !!landingProfile/);
assert.match(resolve, /if \(landingProfile && ingested\.indexOf\(proposalId\) < 0\) \{\s*throw/);
assert.doesNotMatch(resolve, /catch \(ingErr\)/, "proposal persistence errors are still swallowed");

console.log("gateway proposal persistence invariants passed");
