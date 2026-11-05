// Impact (Phase 5.8): proof that MinuteMate saves time and gets work closed.
// Headline tiles, one single-series bar chart (action items closed per week) with hover tooltips,
// and a by-owner table that doubles as the chart's table view.
import { esc, DAY, fmtShort } from "../ui.js";
import { applyFilter } from "./tracker.js";

let scope = "project"; // "project" | "all"
const WEEKS = 8;

const endOfDay = (iso) => { const d = new Date(iso); d.setHours(23, 59, 59, 999); return d; };
const median = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function metrics(ctx) {
  const pick = (key) => (scope === "all" ? ctx.state.lists[key] || [] : ctx.items(key));
  const meetings = pick("meetings");
  const actions = pick("actions");
  const processed = meetings.filter((m) => ["Done", "Needs review"].includes(m.ProcessingStatus));
  const fromMeetings = actions.filter((a) => a.Source === "Meeting").length
    + pick("risks").filter((r) => r.SourceMeetingLookupId).length
    + pick("decisions").filter((d) => d.SourceMeetingLookupId).length;
  const duplicatesAvoided = actions.reduce((n, a) => n + Math.max(0, Number(a.SeenInMeetings || 0) - 1), 0);
  const closed = actions.filter((a) => a.ItemStatus === "Done" && a.ClosedDate);
  const closedWithDue = closed.filter((a) => a.DueDate);
  const onTime = closedWithDue.filter((a) => new Date(a.ClosedDate) <= endOfDay(a.DueDate)).length;
  const daysToClose = closed.filter((a) => a.Created).map((a) => Math.max(0, (new Date(a.ClosedDate) - new Date(a.Created)) / DAY));
  const open = actions.filter((a) => a.ItemStatus !== "Done");
  const overdue = open.filter((a) => a.DueDate && endOfDay(a.DueDate) < new Date());
  const minutes = Number(ctx.cfg.minutesSavedPerMeeting || 30);

  // closed per week, oldest first; each week ends today minus k*7 days
  const today = endOfDay(new Date());
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const end = new Date(today.getTime() - (WEEKS - 1 - i) * 7 * DAY);
    const start = new Date(end.getTime() - 7 * DAY + 1);
    return { start, end, count: closed.filter((a) => { const d = new Date(a.ClosedDate); return d >= start && d <= end; }).length };
  });

  const owners = new Map();
  for (const a of actions) {
    const k = a.OwnerAsWritten || a.OwnerEmail || "No owner";
    const o = owners.get(k) || { name: k, open: 0, overdue: 0, closed: 0, onTime: 0, withDue: 0 };
    if (a.ItemStatus !== "Done") { o.open++; if (a.DueDate && endOfDay(a.DueDate) < new Date()) o.overdue++; }
    else if (a.ClosedDate) { o.closed++; if (a.DueDate) { o.withDue++; if (new Date(a.ClosedDate) <= endOfDay(a.DueDate)) o.onTime++; } }
    owners.set(k, o);
  }

  return {
    processed: processed.length, waiting: meetings.filter((m) => m.ProcessingStatus === "Waiting for transcript").length,
    fromMeetings, duplicatesAvoided, onTimeRate: closedWithDue.length ? onTime / closedWithDue.length : null,
    closedWithDue: closedWithDue.length, medianDays: median(daysToClose), open: open.length, overdue: overdue.length,
    hoursSaved: (processed.length * minutes) / 60, minutes, weeks,
    owners: [...owners.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open)
  };
}

export function render(ctx, el) {
  if (!ctx.project() && scope === "project") { el.innerHTML = `<p class="empty">Kick off or create a project first.</p>`; return; }
  const m = metrics(ctx);
  const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const tile = (value, label, note = "") => `<div class="stat"><span class="n">${esc(value)}</span><span class="l">${esc(label)}</span>${note ? `<span class="note">${esc(note)}</span>` : ""}</div>`;

  el.innerHTML = `
    <div class="panel-head">
      <div><h2>Impact</h2>
        <p class="muted">What MinuteMate has captured and how quickly the work it found gets closed.</p></div>
      <div class="segmented compact" role="tablist" aria-label="Scope">
        <button data-scope="project" aria-selected="${scope === "project"}">This project</button>
        <button data-scope="all" aria-selected="${scope === "all"}">All projects</button>
      </div>
    </div>
    <div class="stats">
      ${tile(m.processed, "Meetings captured", m.waiting ? `${m.waiting} waiting for transcript` : "")}
      ${tile(m.fromMeetings, "Items found by AI", m.duplicatesAvoided ? `${m.duplicatesAvoided} duplicate${m.duplicatesAvoided === 1 ? "" : "s"} avoided` : "actions, risks and decisions")}
      ${tile(pct(m.onTimeRate), "Closed on time", m.closedWithDue ? `of ${m.closedWithDue} closed items with a due date` : "no closed items yet")}
      ${tile(m.hoursSaved >= 10 ? Math.round(m.hoursSaved) : m.hoursSaved.toFixed(1), "Hours saved (est.)", `${m.minutes} min per meeting`)}
    </div>
    <p class="muted small">Median time to close: <strong>${m.medianDays == null ? "—" : `${m.medianDays.toFixed(1)} days`}</strong> · Open now: <strong>${m.open}</strong> · Overdue: <strong>${m.overdue}</strong></p>

    <h3 class="section-title">Action items closed per week</h3>
    <div class="chart-wrap" id="closedChart"></div>

    <h3 class="section-title">By owner</h3>
    <div class="table-wrap">
      <table class="grid">
        <thead><tr><th>Owner</th><th class="num">Open</th><th class="num">Overdue</th><th class="num">Closed</th><th class="num">On time</th></tr></thead>
        <tbody>${m.owners.length ? m.owners.map((o) => {
          // In "This project" scope, names and counts open the Tracker filtered to those items.
          const link = (n, view, label) => scope === "project" && n ? `<button class="cell-link" data-owner="${esc(o.name)}" data-view="${view}" aria-label="${esc(label)}">${n}</button>` : String(n);
          return `<tr>
            <td>${scope === "project" ? `<button class="cell-link name" data-owner="${esc(o.name)}" data-view="all">${esc(o.name)}</button>` : esc(o.name)}</td>
            <td class="num">${link(o.open, "open", `${o.open} open items for ${o.name}`)}</td>
            <td class="num ${o.overdue ? "bad-text" : ""}">${link(o.overdue, "overdue", `${o.overdue} overdue items for ${o.name}`)}</td>
            <td class="num">${link(o.closed, "closed", `${o.closed} closed items for ${o.name}`)}</td>
            <td class="num">${o.withDue ? pct(o.onTime / o.withDue) : "—"}</td></tr>`;
        }).join("")
          : `<tr><td colspan="5" class="empty">No action items yet.</td></tr>`}</tbody>
      </table>
    </div>
    ${scope === "project" ? `<p class="muted small">Select a name or number to see those action items.</p>` : ""}
    <p class="muted small">Hours saved assumes ${m.minutes} minutes of note-taking and follow-up per captured meeting (set <code>minutesSavedPerMeeting</code> in config.js). On time means closed on or before the due date.</p>`;

  el.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () => { scope = b.dataset.scope; ctx.render(); }));
  el.querySelectorAll(".cell-link").forEach((b) => b.addEventListener("click", () => {
    const view = b.dataset.view;
    applyFilter({ owner: b.dataset.owner, status: view === "closed" ? "Done" : view === "all" ? "all" : "open", lateOnly: view === "overdue" });
    ctx.selectTab("tracker");
  }));
  drawChart(el.querySelector("#closedChart"), m.weeks);
}

function drawChart(wrap, weeks) {
  const W = Math.max(wrap.clientWidth, 280), H = 200, padL = 28, padB = 26, padT = 12, padR = 8;
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const yMax = Math.max(2, Math.ceil(max / 2) * 2);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const slot = plotW / weeks.length, barW = Math.min(36, slot * 0.6);
  const y = (v) => padT + plotH - (v / yMax) * plotH;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Action items closed per week over the last ${weeks.length} weeks">`;
  for (const v of [0, yMax / 2, yMax]) {
    svg += `<line class="c-grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="c-axis" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  weeks.forEach((w, i) => {
    const cx = padL + slot * i + slot / 2, x = cx - barW / 2, top = y(w.count), base = y(0), r = Math.min(4, (base - top) / 2);
    const label = `${fmtShort(w.start.toISOString())}–${fmtShort(w.end.toISOString())}: ${w.count} closed`;
    if (w.count > 0) svg += `<path class="c-bar" d="M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z"/>`;
    svg += `<rect class="c-hit" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${plotH}" tabindex="0" data-tip="${esc(label)}" aria-label="${esc(label)}"/>`;
    if (i % 2 === 1 || weeks.length <= 6) svg += `<text class="c-axis" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(fmtShort(w.start.toISOString()))}</text>`;
  });
  svg += `</svg><div class="c-tip" hidden></div>`;
  wrap.innerHTML = svg;
  const tip = wrap.querySelector(".c-tip");
  const show = (e) => {
    const r = e.target.getBBox();
    tip.textContent = e.target.dataset.tip;
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(r.x + r.width / 2, 70), W - 70)}px`;
    tip.style.top = `${padT}px`;
    e.target.classList.add("on");
  };
  const hide = (e) => { tip.hidden = true; e.target.classList.remove("on"); };
  wrap.querySelectorAll(".c-hit").forEach((h) => {
    h.addEventListener("mouseenter", show); h.addEventListener("focus", show);
    h.addEventListener("mouseleave", hide); h.addEventListener("blur", hide);
  });
}
