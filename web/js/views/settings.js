// Settings: project owner/approver, notifications, weekly status, auto-capture rules, stakeholders.
import { esc, toast, busy, toDateInput, fromDateInput } from "../ui.js";

const TRACKERS = ["None", "Planner", "Azure DevOps", "GitHub"];
const HINTS = {
  None: "not needed",
  Planner: "plan ID, or leave blank to create a plan for this project",
  "Azure DevOps": "organization/project, e.g. contoso/Phoenix",
  GitHub: "owner/repo, e.g. contoso/phoenix"
};

export function render(ctx, el) {
  const p = ctx.project();
  if (!p) { el.innerHTML = `<p class="empty">No project yet. Use <strong>+ Kick off a project</strong> above.</p>`; return; }
  const people = ctx.items("stakeholders");

  el.innerHTML = `
    <div class="panel-head">
      <div><h2>Settings: ${esc(p.Title)}</h2>
      <p class="muted">Who approves the weekly status, how owners are notified, and which meetings are captured automatically.</p></div>
    </div>
    <form class="form-grid" data-form="project">
      <label>Project name<input name="title" required maxlength="200" value="${esc(p.Title)}"></label>
      <label>Project code <span class="hint">used in invite titles, e.g. [PHX]</span><input name="code" maxlength="20" value="${esc(p.ProjectCode || "")}"></label>
      <label>Project owner email<input name="owner" type="email" required list="peopleList" autocomplete="off" value="${esc(p.ProjectOwnerEmail || "")}"></label>
      <label>Status approver email<input name="approver" type="email" required list="peopleList" autocomplete="off" value="${esc(p.ApproverEmail || "")}"></label>
      <label>Start date<input name="start" type="date" value="${toDateInput(p.StartDate)}"></label>
      <label>Target date<input name="target" type="date" value="${toDateInput(p.TargetDate)}"></label>
      <label class="full">Auto-capture keywords <span class="hint">comma-separated; matching meeting titles are suggested on the Meetings tab</span>
        <input name="keywords" value="${esc(p.AutoCaptureKeywords || "")}" placeholder="e.g. Phoenix, go/no-go, steering"></label>
      <fieldset>
        <legend>Notify action item owners by</legend>
        ${["Teams", "Outlook", "Teams and Outlook"].map((v) => `<label class="radio"><input type="radio" name="notify" value="${v}" ${(p.DefaultNotifyVia || "Teams") === v ? "checked" : ""}> ${v === "Teams and Outlook" ? "Both" : v}</label>`).join("")}
      </fieldset>
      <label class="switch"><input type="checkbox" name="weekly" ${p.WeeklyStatusOn ? "checked" : ""}> <span>Draft a weekly status every Friday for approval</span></label>

      <h3 class="section-title full">Where the team tracks work</h3>
      <label>Track action items in
        <select name="tracker">${TRACKERS.map((t) => `<option ${(p.WorkTracker || "None") === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Tracker target <span class="hint" data-hint>${esc(HINTS[p.WorkTracker || "None"])}</span>
        <input name="trackerTarget" maxlength="255" value="${esc(p.TrackerTarget || "")}" ${(p.WorkTracker || "None") === "None" ? "disabled" : ""}></label>
      <p class="muted small full">MinuteMate keeps every action item in SharePoint and also creates it in the tracker you pick. Status changes made there come back here, so the weekly status, timeline and impact numbers stay complete.</p>

      <h3 class="section-title full">Meeting chat and privacy</h3>
      <label class="switch full"><input type="checkbox" name="recap" ${p.PostRecapToChat ? "checked" : ""}> <span>Post the recap and action items to the Teams meeting chat after each meeting</span></label>
      <label class="switch full"><input type="checkbox" name="agenda" ${p.PostAgendaToChat ? "checked" : ""}> <span>Post an agenda (open items, overdue, new risks) before recurring meetings</span></label>
      <label>Keep transcripts for (days) <span class="hint">summaries and items are kept; raw transcripts are deleted</span>
        <input name="retention" type="number" min="1" max="3650" value="${esc(p.TranscriptRetentionDays || 30)}"></label>
      <p class="muted small full">Meetings with <strong>[no-capture]</strong> in the title are never captured. See <em>docs/privacy.md</em> for the attendee notice.</p>
      <div class="form-actions"><button class="btn primary" type="submit">Save settings</button></div>
    </form>

    <h3 class="section-title">Stakeholders</h3>
    <div class="table-wrap">
      <table class="grid">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>RACI</th><th aria-label="Actions"></th></tr></thead>
        <tbody>
          ${people.map((s) => `<tr data-id="${esc(s.id)}"><td>${esc(s.Title)}</td><td>${esc(s.Email || "")}</td><td>${esc(s.Role || "")}</td>
            <td><select data-field="RACI" aria-label="RACI">${["Responsible", "Accountable", "Consulted", "Informed"].map((r) => `<option ${s.RACI === r ? "selected" : ""}>${r}</option>`).join("")}</select></td>
            <td><button class="icon-btn" data-act="del" aria-label="Remove">✕</button></td></tr>`).join("") || `<tr><td colspan="5" class="empty">No stakeholders yet.</td></tr>`}
        </tbody>
      </table>
    </div>
    <form class="add-row" data-form="person">
      <input name="name" placeholder="Name" required>
      <input name="email" type="email" placeholder="Email" list="peopleList" autocomplete="off">
      <input name="role" placeholder="Role">
      <select name="raci" aria-label="RACI"><option>Informed</option><option>Consulted</option><option>Responsible</option><option>Accountable</option></select>
      <button class="btn primary small" type="submit">Add</button>
    </form>`;

  const pf = el.querySelector('[data-form="project"]');
  pf.tracker.addEventListener("change", () => {
    pf.trackerTarget.disabled = pf.tracker.value === "None";
    el.querySelector("[data-hint]").textContent = HINTS[pf.tracker.value];
  });
  pf.addEventListener("submit", (ev) => {
    const f = ev.target;
    if (f.tracker.value !== "None" && f.tracker.value !== "Planner" && !f.trackerTarget.value.trim()) { ev.preventDefault(); ev.stopImmediatePropagation(); toast(`Add the ${f.tracker.value} target (${HINTS[f.tracker.value]}).`); return; }
  }, true);
  el.querySelector('[data-form="project"]').addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = ev.target;
    busy(f.querySelector('button[type="submit"]'), async () => {
      await ctx.data.update("projects", p.id, {
        Title: f.title.value.trim(), ProjectCode: f.code.value.trim(), ProjectOwnerEmail: f.owner.value.trim(), ApproverEmail: f.approver.value.trim(),
        StartDate: fromDateInput(f.start.value), TargetDate: fromDateInput(f.target.value), AutoCaptureKeywords: f.keywords.value.trim(),
        DefaultNotifyVia: f.querySelector('input[name="notify"]:checked').value, WeeklyStatusOn: f.weekly.checked,
        WorkTracker: f.tracker.value, TrackerTarget: f.tracker.value === "None" ? "" : f.trackerTarget.value.trim(),
        PostRecapToChat: f.recap.checked, PostAgendaToChat: f.agenda.checked, TranscriptRetentionDays: Number(f.retention.value) || 30
      });
      await ctx.reload(["projects"]); ctx.render(); toast("Settings saved");
    });
  });

  el.querySelector('[data-form="person"]').addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = ev.target;
    busy(f.querySelector("button"), async () => {
      await ctx.data.create("stakeholders", { Title: f.name.value.trim(), Email: f.email.value.trim(), Role: f.role.value.trim(), RACI: f.raci.value, ProjectLookupId: Number(p.id) || p.id });
      await ctx.reload(["stakeholders"]); ctx.render(); toast("Stakeholder added");
    });
  });
  el.querySelectorAll('select[data-field="RACI"]').forEach((s) => s.addEventListener("change", () =>
    busy(s, async () => { await ctx.data.update("stakeholders", s.closest("tr").dataset.id, { RACI: s.value }); await ctx.reload(["stakeholders"]); toast("Saved"); })));
  el.querySelectorAll('[data-act="del"]').forEach((b) => b.addEventListener("click", () =>
    busy(b, async () => { await ctx.data.remove("stakeholders", b.closest("tr").dataset.id); await ctx.reload(["stakeholders"]); ctx.render(); })));
}
