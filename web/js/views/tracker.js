// Tracker (Phase 4): one editable table for action items, risks, decisions and milestones.
// Filter, change status/priority/dates inline, add items, and export to CSV.
import { esc, pill, toast, busy, isPast, toDateInput, fromDateInput, fmtShort, csvDownload } from "../ui.js";

const LEVELS = ["High", "Medium", "Low"];
const TYPES = {
  actions: {
    label: "Action items", statusField: "ItemStatus", statuses: ["Not started", "In progress", "Blocked", "Done"], doneValues: ["Done"],
    dueField: "DueDate",
    columns: [
      { label: "Action", get: (x) => x.Title, kind: "title",
        sub: (x) => [x.Source === "Meeting" ? "From a meeting" : "", Number(x.SeenInMeetings) > 1 ? `raised in ${x.SeenInMeetings} meetings` : ""].filter(Boolean).join(" · "),
        link: (x) => x.ExternalLink?.Url },
      { label: "Owner", get: (x) => x.OwnerAsWritten || x.OwnerEmail || "—" },
      { label: "Due", field: "DueDate", kind: "date" },
      { label: "Priority", field: "Priority", kind: "select", options: LEVELS },
      { label: "Status", field: "ItemStatus", kind: "select", options: ["Not started", "In progress", "Blocked", "Done"] }
    ],
    form: `<input name="title" placeholder="New action item" required maxlength="255">
           <input name="owner" type="email" placeholder="Owner email" list="peopleList" autocomplete="off">
           <input name="due" type="date" aria-label="Due date">
           <select name="priority" aria-label="Priority"><option>Medium</option><option>High</option><option>Low</option></select>`,
    toFields: (f) => ({ Title: f.title.value.trim(), OwnerEmail: f.owner.value.trim(), OwnerAsWritten: f.owner.value.trim(),
      DueDate: fromDateInput(f.due.value), Priority: f.priority.value, ItemStatus: "Not started", NotifyVia: "Project default", Notified: false, Source: "Manual" })
  },
  risks: {
    label: "Risks", statusField: "RiskStatus", statuses: ["Open", "Mitigating", "Closed"], doneValues: ["Closed"],
    columns: [
      { label: "Risk", get: (x) => x.Title, kind: "title", sub: (x) => x.Mitigation },
      { label: "Impact", field: "Impact", kind: "select", options: LEVELS },
      { label: "Likelihood", field: "Likelihood", kind: "select", options: LEVELS },
      { label: "Status", field: "RiskStatus", kind: "select", options: ["Open", "Mitigating", "Closed"] }
    ],
    form: `<input name="title" placeholder="New risk" required maxlength="255">
           <input name="mitigation" placeholder="Mitigation">
           <select name="impact" aria-label="Impact"><option>Medium</option><option>High</option><option>Low</option></select>
           <select name="likelihood" aria-label="Likelihood"><option>Medium</option><option>High</option><option>Low</option></select>`,
    toFields: (f) => ({ Title: f.title.value.trim(), Mitigation: f.mitigation.value.trim(), Impact: f.impact.value, Likelihood: f.likelihood.value, RiskStatus: "Open" })
  },
  decisions: {
    label: "Decisions", statusField: null, statuses: [], doneValues: [],
    columns: [
      { label: "Decision", get: (x) => x.Title, kind: "title", sub: (x) => x.Rationale },
      { label: "Decided by", get: (x) => x.DecidedBy || "—" },
      { label: "Date", field: "DecisionDate", kind: "date" }
    ],
    form: `<input name="title" placeholder="New decision" required maxlength="255">
           <input name="by" placeholder="Decided by">
           <input name="rationale" placeholder="Rationale">
           <input name="date" type="date" aria-label="Decision date">`,
    toFields: (f) => ({ Title: f.title.value.trim(), DecidedBy: f.by.value.trim(), Rationale: f.rationale.value.trim(),
      DecisionDate: fromDateInput(f.date.value) || new Date().toISOString() })
  },
  milestones: {
    label: "Milestones", statusField: "MilestoneStatus", statuses: ["Not started", "In progress", "Blocked", "Done"], doneValues: ["Done"],
    dueField: "DueDate",
    columns: [
      { label: "Milestone", get: (x) => x.Title, kind: "title", sub: (x) => x.Workstream },
      { label: "Start", field: "StartDate", kind: "date" },
      { label: "Due", field: "DueDate", kind: "date" },
      { label: "Status", field: "MilestoneStatus", kind: "select", options: ["Not started", "In progress", "Blocked", "Done"] }
    ],
    form: `<input name="title" placeholder="New milestone" required maxlength="255">
           <input name="workstream" placeholder="Workstream">
           <input name="start" type="date" aria-label="Start date">
           <input name="due" type="date" aria-label="Due date" required>`,
    toFields: (f) => ({ Title: f.title.value.trim(), Workstream: f.workstream.value.trim() || "General",
      StartDate: fromDateInput(f.start.value || f.due.value), DueDate: fromDateInput(f.due.value), MilestoneStatus: "Not started" })
  }
};

const ui = { type: "actions", q: "", status: "open", lateOnly: false };

export function render(ctx, el) {
  if (!ctx.project()) { el.innerHTML = `<p class="empty">Kick off or create a project first.</p>`; return; }
  const T = TYPES[ui.type];
  const all = ctx.items(ui.type);
  const rows = filtered(all, T);

  el.innerHTML = `
    <div class="segmented" role="tablist" aria-label="Tracker type">
      ${Object.entries(TYPES).map(([k, t]) => `<button data-type="${k}" aria-selected="${k === ui.type}">${t.label} <span class="count">${ctx.items(k).filter((x) => !t.doneValues.includes(x[t.statusField])).length}</span></button>`).join("")}
    </div>

    <form class="add-row" data-form="add">${T.form}<button class="btn primary small" type="submit">Add</button></form>

    <div class="filters">
      <input type="search" placeholder="Search" value="${esc(ui.q)}" data-f="q" aria-label="Search">
      ${T.statusField ? `<select data-f="status" aria-label="Status filter">
        <option value="open" ${ui.status === "open" ? "selected" : ""}>Open</option>
        <option value="all" ${ui.status === "all" ? "selected" : ""}>All</option>
        ${T.statuses.map((s) => `<option ${ui.status === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
      </select>` : ""}
      ${T.dueField ? `<label class="check"><input type="checkbox" data-f="late" ${ui.lateOnly ? "checked" : ""}> Overdue only</label>` : ""}
      <span class="spacer"></span>
      <span class="muted small">${rows.length} of ${all.length}</span>
      <button class="btn ghost small" data-act="csv">Export CSV</button>
    </div>

    <div class="table-wrap">
      <table class="grid">
        <thead><tr>${T.columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}<th aria-label="Actions"></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map((x) => rowHtml(x, T)).join("") : `<tr><td colspan="${T.columns.length + 1}" class="empty">Nothing here. Add one above, or capture a meeting and MinuteMate will fill this in.</td></tr>`}
        </tbody>
      </table>
    </div>`;

  bind(ctx, el, T, rows);
}

function filtered(all, T) {
  const q = ui.q.toLowerCase();
  return all
    .filter((x) => !q || Object.values(x).some((v) => typeof v === "string" && v.toLowerCase().includes(q)))
    .filter((x) => !T.statusField || ui.status === "all" || (ui.status === "open" ? !T.doneValues.includes(x[T.statusField]) : x[T.statusField] === ui.status))
    .filter((x) => !ui.lateOnly || (T.dueField && isPast(x[T.dueField]) && !T.doneValues.includes(x[T.statusField])))
    .sort((a, b) => (a[T.dueField || "DecisionDate"] || "9").localeCompare(b[T.dueField || "DecisionDate"] || "9"));
}

function rowHtml(x, T) {
  const late = T.dueField && isPast(x[T.dueField]) && !T.doneValues.includes(x[T.statusField]);
  return `<tr data-id="${esc(x.id)}" class="${late ? "late" : ""}">
    ${T.columns.map((c) => {
      if (c.kind === "title") {
        const link = c.link && c.link(x);
        const extras = [link ? `<a class="ext" href="${esc(link)}" target="_blank" rel="noopener">Open in tracker ↗</a>` : "", x.SyncState === "Error" ? pill("Sync error") : ""].filter(Boolean).join(" ");
        return `<td class="t-title">${esc(c.get(x))}${late ? ` ${pill("Overdue")}` : ""}${c.sub && c.sub(x) ? `<div class="sub">${esc(c.sub(x))}</div>` : ""}${extras ? `<div class="sub">${extras}</div>` : ""}</td>`;
      }
      if (c.kind === "date") return `<td><input type="date" data-field="${c.field}" value="${toDateInput(x[c.field])}" aria-label="${esc(c.label)}"></td>`;
      if (c.kind === "select") return `<td><select data-field="${c.field}" aria-label="${esc(c.label)}">${c.options.map((o) => `<option ${x[c.field] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></td>`;
      return `<td>${esc(c.get(x))}</td>`;
    }).join("")}
    <td><button class="icon-btn" data-act="delete" title="Delete" aria-label="Delete">✕</button></td>
  </tr>`;
}

function bind(ctx, el, T, rows) {
  const rerender = () => ctx.render();
  el.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => { ui.type = b.dataset.type; ui.status = "open"; ui.lateOnly = false; rerender(); }));

  const q = el.querySelector('[data-f="q"]');
  q.addEventListener("input", () => { ui.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { rerender(); const n = el.querySelector('[data-f="q"]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
  el.querySelector('[data-f="status"]')?.addEventListener("change", (e) => { ui.status = e.target.value; rerender(); });
  el.querySelector('[data-f="late"]')?.addEventListener("change", (e) => { ui.lateOnly = e.target.checked; rerender(); });

  el.querySelector('[data-form="add"]').addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const p = ctx.project();
    busy(f.querySelector('button[type="submit"]'), async () => {
      await ctx.data.create(ui.type, { ...T.toFields(f), ProjectLookupId: Number(p.id) || p.id });
      await ctx.reload([ui.type]); rerender(); toast(`${T.label.replace(/s$/, "")} added`);
    });
  });

  el.querySelectorAll("tbody [data-field]").forEach((input) => input.addEventListener("change", () => {
    const id = input.closest("tr").dataset.id;
    const value = input.type === "date" ? fromDateInput(input.value) : input.value;
    const fields = { [input.dataset.field]: value };
    // Record when an action item is closed (the Impact tab measures on-time closing from this).
    if (ui.type === "actions" && input.dataset.field === "ItemStatus") fields.ClosedDate = value === "Done" ? new Date().toISOString() : null;
    busy(input, async () => {
      await ctx.data.update(ui.type, id, fields);
      await ctx.reload([ui.type]); rerender(); toast("Saved");
    });
  }));

  el.querySelectorAll('[data-act="delete"]').forEach((b) => b.addEventListener("click", () => {
    const tr = b.closest("tr");
    if (!confirm(`Delete "${tr.querySelector(".t-title").firstChild.textContent.trim()}"?`)) return;
    busy(b, async () => { await ctx.data.remove(ui.type, tr.dataset.id); await ctx.reload([ui.type]); rerender(); toast("Deleted"); });
  }));

  el.querySelector('[data-act="csv"]').addEventListener("click", () => {
    const head = T.columns.map((c) => c.label);
    const body = rows.map((x) => T.columns.map((c) => (c.get ? c.get(x) : c.kind === "date" ? fmtShort(x[c.field]) : x[c.field])));
    csvDownload(`${ctx.project().Title} - ${T.label}.csv`, [head, ...body]);
  });
}
