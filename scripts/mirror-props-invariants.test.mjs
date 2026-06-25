import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("js/sense-mirror-hub.js", "utf8");
const context = {
  window: {},
  console,
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(source, context, { filename: "sense-mirror-hub.js" });

const hub = context.window.SenseMirrorHub;
assert.equal(typeof hub?.saveSelectedMirrors, "function", "SenseMirrorHub.saveSelectedMirrors is exported");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeSupabaseMock(initialRows) {
  const rows = new Map();
  const upserts = [];
  for (const row of initialRows) {
    rows.set(`${row.user_id}|${row.name}`, clone(row));
  }

  return {
    upserts,
    from(table) {
      assert.equal(table, "sense_profiles");
      const filters = {};
      return {
        select() {
          return this;
        },
        eq(column, value) {
          filters[column] = value;
          return this;
        },
        async maybeSingle() {
          const row = rows.get(`${filters.user_id}|${filters.name}`);
          return { data: row ? { props: clone(row.props) } : null, error: null };
        },
        async upsert(payload) {
          upserts.push(clone(payload));
          rows.set(`${payload.user_id}|${payload.name}`, clone(payload));
          return { error: null };
        },
      };
    },
  };
}

const originalProps = {
  categories: { veilig: ["rust"] },
  meta: { app_scope: ["ds"], dossier_note: "keep me" },
  custom_field: "must stay",
  activated_at: "2026-01-01T00:00:00.000Z",
  via: "date_app",
  mirror_status: "paused",
  paused_at: "2026-02-01T00:00:00.000Z",
};

const sb = makeSupabaseMock([
  {
    user_id: "user-1",
    name: "DateSense",
    props: originalProps,
  },
]);

const result = await hub.saveSelectedMirrors(sb, "user-1", new Set(["own", "date"]));
assert.equal(result, "");
assert.equal(sb.upserts.length, 2);

const saved = sb.upserts.find((row) => row.name === "DateSense");
assert(saved, "DateSense mirror row was upserted");
assert.equal(saved.user_id, "user-1");
assert.equal(saved.name, "DateSense");
assert.deepEqual(saved.props.categories, originalProps.categories);
assert.deepEqual(saved.props.meta, originalProps.meta);
assert.equal(saved.props.custom_field, "must stay");
assert.equal(saved.props.activated_at, originalProps.activated_at);
assert.equal(saved.props.via, originalProps.via);
assert.equal(saved.props.mirror_status, "active");
assert(!("paused_at" in saved.props), "paused marker is cleared when reactivating");

console.log("mirror props invariants passed");
