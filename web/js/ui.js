// Small UI helpers shared by every view.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2800);
}

export function banner(html) {
  const b = $("#banner");
  b.innerHTML = html || "";
  b.hidden = !html;
}

export const fmtDay = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";
export const fmtShort = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
export const fromDateInput = (v) => (v ? new Date(`${v}T12:00:00`).toISOString() : null);
export const isPast = (iso) => !!iso && new Date(iso) < new Date(new Date().toDateString());
export const DAY = 864e5;

const PILL = {
  Done: "ok", Published: "ok", Approved: "ok", "On track": "ok", Closed: "ok", Ready: "ok",
  "Needs review": "warn", "Waiting for transcript": "warn", Pending: "warn", "At risk": "warn", "In progress": "info",
  Mitigating: "info", Processing: "info", Generating: "info", "Draft requested": "info",
  Error: "bad", Rejected: "bad", "Off track": "bad", Overdue: "bad", Blocked: "bad", High: "bad", Medium: "warn"
};
export const pill = (s, fallback = "New") => `<span class="pill ${PILL[s] || ""}">${esc(s || fallback)}</span>`;

export function csvDownload(filename, rows) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const text = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Busy wrapper: disables a button while an async action runs, shows errors as toasts.
export async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (err) { toast(err.message || String(err)); }
  finally { if (btn) btn.disabled = false; }
}
