// Exercises every board action over HTTP against a running app: node scripts/smoke-actions.mjs (BASE=http://localhost:8790)
const BASE = process.env.BASE ?? "http://localhost:8790";
async function call(name, body, method = "POST") {
  const url = new URL(`/_agent-native/actions/${name}`, BASE);
  let init = { method, headers: { "content-type": "application/json" } };
  if (method === "GET") for (const [k, v] of Object.entries(body ?? {})) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  else init.body = JSON.stringify(body ?? {});
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${name} ${res.status}: ${text.slice(0, 600)}`);
  return json;
}
const log = (label, v) => console.log(`\n## ${label}\n` + JSON.stringify(v, null, 1).slice(0, 1500));

const study = await call("create-study", { title: "HTTP smoke", question: "Why do teams stall?" });
log("study", study);
const src = await call("add-source", {
  studyId: study.id,
  title: "P1 — Dana",
  raw: "Interviewer: How was setup?\nDana: The setup was painful. I almost gave up on the second day.\nDana: Receipts never upload when I’m on the train, which is where I do expenses.",
  participant: { label: "Dana", segment: "finance lead" },
});
log("source", src);
const src2 = await call("add-source", {
  studyId: study.id,
  title: "P2 — Sam",
  raw: "Sam: Honestly the receipts thing kills me. Offline it just spins forever.\nSam: Approvals are fine though.",
  participant: { label: "Sam" },
});
const notes = await call("add-notes", {
  studyId: study.id,
  notes: [
    { sourceId: src.sourceId, quote: "The setup was painful. I almost gave up on the second day." },
    { sourceId: src.sourceId, quote: "Receipts never upload when I'm on the train" },
    { sourceId: src.sourceId, quote: "Setup took way too long and I hated it" },
    { sourceId: src2.sourceId, quote: "Offline it just spins forever." },
    { sourceId: src2.sourceId, quote: "the receipts thing ... kills me" },
  ],
});
log("add-notes", notes);
const ids = notes.added.map((n) => n.id);
const theme = await call("create-theme", { studyId: study.id, name: "Receipts fail offline", noteIds: [ids[1], ids[2]] });
log("theme", theme);
try {
  await call("move-notes", { studyId: study.id, moves: [{ noteId: ids[0], themeId: "thm_doesnotexist" }] });
  console.log("!! move to missing theme did NOT fail");
} catch (e) { log("move to missing theme (expected fail)", String(e.message).slice(0, 200)); }
const ins = await call("write-insight", { studyId: study.id, themeId: theme.id, claim: "Two of two people lose receipts when capture runs offline.", noteIds: [ids[1], ids[2]] });
log("insight", ins);
const anec = await call("write-insight", { studyId: study.id, claim: "Setup is painful enough to quit on day two.", noteIds: [ids[0]] });
log("anecdote", anec);
try {
  await call("write-insight", { studyId: study.id, claim: "Made-up evidence should be refused.", noteIds: [ids[0], "not_fake123"] });
  console.log("!! fake citation NOT refused");
} catch (e) { log("fake citation (expected fail)", String(e.message).slice(0, 200)); }
const t1 = await call("update-theme", { themeId: theme.id, name: "Receipts fail on bad signal", expectedRev: (await call("check-board", { studyId: study.id }, "GET")).themes[0].rev });
log("rename ok", t1);
try {
  await call("update-theme", { themeId: theme.id, name: "Stale rename", expectedRev: "stale000" });
  console.log("!! stale rename NOT refused");
} catch (e) { log("stale rename (expected 409)", String(e.message).slice(0, 260)); }
log("check-board", await call("check-board", { studyId: study.id }, "GET"));
log("search", await call("search-quotes", { query: "receipts offline" }, "GET"));
log("activity", (await call("list-activity", { studyId: study.id }, "GET")).events.map((e) => `${e.actor}: ${e.summary}`));
await call("layout-board", { studyId: study.id });
const board = await call("get-board", { studyId: study.id }, "GET");
log("board notes", board.notes.map((n) => ({ t: n.text.slice(0, 40), theme: n.themeId, x: n.x, y: n.y, ok: n.matchesSource })));
console.log("\nSTUDY", study.id);
