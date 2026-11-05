// Timeline (Phase 4): milestones by workstream, dependency arrows, today line,
// and a list of dependency problems (a milestone starts before something it depends on is due).
import { esc, pill, toast, busy, isPast, toDateInput, fromDateInput, fmtShort, DAY } from "../ui.js";

const ROW = 34, HEAD = 34, LABEL = 210, PAD = 16;
let editingId = null;

const t = (iso) => new Date(new Date(iso).toDateString()).getTime();
const startOf = (m) => m.StartDate || m.DueDate;

export function findIssues(ms) {
  const byId = new Map(ms.map((m) => [m.id, m]));
  const issues = [];
  for (const m of ms) {
    for (const depId of m.DependsOnIds || []) {
      const d = byId.get(depId);
      if (!d || !d.DueDate || !startOf(m)) continue;
      const gap = Math.round((t(d.DueDate) - t(startOf(m))) / DAY);
      if (gap > 0 && m.MilestoneStatus !== "Done") {
        issues.push({ kind: "overlap", from: d, to: m, days: gap,
          text: `<strong>${esc(m.Title)}</strong> starts ${esc(fmtShort(startOf(m)))}, but <strong>${esc(d.Title)}</strong> isn't due until ${esc(fmtShort(d.DueDate))} (${gap} day${gap > 1 ? "s" : ""} overlap).` });
      }
    }
    const dependents = ms.filter((x) => (x.DependsOnIds || []).includes(m.id));
    if (m.MilestoneStatus !== "Done" && (isPast(m.DueDate) || m.MilestoneStatus === "Blocked") && dependents.length) {
      issues.push({ kind: "late", from: m, text: `<strong>${esc(m.Title)}</strong> is ${m.MilestoneStatus === "Blocked" ? "blocked" : "late"} and ${dependents.length} milestone${dependents.length > 1 ? "s depend" : " depends"} on it: ${dependents.map((x) => esc(x.Title)).join(", ")}.` });
    }
  }
  return issues;
}

export function render(ctx, el) {
  if (!ctx.project()) { el.innerHTML = `<p class="empty">Kick off or create a project first.</p>`; return; }
  const ms = ctx.items("milestones").filter((m) => m.DueDate);
  const issues = findIssues(ms);
  const editing = ms.find((m) => m.id === editingId) || null;

  el.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>Timeline and dependencies</h2>
        <p class="muted">Bars run from start to due date. Arrows show what each milestone waits on; red arrows mean it starts before its dependency is due. Click a bar to edit it.</p>
      </div>
    </div>
    <div class="legend">
      <span><i class="sw done"></i>Done</span><span><i class="sw progress"></i>In progress</span>
      <span><i class="sw todo"></i>Not started</span><span><i class="sw blocked"></i>Blocked or late</span>
      <span><i class="sw gate"></i>Gate</span><span><i class="sw conflict"></i>Dependency conflict</span>
    </div>
    <div class="gantt-wrap" id="ganttWrap">${ms.length ? "" : `<p class="empty">No milestones yet. Add the first one below, or use the kickoff kit to start from a template.</p>`}</div>

    <h3 class="section-title">Dependency check</h3>
    <ul class="rows issues">${issues.length ? issues.map((i) => `<li><span>${i.text}</span>${pill(i.kind === "overlap" ? "At risk" : "Blocked")}</li>`).join("") : `<li class="empty">No dependency problems found.</li>`}</ul>

    <h3 class="section-title">${editing ? `Edit: ${esc(editing.Title)}` : "Add a milestone"}</h3>
    <form class="form-grid" data-form="ms">
      <label>Milestone<input name="title" required maxlength="255" value="${esc(editing?.Title || "")}"></label>
      <label>Workstream<input name="workstream" list="wsList" value="${esc(editing?.Workstream || "")}" placeholder="e.g. Engineering"></label>
      <datalist id="wsList">${[...new Set(ms.map((m) => m.Workstream).filter(Boolean))].map((w) => `<option value="${esc(w)}">`).join("")}</datalist>
      <label>Start<input name="start" type="date" value="${toDateInput(editing?.StartDate)}"></label>
      <label>Due<input name="due" type="date" required value="${toDateInput(editing?.DueDate)}"></label>
      <label>Owner email<input name="owner" type="email" list="peopleList" autocomplete="off" value="${esc(editing?.OwnerEmail || "")}"></label>
      <label>Status<select name="status">${["Not started", "In progress", "Blocked", "Done"].map((s) => `<option ${editing?.MilestoneStatus === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <fieldset class="deps"><legend>Depends on</legend>
        ${ms.filter((m) => m.id !== editingId).map((m) => `<label class="radio"><input type="checkbox" name="deps" value="${esc(m.id)}" ${editing?.DependsOnIds?.includes(m.id) ? "checked" : ""}> ${esc(m.Title)}</label>`).join("") || `<span class="muted small">Nothing to depend on yet.</span>`}
      </fieldset>
      <label class="switch"><input type="checkbox" name="gate" ${editing?.IsGate ? "checked" : ""}> <span>This is a gate (a go/no-go or sign-off point)</span></label>
      <div class="form-actions">
        ${editing ? `<button class="btn ghost" type="button" data-act="cancel">Cancel</button>` : ""}
        <button class="btn primary" type="submit">${editing ? "Save milestone" : "Add milestone"}</button>
      </div>
    </form>`;

  if (ms.length) drawGantt(el.querySelector("#ganttWrap"), ms, issues);
  bind(ctx, el, editing);
}

function drawGantt(wrap, ms, issues) {
  const LBL = Math.round(Math.min(LABEL, wrap.clientWidth * 0.42));
  const lanes = [...new Set(ms.map((m) => m.Workstream || "General"))];
  const rows = [];
  lanes.forEach((lane) => {
    rows.push({ lane });
    ms.filter((m) => (m.Workstream || "General") === lane).sort((a, b) => t(startOf(a)) - t(startOf(b))).forEach((m) => rows.push({ m }));
  });
  const min = Math.min(...ms.map((m) => t(startOf(m))), t(new Date())) - 3 * DAY;
  const max = Math.max(...ms.map((m) => t(m.DueDate)), t(new Date())) + 5 * DAY;
  const days = Math.round((max - min) / DAY);
  const avail = Math.max(wrap.clientWidth - LBL - PAD - 2, 240);
  const pxDay = Math.max(14, avail / days);
  const W = days * pxDay + PAD;
  const H = HEAD + rows.length * ROW + 8;
  const x = (iso) => ((t(iso) - min) / DAY) * pxDay;
  const yOf = new Map();
  rows.forEach((r, i) => r.m && yOf.set(r.m.id, HEAD + i * ROW + ROW / 2));
  const conflictPairs = new Set(issues.filter((i) => i.kind === "overlap").map((i) => `${i.from.id}>${i.to.id}`));
  const maxChars = Math.max(10, Math.floor((LBL - 26) / 7));

  // fixed label column
  let labels = `<svg class="gantt" width="${LBL}" height="${H}" aria-hidden="true">`;
  rows.forEach((r, i) => {
    const y = HEAD + i * ROW;
    if (r.lane) labels += `<rect class="lane-bg" x="0" y="${y}" width="${LBL}" height="${ROW}"/><text class="lane" x="10" y="${y + ROW / 2 + 5}">${esc(r.lane)}</text>`;
    else labels += `<text class="label" x="16" y="${y + ROW / 2 + 4}">${esc(r.m.Title.length > maxChars ? r.m.Title.slice(0, maxChars - 1) + "…" : r.m.Title)}<title>${esc(r.m.Title)}</title></text>`;
  });
  labels += `</svg>`;

  // scrolling chart
  let svg = `<svg class="gantt" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Milestone timeline">`;
  rows.forEach((r, i) => { if (r.lane) svg += `<rect class="lane-bg" x="0" y="${HEAD + i * ROW}" width="${W}" height="${ROW}"/>`; });
  for (let d = min; d <= max; d += DAY) {
    const day = new Date(d);
    if (day.getDay() !== 1) continue;
    const gx = ((d - min) / DAY) * pxDay;
    svg += `<line class="grid-line" x1="${gx}" y1="${HEAD - 6}" x2="${gx}" y2="${H}"/><text class="axis" x="${gx + 3}" y="${HEAD - 12}">${esc(fmtShort(day.toISOString()))}</text>`;
  }
  svg += `<defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="arrow-head"/></marker>
    <marker id="arrBad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="arrow-head bad"/></marker></defs>`;
  for (const m of ms) {
    for (const depId of m.DependsOnIds || []) {
      const d = ms.find((z) => z.id === depId);
      if (!d) continue;
      const x1 = x(d.DueDate) + pxDay, y1 = yOf.get(d.id), x2 = x(startOf(m)) - 2, y2 = yOf.get(m.id);
      const bad = conflictPairs.has(`${d.id}>${m.id}`);
      const mid = bad ? x1 + 8 : Math.max(x1 + 8, Math.min(x2 - 8, x1 + 14));
      const path = bad ? `M${x1},${y1} H${mid} V${y2 - 13} H${x2 - 8} V${y2} H${x2}` : `M${x1},${y1} H${mid} V${y2} H${x2}`;
      svg += `<path class="dep ${bad ? "bad" : ""}" d="${path}" marker-end="url(#${bad ? "arrBad" : "arr"})"/>`;
    }
  }
  for (const m of ms) {
    const y = yOf.get(m.id);
    const late = m.MilestoneStatus !== "Done" && isPast(m.DueDate);
    const cls = m.MilestoneStatus === "Done" ? "done" : m.MilestoneStatus === "Blocked" || late ? "blocked" : m.MilestoneStatus === "In progress" ? "progress" : "todo";
    const tip = `${m.Title} · ${fmtShort(startOf(m))} → ${fmtShort(m.DueDate)} · ${m.MilestoneStatus || "Not started"}${m.OwnerEmail ? " · " + m.OwnerEmail : ""}`;
    if (m.IsGate || t(startOf(m)) === t(m.DueDate)) {
      const cx = x(m.DueDate) + pxDay / 2;
      svg += `<path class="bar gate ${cls}" data-id="${esc(m.id)}" tabindex="0" aria-label="${esc(tip)}" d="M${cx},${y - 9} L${cx + 9},${y} L${cx},${y + 9} L${cx - 9},${y} Z"><title>${esc(tip)}</title></path>`;
    } else {
      const bx = x(startOf(m)), bw = Math.max(pxDay, x(m.DueDate) + pxDay - bx);
      svg += `<rect class="bar ${cls}" data-id="${esc(m.id)}" tabindex="0" aria-label="${esc(tip)}" x="${bx}" y="${y - 9}" width="${bw}" height="18" rx="5"><title>${esc(tip)}</title></rect>`;
    }
  }
  const tx = ((t(new Date()) - min) / DAY) * pxDay;
  svg += `<line class="today" x1="${tx}" y1="${HEAD - 6}" x2="${tx}" y2="${H}"/><text class="today-label" x="${tx + 4}" y="${H - 6}">Today</text></svg>`;

  wrap.innerHTML = `<div class="gantt-frame"><div class="gantt-labels">${labels}</div><div class="gantt-scroll">${svg}</div></div>`;
  const sc = wrap.querySelector(".gantt-scroll");
  sc.scrollLeft = Math.max(0, tx - sc.clientWidth / 3);
}

function bind(ctx, el, editing) {
  el.querySelectorAll(".bar[data-id]").forEach((b) => {
    const open = () => { editingId = b.dataset.id; ctx.render(); el.querySelector('[data-form="ms"]').scrollIntoView({ behavior: "smooth", block: "start" }); };
    b.addEventListener("click", open);
    b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
  el.querySelector('[data-act="cancel"]')?.addEventListener("click", () => { editingId = null; ctx.render(); });
  el.querySelector('[data-form="ms"]').addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const p = ctx.project();
    const deps = [...f.querySelectorAll('input[name="deps"]:checked')].map((i) => i.value);
    const fields = {
      Title: f.title.value.trim(), Workstream: f.workstream.value.trim() || "General",
      StartDate: fromDateInput(f.start.value || f.due.value), DueDate: fromDateInput(f.due.value),
      OwnerEmail: f.owner.value.trim(), MilestoneStatus: f.status.value, IsGate: f.gate.checked
    };
    busy(f.querySelector('button[type="submit"]'), async () => {
      let id = editing?.id;
      if (id) await ctx.data.update("milestones", id, fields);
      else id = (await ctx.data.create("milestones", { ...fields, ProjectLookupId: Number(p.id) || p.id })).id;
      await ctx.data.setDeps(id, deps);
      editingId = null;
      await ctx.reload(["milestones"]); ctx.render();
      toast(editing ? "Milestone saved" : "Milestone added");
    });
  });
}
