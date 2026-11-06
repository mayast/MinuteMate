// Risks & dependencies: add a file, a link or meeting notes, and MinuteMate assesses it and logs the risks and
// dependencies it finds, each linked back to its source. Files and links are assessed by Flow 12
// (prompts/04-assess-artifact.md); meeting notes go through Flow 1 like any other meeting.
// The tab also ranks what needs attention now, including timeline conflicts, and the Overview links into it.
import { esc, pill, toast, busy, isPast, toDateInput, fromDateInput, fmtShort, DAY } from "../ui.js";
import { findIssues } from "./timeline.js";
import { assessText } from "../assess-demo.js";

const LEVELS = ["High", "Medium", "Low"];
const DEP_TYPES = ["Team", "Vendor", "System", "Approval", "Decision", "Data"];
const DEP_STATUSES = ["Open", "At risk", "Blocked", "Resolved"];
const RISK_STATUSES = ["Open", "Mitigating", "Closed"];
const SOON = 7; // days
const TEXT_FILE = /\.(txt|md|csv|vtt|json)$/i;
const RANK = { High: 3, Medium: 2, Low: 1 };

let addMode = "file"; // file | link | notes
let showClosed = false;

const today = () => new Date(new Date().toDateString());
const daysUntil = (iso) => Math.round((new Date(new Date(iso).toDateString()) - today()) / DAY);
const openDep = (d) => d.DependencyStatus !== "Resolved";
const openRisk = (r) => r.RiskStatus !== "Closed";
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function dueText(iso) {
  if (!iso) return "no date set";
  const d = daysUntil(iso);
  if (d < 0) return `was needed ${fmtShort(iso)} (${plural(-d, "day")} ago)`;
  if (d === 0) return "needed today";
  if (d === 1) return "needed tomorrow";
  return `needed by ${fmtShort(iso)} (in ${d} days)`;
}

// Where an item came from: an artifact (file or link) or a meeting.
export function sourceOf(ctx, x) {
  if (x.SourceArtifactLookupId) {
    const a = (ctx.state.lists.artifacts || []).find((z) => z.id === x.SourceArtifactLookupId);
    if (a) return { kind: "artifact", id: a.id, label: a.Title };
  }
  if (x.SourceMeetingLookupId) {
    const m = (ctx.state.lists.meetings || []).find((z) => z.id === x.SourceMeetingLookupId);
    if (m) return { kind: "meeting", id: m.id, label: `${m.Title} (${fmtShort(m.MeetingStart || m.MeetingDate)})` };
  }
  return null;
}

// Everything the tab and the Overview need, computed once.
export function summarize(ctx) {
  const deps = ctx.items("dependencies");
  const risks = ctx.items("risks");
  const milestones = ctx.items("milestones");
  const msById = new Map(milestones.map((m) => [m.id, m]));
  const openDeps = deps.filter(openDep);
  const openRisks = risks.filter(openRisk);
  const conflicts = findIssues(milestones.filter((m) => m.DueDate));
  const attention = [];

  for (const d of openDeps) {
    const ms = msById.get(d.RelatedMilestoneLookupId);
    const due = d.NeededBy ? daysUntil(d.NeededBy) : null;
    const base = { kind: "dependency", id: d.id, title: d.Title, impact: d.Impact };
    const late = due != null && due < 0;
    // Needed later than the milestone it feeds is due: the milestone can't finish on time.
    const afterMs = ms && d.NeededBy && ms.DueDate && ms.MilestoneStatus !== "Done" && daysUntil(d.NeededBy) > daysUntil(ms.DueDate);
    if (d.DependencyStatus === "Blocked") attention.push({ ...base, rank: 100, status: "Blocked", why: `Blocked · ${dueText(d.NeededBy)}${ms ? ` · holds up ${ms.Title}` : ""}` });
    else if (late) attention.push({ ...base, rank: 90, status: "Overdue", why: `${dueText(d.NeededBy)}${d.ProvidedBy ? ` from ${d.ProvidedBy}` : ""}` });
    else if (afterMs) attention.push({ ...base, rank: 85, status: "At risk", why: `Needed ${fmtShort(d.NeededBy)}, but ${ms.Title} is due ${fmtShort(ms.DueDate)}` });
    else if (d.DependencyStatus === "At risk") attention.push({ ...base, rank: 80, status: "At risk", why: `${dueText(d.NeededBy)}${d.ProvidedBy ? ` from ${d.ProvidedBy}` : ""}` });
    else if (due != null && due <= SOON) attention.push({ ...base, rank: 60, status: "Needed soon", why: `${dueText(d.NeededBy)}${d.ProvidedBy ? ` from ${d.ProvidedBy}` : ""}` });
  }
  for (const r of openRisks) {
    const s = (RANK[r.Impact] || 2) * (RANK[r.Likelihood] || 2);
    if (s >= 6) attention.push({ kind: "risk", id: r.id, title: r.Title, impact: r.Impact, rank: 60 + s, status: r.Impact === "High" ? "High" : "At risk",
      why: `${r.Impact || "Medium"} impact, ${(r.Likelihood || "Medium").toLowerCase()} likelihood${r.Mitigation ? ` · ${r.Mitigation}` : " · no mitigation yet"}` });
  }
  for (const c of conflicts) {
    attention.push({ kind: "conflict", id: c.from.id, html: c.text, rank: c.kind === "late" ? 88 : 75, status: c.kind === "late" ? "Blocked" : "At risk", why: "Timeline dependency" });
  }
  attention.sort((a, b) => b.rank - a.rank || (RANK[b.impact] || 0) - (RANK[a.impact] || 0));

  return {
    deps, risks, openDeps, openRisks, conflicts, attention, milestones,
    highRisks: openRisks.filter((r) => r.Impact === "High").length,
    soonDeps: openDeps.filter((d) => d.NeededBy && daysUntil(d.NeededBy) >= 0 && daysUntil(d.NeededBy) <= 14).length,
    flagged: openDeps.filter((d) => ["Blocked", "At risk"].includes(d.DependencyStatus)).length
  };
}

// Open this tab focused on one item ({ kind, id }) or a section ({ section }). Used by the Overview.
export function focusOn(ctx, focus) {
  ctx.state.focus = focus;
  ctx.selectTab("risks");
}

export function render(ctx, el) {
  const p = ctx.project();
  if (!p) { el.innerHTML = `<p class="empty">Kick off or create a project first.</p>`; return; }
  const s = summarize(ctx);
  const focus = ctx.state.focus;
  if (focus?.kind === "dependency" && s.deps.find((d) => d.id === focus.id && !openDep(d))) showClosed = true;
  if (focus?.kind === "risk" && s.risks.find((r) => r.id === focus.id && !openRisk(r))) showClosed = true;

  const deps = s.deps.filter((d) => showClosed || openDep(d))
    .sort((a, b) => openDep(b) - openDep(a) || (b.DependencyStatus === "Blocked") - (a.DependencyStatus === "Blocked") || (a.NeededBy || "9").localeCompare(b.NeededBy || "9"));
  const risks = s.risks.filter((r) => showClosed || openRisk(r))
    .sort((a, b) => (RANK[b.Impact] || 0) * (RANK[b.Likelihood] || 0) - (RANK[a.Impact] || 0) * (RANK[a.Likelihood] || 0));
  const tile = (n, label, note, jump, alert = false) =>
    `<button class="stat jump ${alert && n ? "alert" : ""}" data-jump="${jump}"><span class="n">${n}</span><span class="l">${esc(label)}</span>${note ? `<span class="note">${esc(note)}</span>` : ""}</button>`;

  el.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>Risks and dependencies</h2>
        <p class="muted">Add a file, a link or meeting notes. MinuteMate reads it, logs the risks and dependencies it finds, and links each one back to where it came from.</p>
      </div>
      <button class="btn ghost small" data-act="refresh">Refresh</button>
    </div>

    <div class="stats">
      ${tile(s.openRisks.length, "Open risks", s.highRisks ? `${s.highRisks} high impact` : "none high impact", "risks")}
      ${tile(s.openDeps.length, "Open dependencies", s.soonDeps ? `${s.soonDeps} needed in the next 14 days` : "nothing due in 14 days", "deps")}
      ${tile(s.flagged, "Blocked or at risk", "dependencies", "attention", true)}
      ${tile(s.conflicts.length, "Schedule conflicts", "from the timeline", "timeline", true)}
    </div>

    <section class="card-block" id="rd-add">
      <div class="block-head">
        <h3>Add something to assess</h3>
        <div class="segmented compact" role="tablist" aria-label="What are you adding?">
          ${[["file", "Upload a file"], ["link", "Add a link"], ["notes", "Paste meeting notes"]].map(([k, l]) => `<button type="button" data-mode="${k}" aria-selected="${addMode === k}">${l}</button>`).join("")}
        </div>
      </div>
      ${addForm(ctx)}
    </section>

    <h3 class="section-title" id="rd-attention">Needs attention</h3>
    <ul class="rows attention">
      ${s.attention.length ? s.attention.map((a) => attentionRow(ctx, a)).join("") : `<li class="empty">Nothing needs attention. Blocked, late and high-impact items show up here.</li>`}
    </ul>

    <div class="section-row">
      <h3 class="section-title" id="rd-deps">Dependencies <span class="count">${s.openDeps.length} open</span></h3>
      <label class="check"><input type="checkbox" data-f="closed" ${showClosed ? "checked" : ""}> Show resolved and closed</label>
    </div>
    <form class="add-row" data-form="dep">
      <input name="title" placeholder="New dependency: what are we waiting on?" required maxlength="255">
      <input name="by" placeholder="Provided by (team, vendor, person)">
      <select name="type" aria-label="Type">${DEP_TYPES.map((t) => `<option>${t}</option>`).join("")}</select>
      <input name="needed" type="date" aria-label="Needed by">
      <button class="btn primary small" type="submit">Add</button>
    </form>
    <div class="table-wrap">
      <table class="grid">
        <thead><tr><th>Dependency</th><th>Needed by</th><th>Milestone it affects</th><th>Impact</th><th>Status</th><th aria-label="Actions"></th></tr></thead>
        <tbody>${deps.length ? deps.map((d) => depRow(ctx, d, s.milestones)).join("") : `<tr><td colspan="6" class="empty">No dependencies yet. Add a file, link or meeting notes above, or add one by hand.</td></tr>`}</tbody>
      </table>
    </div>

    <h3 class="section-title" id="rd-risks">Risks <span class="count">${s.openRisks.length} open</span></h3>
    <form class="add-row" data-form="risk">
      <input name="title" placeholder="New risk" required maxlength="255">
      <input name="mitigation" placeholder="Mitigation">
      <select name="impact" aria-label="Impact"><option>Medium</option><option>High</option><option>Low</option></select>
      <select name="likelihood" aria-label="Likelihood"><option>Medium</option><option>High</option><option>Low</option></select>
      <button class="btn primary small" type="submit">Add</button>
    </form>
    <div class="table-wrap">
      <table class="grid">
        <thead><tr><th>Risk</th><th>Impact</th><th>Likelihood</th><th>Status</th><th aria-label="Actions"></th></tr></thead>
        <tbody>${risks.length ? risks.map((r) => riskRow(ctx, r)).join("") : `<tr><td colspan="5" class="empty">No risks yet.</td></tr>`}</tbody>
      </table>
    </div>

    <h3 class="section-title" id="rd-sources">Sources</h3>
    <ul class="rows sources">${sourcesHtml(ctx, s)}</ul>`;

  bind(ctx, el);
  applyFocus(ctx, el);
}

function addForm(ctx) {
  const today = toDateInput(new Date().toISOString());
  const forms = {
    file: `
      <label>File<input name="file" type="file" required></label>
      <label>Title <span class="muted small">(optional)</span><input name="title" maxlength="200" placeholder="Defaults to the file name"></label>
      <label class="full">What should MinuteMate know? <span class="muted small">(optional)</span>
        <textarea name="notes" rows="2" placeholder="e.g. Vendor's statement of work for the API integration"></textarea></label>
      <p class="muted small full">Saved to <strong>Documents › MinuteMate Artifacts</strong> on your project site (up to 4 MB). Word, PDF, PowerPoint and text files work best.</p>`,
    link: `
      <label>Link<input name="url" type="url" required placeholder="https://contoso.sharepoint.com/..."></label>
      <label>Title<input name="title" required maxlength="200" placeholder="e.g. Localization handoff checklist"></label>
      <label class="full">Notes <span class="muted small">(optional)</span>
        <textarea name="notes" rows="2" placeholder="Paste the key text so MinuteMate can assess it. For a document, upload the file instead."></textarea></label>`,
    notes: `
      <label>Meeting title<input name="title" required maxlength="200" placeholder="e.g. Vendor API checkpoint"></label>
      <label>Meeting date<input name="date" type="date" required value="${today}"></label>
      <label class="full">Notes or transcript<textarea name="notes" rows="5" required placeholder="Paste the notes or the Teams recap"></textarea></label>
      <p class="muted small full">Meeting notes also give you action items and decisions. You'll find the meeting on the Meetings tab.</p>`
  };
  return `<form class="form-grid" data-form="artifact">${forms[addMode]}
    <div class="form-actions"><button class="btn primary" type="submit">Add and assess</button></div></form>`;
}

function sourceHtml(ctx, x) {
  const src = sourceOf(ctx, x);
  if (!src) return `<span class="sub">Added by hand</span>`;
  return `<button class="linkish src" data-src-kind="${src.kind}" data-src-id="${esc(src.id)}">${src.kind === "meeting" ? "From meeting" : "From"}: ${esc(src.label)}</button>`;
}

function attentionRow(ctx, a) {
  if (a.kind === "conflict") {
    return `<li><button class="row-title plain" data-go="timeline"><span>${a.html}<br><span class="sub">Timeline dependency · open the Timeline to replan</span></span></button>${pill(a.status)}</li>`;
  }
  const item = (ctx.items(a.kind === "risk" ? "risks" : "dependencies")).find((x) => x.id === a.id);
  const src = item && sourceOf(ctx, item);
  return `<li><button class="row-title plain" data-focus-kind="${a.kind}" data-focus-id="${esc(a.id)}">
      <span>${esc(a.title)} <span class="kind-tag">${a.kind === "risk" ? "Risk" : "Dependency"}</span><br>
      <span class="sub">${esc(a.why)}${src ? ` · ${esc(src.label)}` : ""}</span></span></button>${pill(a.status)}</li>`;
}

function depRow(ctx, d, milestones) {
  const late = openDep(d) && isPast(d.NeededBy);
  const meta = [d.DependencyType, d.ProvidedBy ? `from ${d.ProvidedBy}` : "", d.OwnerEmail ? `tracked by ${d.OwnerEmail}` : ""].filter(Boolean).join(" · ");
  return `<tr data-kind="dependency" data-id="${esc(d.id)}" class="${late ? "late" : ""}">
    <td class="t-title">${esc(d.Title)}${late ? ` ${pill("Overdue")}` : ""}
      ${meta ? `<div class="sub">${esc(meta)}</div>` : ""}
      ${d.Details ? `<div class="sub">${esc(d.Details)}</div>` : ""}
      <div class="sub">${sourceHtml(ctx, d)}</div></td>
    <td><input type="date" data-list="dependencies" data-field="NeededBy" value="${toDateInput(d.NeededBy)}" aria-label="Needed by">
      ${d.NeededBy && openDep(d) ? `<div class="sub">${esc(dueText(d.NeededBy))}</div>` : ""}</td>
    <td><select data-list="dependencies" data-field="RelatedMilestoneLookupId" aria-label="Milestone it affects">
      <option value="">Not linked</option>
      ${milestones.map((m) => `<option value="${esc(m.id)}" ${d.RelatedMilestoneLookupId === m.id ? "selected" : ""}>${esc(m.Title)}</option>`).join("")}
    </select></td>
    <td><select data-list="dependencies" data-field="Impact" aria-label="Impact">${LEVELS.map((o) => `<option ${d.Impact === o ? "selected" : ""}>${o}</option>`).join("")}</select></td>
    <td><select data-list="dependencies" data-field="DependencyStatus" aria-label="Status">${DEP_STATUSES.map((o) => `<option ${d.DependencyStatus === o ? "selected" : ""}>${o}</option>`).join("")}</select></td>
    <td><button class="icon-btn" data-act="delete" data-list="dependencies" title="Delete" aria-label="Delete dependency">✕</button></td>
  </tr>`;
}

function riskRow(ctx, r) {
  return `<tr data-kind="risk" data-id="${esc(r.id)}">
    <td class="t-title">${esc(r.Title)}
      ${r.Mitigation ? `<div class="sub">Mitigation: ${esc(r.Mitigation)}</div>` : `<div class="sub">No mitigation yet</div>`}
      <div class="sub">${sourceHtml(ctx, r)}</div></td>
    <td><select data-list="risks" data-field="Impact" aria-label="Impact">${LEVELS.map((o) => `<option ${r.Impact === o ? "selected" : ""}>${o}</option>`).join("")}</select></td>
    <td><select data-list="risks" data-field="Likelihood" aria-label="Likelihood">${LEVELS.map((o) => `<option ${r.Likelihood === o ? "selected" : ""}>${o}</option>`).join("")}</select></td>
    <td><select data-list="risks" data-field="RiskStatus" aria-label="Status">${RISK_STATUSES.map((o) => `<option ${r.RiskStatus === o ? "selected" : ""}>${o}</option>`).join("")}</select></td>
    <td><button class="icon-btn" data-act="delete" data-list="risks" title="Delete" aria-label="Delete risk">✕</button></td>
  </tr>`;
}

// Artifacts plus the project's meetings that produced risks or dependencies (or were pasted here).
function sourcesHtml(ctx, s) {
  const found = (key, id) => {
    const r = s.risks.filter((x) => x[key] === id).length, d = s.deps.filter((x) => x[key] === id).length;
    return `Found ${plural(d, "dependency", "dependencies")} · ${plural(r, "risk")}`;
  };
  const artifacts = ctx.items("artifacts").map((a) => ({ when: a.Created || a.LastAssessed || "", html: `
    <li data-kind="artifact" data-id="${esc(a.id)}">
      <span>${a.LinkUrl ? `<a href="${esc(a.LinkUrl)}" target="_blank" rel="noopener">${esc(a.Title)} ↗</a>` : esc(a.Title)} <span class="kind-tag">${esc(a.ArtifactType || "Link")}</span><br>
        <span class="sub">${a.Created ? `Added ${esc(fmtShort(a.Created))}` : ""}${a.AddedByEmail ? ` by ${esc(a.AddedByEmail)}` : ""} · ${esc(found("SourceArtifactLookupId", a.id))}</span>
        ${a.AssessmentSummary ? `<br><span class="sub">${esc(a.AssessmentSummary)}</span>` : ""}</span>
      <span class="row-end">${pill(a.AssessmentStatus)} <button class="btn ghost small" data-act="reassess" data-id="${esc(a.id)}">Assess again</button></span>
    </li>` }));
  const meetings = ctx.items("meetings")
    .filter((m) => m.CaptureMode === "Pasted notes" || s.risks.some((x) => x.SourceMeetingLookupId === m.id) || s.deps.some((x) => x.SourceMeetingLookupId === m.id))
    .map((m) => ({ when: m.MeetingStart || m.MeetingDate || "", html: `
    <li data-kind="meeting" data-id="${esc(m.id)}">
      <span><button class="linkish src" data-src-kind="meeting" data-src-id="${esc(m.id)}">${esc(m.Title)}</button> <span class="kind-tag">Meeting</span><br>
        <span class="sub">${esc(fmtShort(m.MeetingStart || m.MeetingDate))} · ${esc(found("SourceMeetingLookupId", m.id))}</span></span>
      <span class="row-end">${pill(m.ProcessingStatus)}</span>
    </li>` }));
  const all = [...artifacts, ...meetings].sort((a, b) => b.when.localeCompare(a.when));
  return all.length ? all.map((x) => x.html).join("") : `<li class="empty">Files, links and meeting notes you add show up here with what MinuteMate found in each.</li>`;
}

// Demo mode: assess right away with the rule-based stand-in, so the demo shows the full loop.
async function demoAssess(ctx, src) {
  const p = ctx.project();
  const pid = Number(p.id) || p.id;
  const r = assessText(`${src.title}. ${src.text || ""}`, ctx.items("milestones"));
  const link = src.artifactId ? { SourceArtifactLookupId: src.artifactId } : { SourceMeetingLookupId: src.meetingId };
  for (const d of r.dependencies) await ctx.data.create("dependencies", { ...d, ...link, ProjectLookupId: pid, OwnerEmail: ctx.state.me?.email || "" });
  for (const x of r.risks) await ctx.data.create("risks", { ...x, ...link, ProjectLookupId: pid });
  const found = r.dependencies.length + r.risks.length;
  if (src.artifactId) await ctx.data.update("artifacts", src.artifactId, { AssessmentStatus: found ? "Assessed" : "Needs review", AssessmentSummary: r.summary, LastAssessed: new Date().toISOString() });
  else await ctx.data.update("meetings", src.meetingId, { ProcessingStatus: found ? "Done" : "Needs review", Summary: r.summary });
  return found;
}

const reloadAll = (ctx) => ctx.reload(["artifacts", "dependencies", "risks", "meetings"]);

function bind(ctx, el) {
  const rerender = () => ctx.render();
  const p = ctx.project();
  const pid = Number(p.id) || p.id;

  el.querySelector('[data-act="refresh"]').addEventListener("click", (e) => busy(e.target, async () => { await reloadAll(ctx); rerender(); toast("Refreshed"); }));
  el.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { addMode = b.dataset.mode; rerender(); el.querySelector("#rd-add input, #rd-add textarea")?.focus(); }));
  el.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.jump === "timeline") return ctx.selectTab("timeline");
    el.querySelector(`#rd-${b.dataset.jump}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  el.querySelector('[data-f="closed"]').addEventListener("change", (e) => { showClosed = e.target.checked; rerender(); });

  el.querySelector('[data-form="artifact"]').addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = ev.target;
    busy(f.querySelector('button[type="submit"]'), async () => {
      const notes = f.notes?.value.trim() || "";
      const me = ctx.state.me?.email || "";
      if (addMode === "notes") {
        const when = fromDateInput(f.date.value);
        const { id } = await ctx.data.create("meetings", { Title: f.title.value.trim(), ProjectLookupId: pid, MeetingDate: when, MeetingStart: when,
          RawNotes: notes, CaptureMode: "Pasted notes", ProcessingStatus: "New" });
        if (ctx.demo) { const n = await demoAssess(ctx, { meetingId: id, title: f.title.value, text: notes }); toast(n ? `Found ${n} item${n > 1 ? "s" : ""} in the notes` : "Nothing clear found; marked for review"); }
        else toast("Notes added. MinuteMate processes them in a minute or two; select Refresh to see what it found.");
      } else {
        let fields;
        if (addMode === "file") {
          const file = f.file.files[0];
          if (!file) return;
          const text = TEXT_FILE.test(file.name) || file.type.startsWith("text/") ? (await file.text()).slice(0, 60000) : "";
          const up = await ctx.data.uploadFile(file, p.ProjectCode || p.Title);
          fields = { Title: f.title.value.trim() || file.name, ArtifactType: "File", FileName: up.name, LinkUrl: up.url, Content: [notes, text].filter(Boolean).join("\n\n") };
        } else {
          fields = { Title: f.title.value.trim(), ArtifactType: "Link", LinkUrl: f.url.value.trim(), Content: notes };
        }
        const { id } = await ctx.data.create("artifacts", { ...fields, ProjectLookupId: pid, AssessmentStatus: "New", AddedByEmail: me });
        if (ctx.demo) { const n = await demoAssess(ctx, { artifactId: id, title: fields.Title, text: fields.Content }); toast(n ? `Assessed: found ${n} item${n > 1 ? "s" : ""}` : "Nothing clear found; marked for review. Add a short note about what's inside."); }
        else toast("Added. MinuteMate assesses it in a minute or two; select Refresh to see what it found.");
        ctx.state.focus = { kind: "artifact", id };
      }
      f.reset();
      await reloadAll(ctx); rerender();
    });
  });

  el.querySelectorAll('[data-act="reassess"]').forEach((b) => b.addEventListener("click", () => busy(b, async () => {
    const a = ctx.items("artifacts").find((x) => x.id === b.dataset.id);
    if (ctx.demo) {
      // The demo replaces what it found before; the real flow updates matches instead of adding duplicates.
      for (const key of ["dependencies", "risks"]) for (const x of ctx.items(key).filter((x) => x.SourceArtifactLookupId === a.id)) await ctx.data.remove(key, x.id);
      const n = await demoAssess(ctx, { artifactId: a.id, title: a.Title, text: a.Content });
      toast(`Assessed again: ${n} item${n === 1 ? "" : "s"}`);
    } else {
      await ctx.data.update("artifacts", a.id, { AssessmentStatus: "New" });
      toast("MinuteMate will assess it again in a minute or two.");
    }
    ctx.state.focus = { kind: "artifact", id: a.id };
    await reloadAll(ctx); rerender();
  })));

  const addTo = (key, sel, toFields, label) => el.querySelector(sel).addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = ev.target;
    busy(f.querySelector('button[type="submit"]'), async () => {
      const { id } = await ctx.data.create(key, { ...toFields(f), ProjectLookupId: pid });
      ctx.state.focus = { kind: key === "risks" ? "risk" : "dependency", id };
      await ctx.reload([key]); rerender(); toast(`${label} added`);
    });
  });
  addTo("dependencies", '[data-form="dep"]', (f) => ({ Title: f.title.value.trim(), ProvidedBy: f.by.value.trim(), DependencyType: f.type.value,
    NeededBy: fromDateInput(f.needed.value), DependencyStatus: "Open", Impact: "Medium", OwnerEmail: ctx.state.me?.email || "" }), "Dependency");
  addTo("risks", '[data-form="risk"]', (f) => ({ Title: f.title.value.trim(), Mitigation: f.mitigation.value.trim(), Impact: f.impact.value,
    Likelihood: f.likelihood.value, RiskStatus: "Open" }), "Risk");

  el.querySelectorAll("tbody [data-field]").forEach((input) => input.addEventListener("change", () => {
    const tr = input.closest("tr");
    const field = input.dataset.field;
    let value = input.type === "date" ? fromDateInput(input.value) : input.value;
    if (field.endsWith("LookupId")) value = value ? Number(value) || value : null;
    busy(input, async () => {
      await ctx.data.update(input.dataset.list, tr.dataset.id, { [field]: value });
      ctx.state.focus = { kind: tr.dataset.kind, id: tr.dataset.id, quiet: true };
      await ctx.reload([input.dataset.list]); rerender(); toast("Saved");
    });
  }));

  el.querySelectorAll('[data-act="delete"]').forEach((b) => b.addEventListener("click", () => {
    const tr = b.closest("tr");
    if (!ctx.cfg.demoOnly && !confirm(`Delete "${tr.querySelector(".t-title").firstChild.textContent.trim()}"?`)) return;
    busy(b, async () => { await ctx.data.remove(b.dataset.list, tr.dataset.id); await ctx.reload([b.dataset.list]); rerender(); toast("Deleted"); });
  }));

  el.querySelectorAll("[data-focus-kind]").forEach((b) => b.addEventListener("click", () => {
    ctx.state.focus = { kind: b.dataset.focusKind, id: b.dataset.focusId };
    applyFocus(ctx, el);
  }));
  el.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => ctx.selectTab(b.dataset.go)));
  el.querySelectorAll(".src").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.srcKind === "meeting") {
      ctx.state.openMeetingId = b.dataset.srcId;
      ctx.state.scrollToMeeting = true;
      ctx.selectTab("meetings");
    } else {
      ctx.state.focus = { kind: "artifact", id: b.dataset.srcId };
      applyFocus(ctx, el);
    }
  }));
}

// Scroll to and briefly highlight the focused item or section.
function applyFocus(ctx, el) {
  const f = ctx.state.focus;
  if (!f) return;
  ctx.state.focus = null;
  const target = f.section ? el.querySelector(`#rd-${f.section}`)
    : el.querySelector(`[data-kind="${f.kind}"][data-id="${CSS.escape(f.id)}"]`);
  if (!target) return;
  if (f.quiet) return;
  target.scrollIntoView({ behavior: "smooth", block: f.section ? "start" : "center" });
  target.classList.remove("flash");
  void target.offsetWidth;
  target.classList.add("flash");
  setTimeout(() => target.classList.remove("flash"), 2600);
}
