// Builds the "before the next meeting" agenda from MinuteMate's lists (Phase 5.5).
// The same structure is what Flow 10 posts to the Teams meeting chat.
import { esc, fmtShort, fmtDay, isPast, DAY } from "./ui.js";
import { findIssues } from "./views/timeline.js";

export function buildAgenda(ctx, meeting) {
  const start = new Date(meeting.start || meeting.MeetingStart);
  const meetings = ctx.items("meetings").filter((m) => ["Done", "Needs review"].includes(m.ProcessingStatus) && new Date(m.MeetingStart) < start);
  const sameSeries = meetings.filter((m) => meeting.seriesId && m.SeriesId === meeting.seriesId);
  const last = (sameSeries.length ? sameSeries : meetings).sort((a, b) => (b.MeetingStart || "").localeCompare(a.MeetingStart || ""))[0];
  const since = last ? new Date(last.MeetingStart) : new Date(start.getTime() - 7 * DAY);

  const actions = ctx.items("actions");
  const open = actions.filter((a) => a.ItemStatus !== "Done").sort((a, b) => Number(isPast(b.DueDate)) - Number(isPast(a.DueDate)) || (a.DueDate || "9").localeCompare(b.DueDate || "9"));
  const closed = actions.filter((a) => a.ItemStatus === "Done" && a.ClosedDate && new Date(a.ClosedDate) >= since);
  const decisions = ctx.items("decisions").filter((d) => d.DecisionDate && new Date(d.DecisionDate) >= since);
  const risks = ctx.items("risks").filter((r) => r.RiskStatus !== "Closed" && (r.Impact === "High" || (r.Created && new Date(r.Created) >= since)));
  const ms = ctx.items("milestones");
  const upcoming = ms.filter((m) => m.MilestoneStatus !== "Done" && m.DueDate && new Date(m.DueDate) <= new Date(start.getTime() + 14 * DAY))
    .sort((a, b) => a.DueDate.localeCompare(b.DueDate));
  const issues = findIssues(ms.filter((m) => m.DueDate)).filter((i) => i.kind === "overlap" || i.kind === "late");

  const who = (a) => a.OwnerAsWritten || a.OwnerEmail || "no owner";
  const sections = [
    { title: last ? `Since the last meeting (${fmtDay(last.MeetingStart)})` : "This week", items: [
      ...closed.map((a) => `Done: ${a.Title} (${who(a)})`),
      ...decisions.map((d) => `Decided: ${d.Title}`)
    ], empty: "Nothing closed or decided yet." },
    { title: "Open action items", items: open.slice(0, 10).map((a) => `${isPast(a.DueDate) ? "OVERDUE · " : ""}${a.Title} (${who(a)}${a.DueDate ? `, due ${fmtShort(a.DueDate)}` : ""})`), empty: "No open items." },
    { title: "Risks to discuss", items: risks.map((r) => `${r.Title} (${r.Impact || "?"} impact${r.Mitigation ? `; mitigation: ${r.Mitigation}` : ""})`), empty: "No new or high-impact risks." },
    { title: "Milestones in the next two weeks", items: upcoming.map((m) => `${isPast(m.DueDate) ? "LATE · " : ""}${m.Title} (due ${fmtShort(m.DueDate)})`), empty: "None due." },
    { title: "Dependency check", items: issues.map((i) => i.text.replace(/<[^>]+>/g, "")), empty: "No conflicts." }
  ];

  const heading = `Agenda: ${meeting.title || meeting.Title} · ${fmtDay(start.toISOString())}`;
  const text = [heading, "", ...sections.flatMap((s) => [s.title, ...(s.items.length ? s.items.map((i) => `- ${i}`) : [`- ${s.empty}`]), ""])].join("\n").trim();
  const html = `<h4>${esc(heading)}</h4>` + sections.map((s) =>
    `<p class="agenda-h">${esc(s.title)}</p><ul>${s.items.length ? s.items.map((i) => `<li>${esc(i)}</li>`).join("") : `<li class="muted">${esc(s.empty)}</li>`}</ul>`).join("");
  return { text, html, counts: { overdue: open.filter((a) => isPast(a.DueDate)).length, open: open.length } };
}
