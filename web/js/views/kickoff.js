// Kickoff kit (Phase 4): one form sets up the project, stakeholders with RACI roles, and a milestone
// plan with dependencies from a template. Flow 6 then drafts the charter page with AI.
import { esc, pill, toast, busy, toDateInput, fromDateInput, fmtShort, DAY } from "../ui.js";

// Each milestone: [title, workstream, start fraction, due fraction, depends-on indexes, gate?]
const TEMPLATES = {
  launch: { label: "Product or feature launch", ms: [
    ["Requirements signed off", "Product", 0, 0.12, []],
    ["Design complete", "Design", 0.1, 0.3, [0]],
    ["Build", "Engineering", 0.28, 0.68, [1]],
    ["Localization", "Localization", 0.5, 0.8, [1]],
    ["QA and beta", "Engineering", 0.7, 0.88, [2, 3]],
    ["Launch readiness review", "Launch", 0.92, 0.92, [4], true],
    ["Launch", "Launch", 1, 1, [5], true]] },
  localization: { label: "Localization rollout", ms: [
    ["Content inventory and scope", "Planning", 0, 0.12, []],
    ["Vendor onboarding", "Vendors", 0.05, 0.25, []],
    ["Glossary and style guide", "Quality", 0.12, 0.3, [0]],
    ["Translation, wave 1", "Production", 0.3, 0.6, [1, 2]],
    ["Linguistic QA", "Quality", 0.6, 0.78, [3]],
    ["Publish wave 1", "Release", 0.82, 0.82, [4], true],
    ["Retrospective and wave 2 plan", "Planning", 0.85, 1, [5]]] },
  transformation: { label: "Process or AI transformation", ms: [
    ["Discovery and baseline metrics", "Discovery", 0, 0.15, []],
    ["Pilot design", "Pilot", 0.12, 0.28, [0]],
    ["Pilot", "Pilot", 0.28, 0.55, [1]],
    ["Scale-or-stop review", "Governance", 0.58, 0.58, [2], true],
    ["Rollout", "Rollout", 0.6, 0.9, [3]],
    ["Adoption and impact review", "Governance", 0.92, 1, [4], true]] },
  blank: { label: "Blank (add milestones later)", ms: [] }
};

let result = null; // set after a kit is created, to show the summary

function planFor(key, startIso, targetIso) {
  const s = new Date(startIso).getTime(), e = new Date(targetIso).getTime();
  const at = (f) => new Date(s + Math.round(((e - s) * f) / DAY) * DAY).toISOString();
  return TEMPLATES[key].ms.map(([title, ws, a, b, deps, gate]) => ({ title, ws, start: at(a), due: at(b), deps, gate: !!gate }));
}

export function render(ctx, el) {
  if (result) { renderResult(ctx, el); return; }
  const me = ctx.state.me || {};
  const start = new Date(); start.setDate(start.getDate() + 7);
  const target = new Date(start.getTime() + 90 * DAY);

  el.innerHTML = `
    <div class="panel-head"><div>
      <h2>Kick off a project</h2>
      <p class="muted">Fill this in once. MinuteMate creates the project, stakeholder list with RACI roles, and a milestone plan with dependencies, then drafts a charter page for you to review.</p>
    </div></div>
    <form data-form="kickoff">
      <div class="form-grid">
        <label>Project name<input name="title" required maxlength="200" placeholder="e.g. Project Phoenix"></label>
        <label>Project code <span class="hint">short tag for invites</span><input name="code" maxlength="20" placeholder="PHX"></label>
        <label class="full">Goal <span class="hint">one sentence: what changes when this is done?</span><input name="goal" required maxlength="300"></label>
        <label>In scope<textarea name="scope" rows="3"></textarea></label>
        <label>Out of scope<textarea name="outScope" rows="3"></textarea></label>
        <label class="full">Success metrics <span class="hint">how you'll know it worked, with numbers if you can</span><textarea name="metrics" rows="2"></textarea></label>
        <label>Start date<input name="start" type="date" required value="${toDateInput(start.toISOString())}"></label>
        <label>Target date<input name="target" type="date" required value="${toDateInput(target.toISOString())}"></label>
        <label>Project owner email<input name="owner" type="email" required list="peopleList" autocomplete="off" value="${esc(me.email || "")}"></label>
        <label>Status approver email<input name="approver" type="email" required list="peopleList" autocomplete="off"></label>
        <label class="full">Constraints and assumptions<textarea name="constraints" rows="2"></textarea></label>
      </div>

      <h3 class="section-title">Stakeholders</h3>
      <div class="repeater" data-rep="people">
        ${personRow({ name: me.name?.replace(" (demo)", "") || "", email: me.email || "", role: "Program manager", raci: "Responsible" })}
        ${personRow({ raci: "Accountable" })}
        ${personRow({ raci: "Consulted" })}
      </div>
      <button type="button" class="linkish" data-act="add-person">+ Add a stakeholder</button>

      <h3 class="section-title">Milestone plan</h3>
      <div class="form-grid">
        <label>Start from a template<select name="template">${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join("")}</select></label>
        <label>Auto-capture keywords<input name="keywords" placeholder="e.g. Phoenix, steering"></label>
      </div>
      <div class="table-wrap"><table class="grid" data-plan></table></div>
      <p class="muted small">Dates are spread across your start and target dates. You can change them here or on the Timeline tab later.</p>

      <div class="form-actions"><button class="btn primary" type="submit">Create kickoff kit</button></div>
    </form>`;

  const f = el.querySelector('[data-form="kickoff"]');
  const drawPlan = () => {
    const plan = planFor(f.template.value, fromDateInput(f.start.value), fromDateInput(f.target.value));
    el.querySelector("[data-plan]").innerHTML = plan.length
      ? `<thead><tr><th>Milestone</th><th>Workstream</th><th>Start</th><th>Due</th><th>After</th></tr></thead><tbody>${plan.map((m, i) => `<tr data-i="${i}">
          <td><input name="ms-title" value="${esc(m.title)}" aria-label="Milestone"></td><td><input name="ms-ws" value="${esc(m.ws)}" aria-label="Workstream"></td>
          <td><input type="date" name="ms-start" value="${toDateInput(m.start)}" aria-label="Start"></td><td><input type="date" name="ms-due" value="${toDateInput(m.due)}" aria-label="Due"></td>
          <td class="sub">${m.deps.map((d) => esc(plan[d].title)).join(", ") || "—"}${m.gate ? ` ${pill("Gate")}` : ""}</td></tr>`).join("")}</tbody>`
      : `<tbody><tr><td class="empty">No milestones. Add them on the Timeline tab after kickoff.</td></tr></tbody>`;
  };
  drawPlan();
  ["template", "start", "target"].forEach((n) => f[n].addEventListener("change", drawPlan));
  el.querySelector('[data-act="add-person"]').addEventListener("click", () => el.querySelector('[data-rep="people"]').insertAdjacentHTML("beforeend", personRow({ raci: "Informed" })));
  el.querySelector('[data-rep="people"]').addEventListener("click", (e) => { if (e.target.matches('[data-act="rm"]')) e.target.closest(".rep-row").remove(); });

  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (f.target.value < f.start.value) { toast("The target date must be after the start date."); return; }
    busy(f.querySelector('button[type="submit"]'), () => createKit(ctx, f));
  });
}

function personRow(p) {
  return `<div class="rep-row">
    <input name="p-name" placeholder="Name" value="${esc(p.name || "")}" aria-label="Name">
    <input name="p-email" type="email" placeholder="Email" list="peopleList" autocomplete="off" value="${esc(p.email || "")}" aria-label="Email">
    <input name="p-role" placeholder="Role" value="${esc(p.role || "")}" aria-label="Role">
    <select name="p-raci" aria-label="RACI">${["Responsible", "Accountable", "Consulted", "Informed"].map((r) => `<option ${p.raci === r ? "selected" : ""}>${r}</option>`).join("")}</select>
    <button type="button" class="icon-btn" data-act="rm" aria-label="Remove">✕</button>
  </div>`;
}

async function createKit(ctx, f) {
  const d = ctx.data;
  const plan = planFor(f.template.value, fromDateInput(f.start.value), fromDateInput(f.target.value));
  [...f.querySelectorAll("[data-plan] tbody tr[data-i]")].forEach((tr) => {
    const m = plan[Number(tr.dataset.i)];
    m.title = tr.querySelector('[name="ms-title"]').value.trim() || m.title;
    m.ws = tr.querySelector('[name="ms-ws"]').value.trim() || m.ws;
    m.start = fromDateInput(tr.querySelector('[name="ms-start"]').value) || m.start;
    m.due = fromDateInput(tr.querySelector('[name="ms-due"]').value) || m.due;
  });
  const people = [...f.querySelectorAll(".rep-row")].map((r) => ({
    name: r.querySelector('[name="p-name"]').value.trim(), email: r.querySelector('[name="p-email"]').value.trim(),
    role: r.querySelector('[name="p-role"]').value.trim(), raci: r.querySelector('[name="p-raci"]').value
  })).filter((p) => p.name || p.email);

  const project = await d.create("projects", {
    Title: f.title.value.trim(), ProjectCode: f.code.value.trim(), ProjectOwnerEmail: f.owner.value.trim(), ApproverEmail: f.approver.value.trim(),
    StartDate: fromDateInput(f.start.value), TargetDate: fromDateInput(f.target.value), AutoCaptureKeywords: f.keywords.value.trim(),
    DefaultNotifyVia: "Teams", WeeklyStatusOn: true, OverallStatus: "On track"
  });
  const pid = Number(project.id) || project.id;
  for (const p of people) await d.create("stakeholders", { Title: p.name || p.email, Email: p.email, Role: p.role, RACI: p.raci, ProjectLookupId: pid });
  const ids = [];
  for (const m of plan) {
    const r = await d.create("milestones", { Title: m.title, Workstream: m.ws, StartDate: m.start, DueDate: m.due, MilestoneStatus: "Not started", IsGate: m.gate, ProjectLookupId: pid });
    ids.push(r.id);
  }
  for (let i = 0; i < plan.length; i++) if (plan[i].deps.length) await d.setDeps(ids[i], plan[i].deps.map((j) => ids[j]));
  await d.create("kickoffs", {
    Title: `${f.title.value.trim()} kickoff`, Goal: f.goal.value.trim(), Scope: f.scope.value.trim(), OutOfScope: f.outScope.value.trim(),
    SuccessMetrics: f.metrics.value.trim(), Constraints: f.constraints.value.trim(), KickoffStatus: "Draft requested", ProjectLookupId: pid
  });

  result = { projectId: String(project.id), goal: f.goal.value.trim(), scope: f.scope.value.trim(), outScope: f.outScope.value.trim(),
    metrics: f.metrics.value.trim(), people, plan };
  await ctx.reload();
  ctx.selectProject(String(project.id));
  toast("Kickoff kit created");
}

function renderResult(ctx, el) {
  const r = result;
  const p = ctx.state.lists.projects.find((x) => x.id === r.projectId);
  const letters = { Responsible: "R", Accountable: "A", Consulted: "C", Informed: "I" };
  el.innerHTML = `
    <div class="panel-head"><div>
      <h2>Kickoff kit: ${esc(p?.Title || "")}</h2>
      <p class="muted">The project, stakeholders and milestone plan are saved. MinuteMate is drafting the charter page now; it appears on the Overview tab when it's ready for your review.</p>
    </div></div>
    <div class="kit">
      <div class="kit-card">
        <h3>Charter outline</h3>
        <dl>
          <dt>Goal</dt><dd>${esc(r.goal)}</dd>
          ${r.scope ? `<dt>In scope</dt><dd>${esc(r.scope)}</dd>` : ""}
          ${r.outScope ? `<dt>Out of scope</dt><dd>${esc(r.outScope)}</dd>` : ""}
          ${r.metrics ? `<dt>Success metrics</dt><dd>${esc(r.metrics)}</dd>` : ""}
          <dt>Dates</dt><dd>${esc(fmtShort(p?.StartDate))} → ${esc(fmtShort(p?.TargetDate))}</dd>
        </dl>
      </div>
      <div class="kit-card">
        <h3>RACI</h3>
        <table class="raci"><thead><tr><th>Person</th><th>Role</th>${["R", "A", "C", "I"].map((l) => `<th>${l}</th>`).join("")}</tr></thead>
        <tbody>${r.people.map((x) => `<tr><td>${esc(x.name || x.email)}</td><td>${esc(x.role)}</td>${["R", "A", "C", "I"].map((l) => `<td class="mark">${letters[x.raci] === l ? "●" : ""}</td>`).join("")}</tr>`).join("")}</tbody></table>
        ${r.people.some((x) => x.raci === "Accountable") ? "" : `<p class="warn-text">No one is Accountable yet. Add one person in Settings.</p>`}
      </div>
      <div class="kit-card span2">
        <h3>Milestones (${r.plan.length})</h3>
        <ol class="ms-list">${r.plan.map((m) => `<li><strong>${esc(m.title)}</strong> <span class="sub">${esc(m.ws)} · ${esc(fmtShort(m.start))} → ${esc(fmtShort(m.due))}</span> ${m.gate ? pill("Gate") : ""}</li>`).join("") || "<li>None yet</li>"}</ol>
      </div>
      <div class="kit-card span2">
        <h3>Next steps</h3>
        <ul class="checklist">
          <li>Review the charter page when it's ready, then share it with stakeholders.</li>
          <li>Schedule the kickoff meeting in Teams and turn on <strong>Capture</strong> for it on the Meetings tab.</li>
          <li>Check the Timeline tab for dependency conflicts and adjust dates.</li>
          <li>Confirm the status approver and notification channel in Settings.</li>
        </ul>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn ghost" data-act="another">Kick off another project</button>
      <button class="btn primary" data-act="timeline">Open the timeline</button>
    </div>`;
  el.querySelector('[data-act="another"]').addEventListener("click", () => { result = null; ctx.render(); });
  el.querySelector('[data-act="timeline"]').addEventListener("click", () => { result = null; ctx.selectTab("timeline"); });
}
