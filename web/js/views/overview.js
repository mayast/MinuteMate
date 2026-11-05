// Overview: one screen with the project's health, what's late, what's next, and recent outputs.
import { esc, pill, fmtDay, fmtShort, isPast } from "../ui.js";

export function render(ctx, el) {
  const p = ctx.project();
  if (!p) { el.innerHTML = emptyState(); bindEmpty(ctx, el); return; }

  const actions = ctx.items("actions");
  const open = actions.filter((a) => a.ItemStatus !== "Done").sort((a, b) => (a.DueDate || "9").localeCompare(b.DueDate || "9"));
  const overdue = open.filter((a) => isPast(a.DueDate));
  const risks = ctx.items("risks").filter((r) => r.RiskStatus !== "Closed");
  const milestones = ctx.items("milestones");
  const nextMs = milestones.filter((m) => m.MilestoneStatus !== "Done").sort((a, b) => (a.DueDate || "").localeCompare(b.DueDate || "")).slice(0, 5);
  const lateMs = milestones.filter((m) => m.MilestoneStatus !== "Done" && isPast(m.DueDate));
  const meetings = ctx.items("meetings").sort((a, b) => (b.MeetingStart || "").localeCompare(a.MeetingStart || "")).slice(0, 5);
  const updates = ctx.items("status").sort((a, b) => (b.WeekOf || "").localeCompare(a.WeekOf || "")).slice(0, 4);
  const kickoff = ctx.items("kickoffs")[0];

  const rows = (arr, fn, empty) => (arr.length ? arr.map(fn).join("") : `<li class="empty">${empty}</li>`);
  const link = (u, text) => (u?.Url ? `<a href="${esc(u.Url)}" target="_blank" rel="noopener">${text}</a>` : "");

  el.innerHTML = `
    <div class="stats">
      <div class="stat"><span class="n">${pill(p.OverallStatus || "On track")}</span><span class="l">Overall status</span></div>
      <div class="stat"><span class="n">${open.length}</span><span class="l">Open action items</span></div>
      <div class="stat ${overdue.length ? "alert" : ""}"><span class="n">${overdue.length}</span><span class="l">Overdue items</span></div>
      <div class="stat ${lateMs.length ? "alert" : ""}"><span class="n">${lateMs.length}</span><span class="l">Late milestones</span></div>
    </div>
    ${kickoff ? `<p class="kit-line">Kickoff kit: ${pill(kickoff.KickoffStatus)} ${link(kickoff.CharterPage, "Open charter page")}</p>` : ""}
    <div class="cols">
      <div>
        <h3>Next milestones</h3>
        <ul class="rows">${rows(nextMs, (m) => `<li><span>${esc(m.Title)}<br><span class="sub">${esc(m.Workstream || "")} · due ${esc(fmtShort(m.DueDate))}</span></span>${isPast(m.DueDate) ? pill("Overdue") : pill(m.MilestoneStatus, "Not started")}</li>`, "No milestones yet. Add them on the Timeline tab.")}</ul>
      </div>
      <div>
        <h3>Open action items</h3>
        <ul class="rows">${rows(open.slice(0, 6), (a) => `<li><span>${esc(a.Title)}<br><span class="sub">${esc(a.OwnerAsWritten || a.OwnerEmail || "No owner")} · ${a.DueDate ? "due " + esc(fmtDay(a.DueDate)) : "no due date"}</span></span>${isPast(a.DueDate) ? pill("Overdue") : `<span class="pill">${esc(a.Priority || "")}</span>`}</li>`, "Nothing open.")}</ul>
      </div>
      <div>
        <h3>Open risks</h3>
        <ul class="rows">${rows(risks, (r) => `<li><span>${esc(r.Title)}<br><span class="sub">${esc(r.Mitigation || r.RiskStatus || "")}</span></span>${pill(r.Impact)}</li>`, "No open risks.")}</ul>
      </div>
      <div>
        <h3>Recent meetings</h3>
        <ul class="rows">${rows(meetings, (m) => `<li><span>${esc(m.Title)}<br><span class="sub">${esc(fmtDay(m.MeetingStart))} ${link(m.NotesPage, "· notes")}</span></span>${pill(m.ProcessingStatus)}</li>`, "No meetings captured yet.")}</ul>
      </div>
      <div class="span2">
        <h3>Status updates</h3>
        <ul class="rows">${rows(updates, (s) => `<li><span>${esc(s.Title)}<br><span class="sub">${pill(s.OverallStatus)} ${link(s.PublishedPage || s.DraftPage, "· open page")}</span></span>${pill(s.ApprovalStatus)}</li>`, "The first weekly draft arrives on Friday.")}</ul>
      </div>
    </div>`;
}

function emptyState() {
  return `<div class="empty-hero">
    <h2>Start your first project</h2>
    <p class="muted">The kickoff kit sets up the project, stakeholders with RACI roles, and a milestone plan with dependencies in a few minutes.</p>
    <button class="btn primary" data-go="kickoff">Kick off a project</button>
  </div>`;
}
function bindEmpty(ctx, el) { el.querySelector("[data-go]")?.addEventListener("click", () => ctx.selectTab("kickoff")); }
