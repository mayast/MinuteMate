// Meetings (Phase 3): choose Teams meetings to capture, auto-capture by keyword or whole series,
// and watch the transcript pickup queue (waiting, processing, done, error → retry).
import { esc, pill, fmtDay, fmtShort, fmtTime, toast, busy, isPast } from "../ui.js";
import { applyFilter } from "./tracker.js";

let openId = null; // meeting expanded in the transcript queue
const htmlToText = (html) => { try { return new DOMParser().parseFromString(String(html || ""), "text/html").body.textContent.trim(); } catch { return String(html || ""); } };
import { buildAgenda } from "../agenda.js";

// Privacy opt-out: meetings with [no-capture] in the title are never captured (Phase 5.7).
const optedOut = (e) => /\[no-capture\]/i.test(e.title || "");

const keywordsOf = (p) => (p?.AutoCaptureKeywords || "").split(/[,;]/).map((k) => k.trim().toLowerCase()).filter(Boolean);

export function render(ctx, el) {
  const p = ctx.project();
  if (!p) { el.innerHTML = `<p class="empty">Kick off or create a project first.</p>`; return; }

  const all = ctx.state.lists.meetings || [];
  const byUrl = new Map(all.map((m) => [m.JoinUrl, m]));
  const kw = keywordsOf(p);
  const suggestions = ctx.state.calendar.filter((e) => !byUrl.has(e.joinUrl) && !optedOut(e) && kw.some((k) => e.title.toLowerCase().includes(k)));
  if (ctx.state.openMeetingId) { openId = ctx.state.openMeetingId; ctx.state.openMeetingId = null; }
  // Pasted-notes meetings that are done only show here when another tab links to one.
  const queue = ctx.items("meetings").filter((m) => m.CaptureMode === "Teams transcript" || m.ProcessingStatus !== "Done" || m.id === openId)
    .sort((a, b) => (b.MeetingStart || "").localeCompare(a.MeetingStart || ""));
  const invite = ctx.cfg.inviteAddress;

  el.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>Meetings to capture</h2>
        <p class="muted">Switch <strong>Capture</strong> on and MinuteMate fetches the Teams transcript after the meeting ends. Transcription must be on during the meeting.${invite ? ` Or add <strong>${esc(invite)}</strong> to any invite and include <strong>[${esc(p.ProjectCode || "code")}]</strong> in the title.` : ""}</p>
      </div>
      <button class="btn ghost small" data-act="refresh">Refresh</button>
    </div>

    ${suggestions.length ? `
      <div class="callout">
        <span><strong>${suggestions.length} upcoming meeting${suggestions.length > 1 ? "s" : ""}</strong> match this project's auto-capture keywords (${esc(kw.join(", "))}).</span>
        <button class="btn primary small" data-act="capture-matches">Capture all</button>
      </div>` : ""}

    <ul class="meeting-list">
      ${ctx.state.calendar.length ? ctx.state.calendar.map((e) => meetingRow(ctx, e, byUrl.get(e.joinUrl))).join("")
        : `<li class="empty">No upcoming Teams meetings in the next ${ctx.cfg.meetingLookaheadDays || 14} days.</li>`}
    </ul>

    <details class="paste-link">
      <summary>Meeting not listed? Add it with its Teams link</summary>
      <form class="form-grid" data-form="link">
        <label>Meeting title<input name="title" required maxlength="200"></label>
        <label>Teams meeting link<input name="joinUrl" type="url" required placeholder="https://teams.microsoft.com/l/meetup-join/..."></label>
        <label>Starts<input name="start" type="datetime-local" required></label>
        <label>Ends<input name="end" type="datetime-local" required></label>
        <label>Organizer email<input name="organizer" type="email" required list="peopleList" autocomplete="off"></label>
        <div class="form-actions"><button class="btn primary" type="submit">Add meeting</button></div>
      </form>
    </details>

    <h3 class="section-title">Transcript queue</h3>
    <ul class="rows">
      ${queue.length ? queue.map((m) => queueRow(ctx, m)).join("") : `<li class="empty">Captured meetings appear here with their transcript status.</li>`}
    </ul>`;

  bind(ctx, el, suggestions);
}

function meetingRow(ctx, e, item) {
  const p = ctx.project();
  const other = item && item.ProjectLookupId !== p.id ? ctx.state.lists.projects.find((x) => x.id === item.ProjectLookupId) : null;
  const d = new Date(e.start);
  const status = item ? (other ? `<span class="pill">Captured for ${esc(other.Title)}</span>` : pill(item.ProcessingStatus)) : optedOut(e) ? `<span class="pill">Opted out</span>` : "";
  const canAgenda = item && !other && new Date(e.start) > new Date();
  const seriesUncaptured = e.seriesId && ctx.state.calendar.some((x) => x.seriesId === e.seriesId && !ctx.state.lists.meetings.some((m) => m.JoinUrl === x.joinUrl));
  return `<li class="meeting">
    <div class="date-chip"><span class="m">${esc(d.toLocaleDateString(undefined, { month: "short" }))}</span><span class="d">${d.getDate()}</span></div>
    <div>
      <div class="title">${esc(e.title)} ${e.seriesId ? `<span class="pill">Recurring</span>` : ""}</div>
      <div class="meta">${esc(fmtDay(e.start))} · ${esc(fmtTime(e.start))}–${esc(fmtTime(e.end))} · ${esc(e.organizer || "unknown organizer")} ${status}</div>
      <div class="row-links">
        ${e.seriesId && seriesUncaptured && !optedOut(e) ? `<button class="linkish" data-act="series" data-series="${esc(e.seriesId)}">Capture every meeting in this series</button>` : ""}
        ${canAgenda ? `<button class="linkish" data-act="agenda" data-join="${esc(e.joinUrl)}" aria-expanded="false">Preview agenda</button>` : ""}
      </div>
      ${canAgenda ? `<div class="agenda" data-agenda="${esc(e.joinUrl)}" hidden></div>` : ""}
    </div>
    <label class="toggle"><input type="checkbox" data-join="${esc(e.joinUrl)}" ${item ? "checked" : ""} ${other || (optedOut(e) && !item) ? "disabled" : ""}> Capture</label>
  </li>`;
}

function queueRow(ctx, m) {
  const tries = Number(m.TranscriptAttempts || 0);
  const sub = [fmtDay(m.MeetingStart), m.ProcessingStatus === "Waiting for transcript" && tries ? `checked ${tries}×` : "",
    m.ProcessingStatus === "Error" ? "no transcript found" : ""].filter(Boolean).join(" · ");
  const actions = m.ProcessingStatus === "Error" ? `<button class="btn ghost small" data-act="retry" data-id="${esc(m.id)}">Retry</button>` : "";
  const open = openId === m.id;
  return `<li class="queue-item${open ? " open" : ""}" data-meeting="${esc(m.id)}">
    <div class="queue-row">
      <button class="row-title" data-act="details" data-id="${esc(m.id)}" aria-expanded="${open}">
        <span class="chev" aria-hidden="true">▸</span>
        <span>${esc(m.Title)}<br><span class="sub">${esc(sub)}</span></span>
      </button>
      <span class="row-end">${pill(m.ProcessingStatus)} ${actions}</span>
    </div>
    ${open ? `<div class="meeting-detail">${meetingDetail(ctx, m)}</div>` : ""}
  </li>`;
}

// What a meeting produced: summary, action items, decisions, risks, and where to go next.
function meetingDetail(ctx, m) {
  const from = (key) => (ctx.state.lists[key] || []).filter((x) => String(x.SourceMeetingLookupId || "") === m.id);
  const actions = from("actions"), decisions = from("decisions"), risks = from("risks"), deps = from("dependencies");
  const summary = htmlToText(m.Summary);
  const waiting = { "Waiting for transcript": "MinuteMate will read the transcript after the meeting ends.", Processing: "MinuteMate is reading the transcript now.",
    Error: "No transcript was found. Check that transcription was on, then select Retry, or paste notes into the meeting in SharePoint.", New: "Notes are queued for processing." }[m.ProcessingStatus];
  const list = (arr, fn, empty) => arr.length ? `<ul>${arr.map(fn).join("")}</ul>` : `<p class="muted small">${empty}</p>`;
  const notes = m.NotesPage?.Url
    ? (ctx.demo ? `<button class="btn ghost small" data-act="demo-notes">Open meeting notes</button>`
                : `<a class="btn ghost small" href="${esc(m.NotesPage.Url)}" target="_blank" rel="noopener">Open meeting notes ↗</a>`)
    : "";
  const total = actions.length + decisions.length + risks.length + deps.length;
  return `
    <p class="detail-summary">${summary ? esc(summary) : `<span class="muted">${esc(waiting || "No summary yet.")}</span>`}</p>
    ${total || summary ? `<div class="detail-cols">
      <div><p class="agenda-h">Action items (${actions.length})</p>${list(actions, (a) => `<li>${esc(a.Title)} <span class="sub">— ${esc(a.OwnerAsWritten || a.OwnerEmail || "no owner")}${a.DueDate ? `, due ${esc(fmtShort(a.DueDate))}` : ""}</span> ${a.ItemStatus === "Done" ? pill("Done") : isPast(a.DueDate) ? pill("Overdue") : ""}</li>`, "None")}</div>
      <div><p class="agenda-h">Decisions (${decisions.length})</p>${list(decisions, (d) => `<li>${esc(d.Title)}</li>`, "None")}
        <p class="agenda-h">Risks (${risks.length})</p>${list(risks, (r) => `<li>${esc(r.Title)} ${r.Impact ? pill(r.Impact) : ""}</li>`, "None")}
        <p class="agenda-h">Dependencies (${deps.length})</p>${list(deps, (d) => `<li>${esc(d.Title)} ${pill(d.DependencyStatus, "Open")}</li>`, "None")}</div>
    </div>` : ""}
    <div class="detail-actions">
      ${notes}
      ${total ? `<button class="btn ghost small" data-act="to-tracker" data-id="${esc(m.id)}">See these items in the Tracker</button>` : ""}
      ${risks.length + deps.length ? `<button class="btn ghost small" data-act="to-risks" data-id="${esc(m.id)}">See risks and dependencies</button>` : ""}
    </div>`;
}

async function capture(ctx, e) {
  const p = ctx.project();
  await ctx.data.create("meetings", {
    Title: e.title, ProjectLookupId: Number(p.id) || p.id,
    MeetingDate: e.start, MeetingStart: e.start, MeetingEnd: e.end,
    JoinUrl: e.joinUrl, OrganizerEmail: e.organizer, SeriesId: e.seriesId || "",
    CaptureMode: "Teams transcript", ProcessingStatus: "Waiting for transcript", TranscriptAttempts: 0
  });
}

function bind(ctx, el, suggestions) {
  const refresh = async () => { await ctx.reload(["meetings"]); ctx.render(); };

  el.querySelector('[data-act="refresh"]').addEventListener("click", (ev) =>
    busy(ev.target, async () => { await Promise.all([ctx.loadCalendar(), ctx.reload(["meetings"])]); ctx.render(); toast("Refreshed"); }));

  el.querySelector('[data-act="capture-matches"]')?.addEventListener("click", (ev) =>
    busy(ev.target, async () => { for (const e of suggestions) await capture(ctx, e); await refresh(); toast(`Capturing ${suggestions.length} meetings`); }));

  el.querySelectorAll('[data-act="series"]').forEach((b) => b.addEventListener("click", () =>
    busy(b, async () => {
      const todo = ctx.state.calendar.filter((x) => x.seriesId === b.dataset.series && !ctx.state.lists.meetings.some((m) => m.JoinUrl === x.joinUrl));
      for (const e of todo) await capture(ctx, e);
      await refresh(); toast(`Capturing ${todo.length} meetings in the series`);
    })));

  el.querySelectorAll("input[data-join]").forEach((input) => input.addEventListener("change", () =>
    busy(input, async () => {
      const e = ctx.state.calendar.find((x) => x.joinUrl === input.dataset.join);
      const existing = ctx.state.lists.meetings.find((m) => m.JoinUrl === e.joinUrl);
      if (input.checked && !existing) { await capture(ctx, e); toast(`MinuteMate will capture "${e.title}"`); }
      else if (!input.checked && existing) {
        if (existing.ProcessingStatus !== "Waiting for transcript") { input.checked = true; toast("Already processed, so it stays in the log."); return; }
        await ctx.data.remove("meetings", existing.id); toast(`Stopped capturing "${e.title}"`);
      }
      await refresh();
    }).then(() => ctx.render())));

  el.querySelectorAll('[data-act="agenda"]').forEach((b) => b.addEventListener("click", () => {
    const box = [...el.querySelectorAll("[data-agenda]")].find((d) => d.dataset.agenda === b.dataset.join);
    const open = box.hidden;
    box.hidden = !open;
    b.setAttribute("aria-expanded", String(open));
    b.textContent = open ? "Hide agenda" : "Preview agenda";
    if (!open) return;
    const e = ctx.state.calendar.find((x) => x.joinUrl === b.dataset.join);
    const agenda = buildAgenda(ctx, e);
    box.innerHTML = `${agenda.html}<div class="agenda-actions"><button class="btn ghost small" data-copy>Copy agenda</button>
      <span class="muted small">${ctx.project().PostAgendaToChat ? "MinuteMate also posts this to the meeting chat before it starts." : "Turn on agenda posting in Settings to have it posted to the meeting chat."}</span></div>`;
    box.querySelector("[data-copy]").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(agenda.text); toast("Agenda copied"); }
      catch { toast("Couldn't copy. Select the text and copy it instead."); }
    });
  }));

  el.querySelectorAll('[data-act="details"]').forEach((b) => b.addEventListener("click", () => {
    openId = openId === b.dataset.id ? null : b.dataset.id;
    ctx.render();
    el.querySelector(`[data-meeting="${CSS.escape(b.dataset.id)}"] .row-title`)?.focus();
  }));
  el.querySelector('[data-act="to-tracker"]')?.addEventListener("click", (e) => {
    applyFilter({ meetingId: e.target.dataset.id, status: "all" });
    ctx.selectTab("tracker");
  });
  el.querySelector('[data-act="to-risks"]')?.addEventListener("click", (e) => { ctx.state.focus = { kind: "meeting", id: e.target.dataset.id }; ctx.selectTab("risks"); });
  el.querySelector('[data-act="demo-notes"]')?.addEventListener("click", () => toast("In your workspace this opens the meeting notes page in SharePoint."));
  const opened = el.querySelector(".queue-item.open");
  if (opened && ctx.state.scrollToMeeting) { ctx.state.scrollToMeeting = false; opened.scrollIntoView({ block: "center" }); }

  el.querySelectorAll('[data-act="retry"]').forEach((b) => b.addEventListener("click", () =>
    busy(b, async () => {
      await ctx.data.update("meetings", b.dataset.id, { ProcessingStatus: "Waiting for transcript", TranscriptAttempts: 0 });
      await refresh(); toast("MinuteMate will look for the transcript again");
    })));

  el.querySelector('[data-form="link"]').addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (!/^https:\/\/teams\.(microsoft|live)\.com\//i.test(f.joinUrl.value)) { toast("That doesn't look like a Teams meeting link."); return; }
    busy(f.querySelector("button"), async () => {
      await capture(ctx, { title: f.title.value.trim(), joinUrl: f.joinUrl.value.trim(), organizer: f.organizer.value.trim(),
        start: new Date(f.start.value).toISOString(), end: new Date(f.end.value).toISOString() });
      f.reset(); await refresh(); toast("Meeting added");
    });
  });
}
