// Demo mode only: a small rule-based stand-in for the AI assessment, so ?demo=1 can show what happens when
// you add a file, link or meeting notes. In a real workspace, Flow 12 (files and links) and Flow 1 (meeting notes)
// send the content to an AI Builder prompt instead (prompts/04-assess-artifact.md, prompts/01-extract-meeting-items.md).

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DEP = /\b(depends? on|dependent on|dependency|waiting (?:on|for)|blocked (?:by|on|until)|requires?|need(?:s|ed)? (?:\w+ ){0,5}from|relies on|can'?t (?:start|begin|ship) (?:until|before|without)|only after|sign[- ]?off|approval|hand-?off|access to)\b/i;
const RISK = /\b(risks?|may (?:slip|delay|not)|might (?:slip|delay|not|miss)|could (?:slip|delay|block|stall|fail|miss|push)|concern(?:ed)?|not (?:yet )?(?:reviewed|ready|confirmed|signed|approved|staffed|tested)|behind schedule|unclear|uncertain|tight|at risk|no firm date)\b/i;
const BLOCKED = /\b(blocked|blocking|blocker|stuck|on hold)\b/i;
const HIGH = /\b(launch|beta|go-?live|critical|contract|legal|security|blocked|customer|deadline)\b/i;
const PROVIDERS = ["vendor", "procurement", "legal", "security", "finance", "engineering", "design", "marketing", "support",
  "it", "language leads", "data platform", "product", "localization", "qa", "operations", "leadership", "steering group"];
const STOP = new Set(["with", "from", "that", "this", "will", "have", "need", "needs", "before", "after", "until", "into", "final", "review", "team"]);

const words = (s) => (s.toLowerCase().match(/[a-z0-9/]{4,}/g) || []).filter((w) => !STOP.has(w));
const clip = (s, n = 110) => {
  const t = s.replace(/\s+/g, " ").replace(/^[-*•\d.)\s]+/, "").replace(/[.;:,\s]+$/, "").trim();
  const c = t.charAt(0).toUpperCase() + t.slice(1);
  return c.length > n ? c.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : c;
};

function findDate(s) {
  const m = s.match(/\b(?:by|before|on|until|due|needed)\s+(?:(?:mon|tue|wed|thu|fri|sat|sun)\w*,?\s+)?([a-z]{3})[a-z]*\.?\s+(\d{1,2})\b/i);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].toLowerCase());
  if (mon < 0) return null;
  const now = new Date();
  const d = new Date(now.getFullYear(), mon, Number(m[2]), 12);
  if (d < new Date(now.getTime() - 120 * 864e5)) d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

function findProvider(s) {
  const low = ` ${s.toLowerCase()} `;
  const hit = PROVIDERS.find((p) => low.includes(` ${p} `) || low.includes(` ${p}'s `) || low.includes(` ${p},`) || low.includes(` ${p}.`));
  if (hit) return hit === "it" ? "IT" : hit.replace(/\b\w/g, (c) => c.toUpperCase());
  const m = s.match(/\b(?:from|by|with)\s+((?:[A-Z][\w&-]+\s?){1,3})/);
  return m ? m[1].trim() : "";
}

function typeOf(s) {
  if (/\bvendor|supplier|partner|contractor\b/i.test(s)) return "Vendor";
  if (/\bapprov|sign[- ]?off|signed|legal|procurement|contract\b/i.test(s)) return "Approval";
  if (/\bdecid|decision\b/i.test(s)) return "Decision";
  if (/\bdata|dataset|report|metrics\b/i.test(s)) return "Data";
  if (/\bapi|system|service|environment|build|sandbox|access|server|tool\b/i.test(s)) return "System";
  return "Team";
}

function relatedMilestone(s, milestones) {
  const w = new Set(words(s));
  let best = null, bestScore = 0;
  for (const m of milestones) {
    const score = words(m.Title).filter((x) => w.has(x)).length;
    if (score > bestScore || (score === bestScore && best && (m.DueDate || "") < (best.DueDate || ""))) { best = m; bestScore = score; }
  }
  return bestScore ? best : null;
}

// Returns { summary, dependencies: [fields], risks: [fields] } for the given text.
export function assessText(text, milestones = []) {
  const sentences = String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  const dependencies = [], risks = [], seen = new Set();
  for (const s of sentences) {
    const key = clip(s, 60).toLowerCase();
    if (seen.has(key)) continue;
    const isDep = DEP.test(s), isRisk = RISK.test(s) || BLOCKED.test(s);
    if (!isDep && !isRisk) continue;
    seen.add(key);
    const ms = relatedMilestone(s, milestones);
    if (isDep) {
      dependencies.push({
        Title: clip(s), DependencyType: typeOf(s), ProvidedBy: findProvider(s), NeededBy: findDate(s),
        DependencyStatus: BLOCKED.test(s) ? "Blocked" : isRisk ? "At risk" : "Open",
        Impact: HIGH.test(s) ? "High" : "Medium", RelatedMilestoneLookupId: ms ? ms.id : null, Details: `From the source: "${clip(s, 240)}"`
      });
    } else {
      risks.push({
        Title: clip(s), Impact: HIGH.test(s) ? "High" : "Medium",
        Likelihood: /\b(again|already|likely|behind|not yet|no firm date)\b/i.test(s) ? "High" : "Medium",
        Mitigation: (s.match(/\b(?:mitigat\w*|fallback|workaround|plan b|so we)\b[^.]*/i) || [""])[0], RiskStatus: "Open"
      });
    }
  }
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const summary = dependencies.length + risks.length
    ? `Found ${n(dependencies.length, "dependency", "dependencies")} and ${n(risks.length, "risk", "risks")}.${dependencies[0] ? ` Most important: ${dependencies[0].Title}.` : ` Most important: ${risks[0].Title}.`}`
    : "No risks or dependencies were clearly stated. Add a short note about what's inside, or review it yourself.";
  return { summary, dependencies: dependencies.slice(0, 8), risks: risks.slice(0, 8) };
}
