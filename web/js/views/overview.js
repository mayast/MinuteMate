// Overview: one screen with the project's health, what's late, what's next, and recent outputs.
import { esc, pill, fmtDay, fmtShort, isPast } from "../ui.js";
import { summarize, focusOn } from "./risks.js";

export function render(ctx, el) {
  const p = ctx.project();
  if (!p) { el.innerHTML = emptyState(); bindEmpty(ctx, el); return; }

  const actions = ctx.items("actions");
  const open = actions.filter((a) => a.ItemStatus !== "Done").sort((a, b) => (a.DueDate || "9").localeCompare(b.DueDate || "9"));
  const overdue = open.filter((a) => isPast(a.DueDate));
  const rd = summarize(ctx);
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
        <h3>Risks and dependencies</h3>
        <p class="rd-summary">${rd.openRisks.length} open risk${rd.openRisks.length === 1 ? "" : "s"} · ${rd.openDeps.length} open dependenc${rd.openDeps.length === 1 ? "y" : "ies"}${rd.flagged ? ` · <strong class="bad-text">${rd.flagged} blocked or at risk</strong>` : ""}</p>
        <ul class="rows">${rows(rd.attention.slice(0, 4), (a) => a.kind === "conflict"
          ? `<li><button class="row-title plain" data-go="timeline"><span>${a.html}<br><span class="sub">Timeline dependency</span></span></button>${pill(a.status)}</li>`
          : `<li><button class="row-title plain" data-rd-kind="${a.kind}" data-rd-id="${esc(a.id)}"><span>${esc(a.title)}<br><span class="sub">${a.kind === "risk" ? "Risk" : "Dependency"} · ${esc(a.why)}</span></span></button>${pill(a.status)}</li>`,
          rd.openRisks.length + rd.openDeps.length ? "Nothing needs attention right now." : "No risks or dependencies yet. Add a file, link or meeting notes to find them.")}</ul>
        <button class="linkish see-all" data-rd-all>See all risks and dependencies →</button>
      </div>
      <div>
        <h3>Recent meetings</h3>
        <ul class="rows">${rows(meetings, (m) => `<li><button class="row-title plain" data-meeting="${esc(m.id)}"><span>${esc(m.Title)}<br><span class="sub">${esc(fmtDay(m.MeetingStart))}</span></span></button>${pill(m.ProcessingStatus)}</li>`, "No meetings captured yet.")}</ul>
      </div>
      <div class="span2">
        <h3>Status updates</h3>
        <ul class="rows">${rows(updates, (s) => `<li><span>${esc(s.Title)}<br><span class="sub">${pill(s.OverallStatus)} ${link(s.PublishedPage || s.DraftPage, "· open page")}</span></span>${pill(s.ApprovalStatus)}</li>`, "The first weekly draft arrives on Friday.")}</ul>
      </div>
    </div>`;
  el.querySelectorAll("[data-meeting]").forEach((b) => b.addEventListener("click", () => {
    ctx.state.openMeetingId = b.dataset.meeting;
    ctx.state.scrollToMeeting = true;
    ctx.selectTab("meetings");
  }));
  el.querySelectorAll("[data-rd-kind]").forEach((b) => b.addEventListener("click", () => focusOn(ctx, { kind: b.dataset.rdKind, id: b.dataset.rdId })));
  el.querySelector("[data-rd-all]")?.addEventListener("click", () => focusOn(ctx, { section: "attention" }));
  el.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => ctx.selectTab(b.dataset.go)));
}

function emptyState() {
  return `<div class="empty-hero">
    <h2>Start your first project</h2>
    <p class="muted">The kickoff kit sets up the project, stakeholders with RACI roles, and a milestone plan with dependencies in a few minutes.</p>
    <button class="btn primary" data-go="kickoff">Kick off a project</button>
  </div>`;
}
function bindEmpty(ctx, el) { el.querySelector("[data-go]")?.addEventListener("click", () => ctx.selectTab("kickoff")); }
