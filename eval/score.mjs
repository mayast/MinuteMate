#!/usr/bin/env node
// MinuteMate AI quality evaluation (Phase 5.6).
// Compares the extraction prompt's JSON output with hand-written expected results and reports
// precision and recall for action items, risks and decisions, plus owner, due-date and duplicate-match accuracy.
//
// Usage:
//   node eval/score.mjs                       # score every eval/runs/<case>.json against eval/cases/<case>.expected.json
//   node eval/score.mjs --case case-01        # one case
//   node eval/score.mjs --threshold 0.8       # exit 1 if overall F1 is below the threshold (for CI)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const onlyCase = opt("case", null);
const threshold = Number(opt("threshold", "0"));

const STOP = new Set("a an the to of for and or by on in with from at is be will our their this that it".split(" "));
const tokens = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)));
const similarity = (a, b) => {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size); // overlap coefficient: tolerant of extra words
};
const MATCH = 0.6;

// Greedy one-to-one matching of predicted items to expected items by title similarity.
function match(expected, predicted) {
  const pairs = [];
  for (let i = 0; i < expected.length; i++) for (let j = 0; j < predicted.length; j++) {
    const s = similarity(expected[i].title, predicted[j].title);
    if (s >= MATCH) pairs.push([s, i, j]);
  }
  pairs.sort((a, b) => b[0] - a[0]);
  const usedE = new Set(), usedP = new Set(), matched = [];
  for (const [, i, j] of pairs) if (!usedE.has(i) && !usedP.has(j)) { usedE.add(i); usedP.add(j); matched.push([expected[i], predicted[j]]); }
  return {
    matched,
    missed: expected.filter((_, i) => !usedE.has(i)),
    extra: predicted.filter((_, j) => !usedP.has(j))
  };
}

const sameName = (a, b) => {
  const A = String(a || "").trim().toLowerCase(), B = String(b || "").trim().toLowerCase();
  if (!A || !B) return A === B;
  return A === B || A.split(" ")[0] === B.split(" ")[0]; // "Priya" matches "Priya Patel"
};

const cases = readdirSync(join(root, "cases")).filter((f) => f.endsWith(".expected.json")).map((f) => f.replace(".expected.json", ""))
  .filter((c) => !onlyCase || c === onlyCase).sort();
const totals = { tp: 0, fp: 0, fn: 0, owner: [0, 0], due: [0, 0], dup: [0, 0] };
const rows = [];

for (const c of cases) {
  const runFile = join(root, "runs", `${c}.json`);
  if (!existsSync(runFile)) { rows.push({ case: c, note: "no run output (paste the prompt's JSON into eval/runs/" + c + ".json)" }); continue; }
  const exp = JSON.parse(readFileSync(join(root, "cases", `${c}.expected.json`), "utf8"));
  const got = JSON.parse(readFileSync(runFile, "utf8"));
  const detail = [];
  let tp = 0, fp = 0, fn = 0;
  for (const section of ["action_items", "risks", "decisions"]) {
    const r = match(exp[section] || [], got[section] || []);
    tp += r.matched.length; fp += r.extra.length; fn += r.missed.length;
    r.missed.forEach((m) => detail.push(`  missed ${section.replace("_items", "")}: ${m.title}`));
    r.extra.forEach((m) => detail.push(`  extra  ${section.replace("_items", "")}: ${m.title}`));
    if (section === "action_items") for (const [e, p] of r.matched) {
      totals.owner[1]++; if (sameName(e.owner_name, p.owner_name)) totals.owner[0]++; else detail.push(`  owner  "${e.title}": expected "${e.owner_name}", got "${p.owner_name}"`);
      totals.due[1]++; if ((e.due_date || "") === (p.due_date || "")) totals.due[0]++; else detail.push(`  due    "${e.title}": expected "${e.due_date || ""}", got "${p.due_date || ""}"`);
      if ("matches_existing_id" in e) { totals.dup[1]++; if ((e.matches_existing_id || "") === (p.matches_existing_id || "")) totals.dup[0]++; else detail.push(`  dup    "${e.title}": expected match "${e.matches_existing_id || "none"}", got "${p.matches_existing_id || "none"}"`); }
    }
  }
  totals.tp += tp; totals.fp += fp; totals.fn += fn;
  const prec = tp + fp ? tp / (tp + fp) : 1, rec = tp + fn ? tp / (tp + fn) : 1;
  rows.push({ case: c, precision: prec, recall: rec, f1: prec + rec ? (2 * prec * rec) / (prec + rec) : 0, detail });
}

const pct = (v) => (v == null ? "  —  " : `${(v * 100).toFixed(0).padStart(3)}%`);
console.log("\nMinuteMate extraction eval\n");
console.log("case        precision  recall   F1");
for (const r of rows) {
  if (r.note) { console.log(`${r.case.padEnd(12)}${r.note}`); continue; }
  console.log(`${r.case.padEnd(12)}${pct(r.precision).padStart(9)}  ${pct(r.recall).padStart(6)}  ${pct(r.f1).padStart(4)}`);
  r.detail.forEach((d) => console.log(d));
}
const P = totals.tp + totals.fp ? totals.tp / (totals.tp + totals.fp) : 1;
const R = totals.tp + totals.fn ? totals.tp / (totals.tp + totals.fn) : 1;
const F = P + R ? (2 * P * R) / (P + R) : 0;
const ratio = ([a, b]) => (b ? a / b : null);
console.log(`\nOverall: precision ${pct(P)}, recall ${pct(R)}, F1 ${pct(F)}`);
console.log(`Owner correct ${pct(ratio(totals.owner))} · due date correct ${pct(ratio(totals.due))} · duplicate matching correct ${pct(ratio(totals.dup))}\n`);
if (threshold && F < threshold) { console.error(`F1 ${F.toFixed(2)} is below the threshold ${threshold}`); process.exit(1); }
