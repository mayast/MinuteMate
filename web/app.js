/* MinuteMate setup website.
 * Static single-page app: signs in with Microsoft (auth code + PKCE, no secrets, no CDN libraries),
 * reads the user's upcoming Teams meetings, and writes MinuteMate settings to SharePoint lists via Microsoft Graph.
 * Add ?demo=1 to the URL to try it with sample data and no sign-in.
 */
(() => {
  "use strict";

  const CFG = window.MINUTEMATE_CONFIG || {};
  const DEMO = new URLSearchParams(location.search).has("demo");
  const SCOPES = "openid profile offline_access User.Read User.ReadBasic.All Calendars.Read Sites.ReadWrite.All";
  const REDIRECT = CFG.redirectUri || (location.origin + location.pathname);
  const AUTHORITY = `https://login.microsoftonline.com/${CFG.tenantId || "organizations"}/oauth2/v2.0`;
  const LISTS = { projects: "Projects", meetings: "Meetings", actions: "ActionItems", risks: "Risks", status: "StatusUpdates" };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
    del: (k) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } }
  };

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function banner(html) { const b = $("#banner"); b.innerHTML = html; b.hidden = !html; }

  // ---------------------------------------------------------------- auth (PKCE)
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function randomString(n = 64) {
    const a = new Uint8Array(n); crypto.getRandomValues(a);
    return b64url(a).slice(0, n);
  }
  async function signIn() {
    const verifier = randomString(64);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const state = randomString(24);
    store.set("mm_pkce", JSON.stringify({ verifier, state }));
    const q = new URLSearchParams({
      client_id: CFG.clientId, response_type: "code", redirect_uri: REDIRECT, response_mode: "query",
      scope: SCOPES, code_challenge: challenge, code_challenge_method: "S256", state, prompt: "select_account"
    });
    location.assign(`${AUTHORITY}/authorize?${q}`);
  }
  async function tokenRequest(params) {
    const res = await fetch(`${AUTHORITY}/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CFG.clientId, scope: SCOPES, ...params })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.error || "Sign-in failed");
    store.set("mm_token", JSON.stringify({
      access: data.access_token, refresh: data.refresh_token || JSON.parse(store.get("mm_token") || "{}").refresh,
      exp: Date.now() + (data.expires_in - 60) * 1000
    }));
  }
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    if (q.get("error")) throw new Error(q.get("error_description") || q.get("error"));
    if (!q.get("code")) return;
    const saved = JSON.parse(store.get("mm_pkce") || "{}");
    store.del("mm_pkce");
    history.replaceState(null, "", location.pathname);
    if (!saved.state || saved.state !== q.get("state")) throw new Error("Sign-in state didn't match. Please try again.");
    await tokenRequest({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: REDIRECT, code_verifier: saved.verifier });
  }
  async function accessToken() {
    const t = JSON.parse(store.get("mm_token") || "null");
    if (!t) return null;
    if (Date.now() < t.exp) return t.access;
    if (!t.refresh) return null;
    try { await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh }); }
    catch { store.del("mm_token"); return null; }
    return JSON.parse(store.get("mm_token")).access;
  }
  function signOut() {
    store.del("mm_token");
    location.assign(`${AUTHORITY}/logout?post_logout_redirect_uri=${encodeURIComponent(REDIRECT)}`);
  }

  // ---------------------------------------------------------------- Microsoft Graph data layer
  async function graph(path, { method = "GET", body, headers = {} } = {}) {
    const token = await accessToken();
    if (!token) throw new Error("Your sign-in expired. Please sign in again.");
    const url = path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`;
    const res = await fetch(url, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);
    return data;
  }

  const GraphData = {
    siteId: null, listIds: {},
    async init() {
      const site = await graph(`/sites/${CFG.siteHostname}:${CFG.sitePath}`);
      this.siteId = site.id;
      const lists = await graph(`/sites/${this.siteId}/lists?$select=id,displayName,webUrl&$top=200`);
      for (const [key, urlName] of Object.entries(LISTS)) {
        const l = lists.value.find((x) => decodeURIComponent(x.webUrl).toLowerCase().endsWith(`/lists/${urlName.toLowerCase()}`));
        if (!l) throw new Error(`List "${urlName}" wasn't found on the site. Run provisioning/Setup-MinuteMate.ps1 first.`);
        this.listIds[key] = l.id;
      }
    },
    async me() { const m = await graph("/me?$select=displayName,mail,userPrincipalName"); return { name: m.displayName, email: m.mail || m.userPrincipalName }; },
    async items(key) {
      let next = `/sites/${this.siteId}/lists/${this.listIds[key]}/items?$expand=fields&$top=500`;
      const out = [];
      for (let i = 0; next && i < 10; i++) {
        const page = await graph(next);
        out.push(...page.value.map((v) => ({ id: v.id, ...v.fields })));
        next = page["@odata.nextLink"];
      }
      return out;
    },
    async create(key, fields) { return graph(`/sites/${this.siteId}/lists/${this.listIds[key]}/items`, { method: "POST", body: { fields } }); },
    async update(key, id, fields) { return graph(`/sites/${this.siteId}/lists/${this.listIds[key]}/items/${id}/fields`, { method: "PATCH", body: fields }); },
    async remove(key, id) { return graph(`/sites/${this.siteId}/lists/${this.listIds[key]}/items/${id}`, { method: "DELETE" }); },
    async calendar(days) {
      const start = new Date(); const end = new Date(Date.now() + days * 864e5);
      const q = new URLSearchParams({
        startDateTime: start.toISOString(), endDateTime: end.toISOString(),
        $select: "id,subject,start,end,isOnlineMeeting,onlineMeeting,organizer", $orderby: "start/dateTime", $top: "100"
      });
      const res = await graph(`/me/calendarView?${q}`, { headers: { Prefer: 'outlook.timezone="UTC"' } });
      return res.value.filter((e) => e.isOnlineMeeting && e.onlineMeeting?.joinUrl).map((e) => ({
        id: e.id, title: e.subject || "(No title)", joinUrl: e.onlineMeeting.joinUrl,
        start: e.start.dateTime.replace(/(\.\d+)?$/, "Z"), end: e.end.dateTime.replace(/(\.\d+)?$/, "Z"),
        organizer: e.organizer?.emailAddress?.address || ""
      }));
    },
    async people(q) {
      const s = q.replace(/'/g, "''");
      const res = await graph(`/users?$filter=startswith(displayName,'${encodeURIComponent(s)}') or startswith(mail,'${encodeURIComponent(s)}')&$select=displayName,mail&$top=8`);
      return res.value.filter((u) => u.mail).map((u) => ({ name: u.displayName, email: u.mail }));
    }
  };

  // ---------------------------------------------------------------- demo data layer
  const DemoData = (() => {
    const day = (d, h, m = 0) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
    let seq = 100;
    const db = {
      projects: [
        { id: "1", Title: "Project Phoenix", ProjectOwnerEmail: "maya@contoso.com", ApproverEmail: "dana.lee@contoso.com", DefaultNotifyVia: "Teams", WeeklyStatusOn: true, OverallStatus: "At risk" },
        { id: "2", Title: "Website Localization 2027", ProjectOwnerEmail: "maya@contoso.com", ApproverEmail: "ken.sato@contoso.com", DefaultNotifyVia: "Teams and Outlook", WeeklyStatusOn: true, OverallStatus: "On track" }
      ],
      meetings: [
        { id: "11", Title: "Phoenix weekly sync", ProjectLookupId: "1", MeetingStart: day(-7, 10), ProcessingStatus: "Done", JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-past-1" },
        { id: "12", Title: "Vendor API checkpoint", ProjectLookupId: "1", MeetingStart: day(-2, 14), ProcessingStatus: "Needs review", JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-past-2" },
        { id: "13", Title: "Phoenix weekly sync", ProjectLookupId: "1", MeetingStart: day(0, 10), ProcessingStatus: "Waiting for transcript", JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-1" }
      ],
      actions: [
        { id: "21", Title: "Send revised timeline to stakeholders", ProjectLookupId: "1", OwnerAsWritten: "Priya Patel", DueDate: day(1, 17), ItemStatus: "In progress", Priority: "High" },
        { id: "22", Title: "Book JA/DE string review with language leads", ProjectLookupId: "1", OwnerAsWritten: "Laura Chen", DueDate: day(5, 17), ItemStatus: "Not started", Priority: "Medium" },
        { id: "23", Title: "Confirm vendor penalty clause with procurement", ProjectLookupId: "1", OwnerAsWritten: "Maya Stewart", DueDate: day(-1, 17), ItemStatus: "Not started", Priority: "High" },
        { id: "24", Title: "Draft localization style guide v2", ProjectLookupId: "2", OwnerAsWritten: "Ken Sato", DueDate: day(8, 17), ItemStatus: "Not started", Priority: "Low" }
      ],
      risks: [
        { id: "31", Title: "Vendor API may slip again", ProjectLookupId: "1", Impact: "High", RiskStatus: "Mitigating" },
        { id: "32", Title: "Localized strings not reviewed before beta", ProjectLookupId: "1", Impact: "Medium", RiskStatus: "Open" }
      ],
      status: [
        { id: "41", Title: "Project Phoenix — Status, week of last Friday", ProjectLookupId: "1", WeekOf: day(-7, 9), OverallStatus: "At risk", ApprovalStatus: "Published" },
        { id: "42", Title: "Project Phoenix — Status, this week", ProjectLookupId: "1", WeekOf: day(0, 9), OverallStatus: "At risk", ApprovalStatus: "Pending" }
      ]
    };
    const calendar = [
      { id: "e1", title: "Phoenix weekly sync", joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-1", start: day(0, 10), end: day(0, 10, 45), organizer: "maya@contoso.com" },
      { id: "e2", title: "Localization vendor QBR", joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-2", start: day(1, 13), end: day(1, 14), organizer: "ken.sato@contoso.com" },
      { id: "e3", title: "Beta go/no-go", joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-3", start: day(3, 9, 30), end: day(3, 10, 30), organizer: "dana.lee@contoso.com" },
      { id: "e4", title: "Design review: status dashboard", joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-4", start: day(4, 15), end: day(4, 15, 30), organizer: "maya@contoso.com" }
    ];
    const people = [
      { name: "Dana Lee", email: "dana.lee@contoso.com" }, { name: "Ken Sato", email: "ken.sato@contoso.com" },
      { name: "Laura Chen", email: "laura.chen@contoso.com" }, { name: "Priya Patel", email: "priya.patel@contoso.com" }
    ];
    const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 120));
    return {
      async init() {}, async me() { return { name: "Maya Stewart (demo)", email: "maya@contoso.com" }; },
      async items(key) { return wait(db[key]); },
      async create(key, fields) { const item = { id: String(++seq), ...fields }; db[key].push(item); return wait({ id: item.id }); },
      async update(key, id, fields) { Object.assign(db[key].find((x) => x.id === id), fields); return wait(null); },
      async remove(key, id) { db[key] = db[key].filter((x) => x.id !== id); return wait(null); },
      async calendar() { return wait(calendar); },
      async people(q) { const s = q.toLowerCase(); return wait(people.filter((p) => p.name.toLowerCase().startsWith(s) || p.email.startsWith(s))); }
    };
  })();

  const data = DEMO ? DemoData : GraphData;

  // ---------------------------------------------------------------- state + rendering
  const state = { projects: [], meetings: [], calendar: [], projectId: null };
  const fmtDay = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const statusPill = (s) => {
    const cls = { Done: "ok", Published: "ok", Approved: "ok", "On track": "ok", "Needs review": "warn", "Waiting for transcript": "warn", Pending: "warn", "At risk": "warn", Error: "bad", Rejected: "bad", "Off track": "bad", Overdue: "bad" }[s] || "";
    return `<span class="pill ${cls}">${esc(s || "New")}</span>`;
  };
  const currentProject = () => state.projects.find((p) => p.id === state.projectId);

  function renderProjectSelect() {
    const sel = $("#projectSelect");
    sel.innerHTML = state.projects.length
      ? state.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.Title)}</option>`).join("")
      : `<option value="">No projects yet</option>`;
    if (state.projectId) sel.value = state.projectId;
  }

  function renderMeetings() {
    const list = $("#meetingList");
    const project = currentProject();
    if (!project) { list.innerHTML = `<li class="empty">Create a project first on the <strong>Projects</strong> tab.</li>`; return; }
    if (!state.calendar.length) { list.innerHTML = `<li class="empty">No upcoming Teams meetings in the next ${CFG.meetingLookaheadDays || 14} days.</li>`; return; }
    list.innerHTML = state.calendar.map((e) => {
      const item = state.meetings.find((m) => m.JoinUrl === e.joinUrl);
      const other = item && item.ProjectLookupId !== project.id ? state.projects.find((p) => p.id === item.ProjectLookupId) : null;
      const d = new Date(e.start);
      const status = item ? (other ? `<span class="pill">Captured for ${esc(other.Title)}</span>` : statusPill(item.ProcessingStatus)) : "";
      return `<li class="meeting">
        <div class="date-chip"><span class="m">${esc(d.toLocaleDateString(undefined, { month: "short" }))}</span><span class="d">${d.getDate()}</span></div>
        <div>
          <div class="title">${esc(e.title)}</div>
          <div class="meta">${esc(fmtDay(e.start))} · ${esc(fmtTime(e.start))}–${esc(fmtTime(e.end))} · Organizer ${esc(e.organizer || "unknown")} ${status}</div>
        </div>
        <label class="toggle"><input type="checkbox" data-join="${esc(e.joinUrl)}" ${item ? "checked" : ""} ${other ? "disabled" : ""}> Capture</label>
      </li>`;
    }).join("");
  }

  async function renderActivity() {
    const p = currentProject();
    const ids = ["#recentMeetings", "#openActions", "#openRisks", "#statusUpdates"];
    if (!p) { ids.forEach((s) => ($(s).innerHTML = `<li class="empty">No project selected.</li>`)); $("#stats").innerHTML = ""; return; }
    const [actions, risks, status] = await Promise.all([data.items("actions"), data.items("risks"), data.items("status")]);
    const mine = (arr) => arr.filter((x) => String(x.ProjectLookupId) === p.id);
    const meetings = mine(state.meetings).sort((a, b) => (b.MeetingStart || "").localeCompare(a.MeetingStart || "")).slice(0, 6);
    const open = mine(actions).filter((a) => a.ItemStatus !== "Done").sort((a, b) => (a.DueDate || "9").localeCompare(b.DueDate || "9"));
    const overdue = open.filter((a) => a.DueDate && new Date(a.DueDate) < new Date());
    const openRisks = mine(risks).filter((r) => r.RiskStatus !== "Closed");
    const updates = mine(status).sort((a, b) => (b.WeekOf || "").localeCompare(a.WeekOf || "")).slice(0, 5);

    $("#stats").innerHTML = [
      [p.OverallStatus || "—", "Overall status"], [open.length, "Open action items"],
      [overdue.length, "Overdue"], [openRisks.length, "Open risks"]
    ].map(([n, l]) => `<div class="stat"><span class="n">${esc(n)}</span><span class="l">${esc(l)}</span></div>`).join("");

    const rows = (arr, fn, empty) => arr.length ? arr.map(fn).join("") : `<li class="empty">${empty}</li>`;
    $("#recentMeetings").innerHTML = rows(meetings, (m) => `<li><span>${esc(m.Title)}<br><span class="sub">${m.MeetingStart ? esc(fmtDay(m.MeetingStart)) : ""}</span></span>${statusPill(m.ProcessingStatus)}</li>`, "No meetings captured yet.");
    $("#openActions").innerHTML = rows(open.slice(0, 8), (a) => {
      const late = a.DueDate && new Date(a.DueDate) < new Date();
      return `<li><span>${esc(a.Title)}<br><span class="sub">${esc(a.OwnerAsWritten || "No owner")} · ${a.DueDate ? "due " + esc(fmtDay(a.DueDate)) : "no due date"}</span></span>${late ? statusPill("Overdue") : `<span class="pill">${esc(a.Priority || "")}</span>`}</li>`;
    }, "Nothing open.");
    $("#openRisks").innerHTML = rows(openRisks, (r) => `<li><span>${esc(r.Title)}<br><span class="sub">${esc(r.RiskStatus || "Open")}</span></span><span class="pill ${r.Impact === "High" ? "bad" : r.Impact === "Medium" ? "warn" : ""}">${esc(r.Impact || "")}</span></li>`, "No open risks.");
    $("#statusUpdates").innerHTML = rows(updates, (s) => `<li><span>${esc(s.Title)}<br><span class="sub">${statusPill(s.OverallStatus)}</span></span>${statusPill(s.ApprovalStatus)}</li>`, "No status updates yet.");
  }

  function fillProjectForm(p) {
    const f = $("#projectForm");
    f.id.value = p?.id || "";
    f.title.value = p?.Title || "";
    f.ownerEmail.value = p?.ProjectOwnerEmail || (state.me?.email ?? "");
    f.approverEmail.value = p?.ApproverEmail || "";
    $$('input[name="notify"]', f).forEach((r) => (r.checked = r.value === (p?.DefaultNotifyVia || "Teams")));
    f.weekly.checked = p ? !!p.WeeklyStatusOn : true;
    $("#projectFormTitle").textContent = p ? `Settings: ${p.Title}` : "New project";
  }

  function selectTab(name) {
    $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    $$(".panel").forEach((p) => (p.hidden = p.dataset.panel !== name));
    if (name === "projects") fillProjectForm(currentProject());
    if (name === "activity") renderActivity().catch((e) => toast(e.message));
  }

  async function loadAll() {
    const [projects, meetings, calendar] = await Promise.all([data.items("projects"), data.items("meetings"), data.calendar(CFG.meetingLookaheadDays || 14)]);
    state.projects = projects.map((p) => ({ ...p, id: String(p.id) }));
    state.meetings = meetings.map((m) => ({ ...m, id: String(m.id), ProjectLookupId: String(m.ProjectLookupId ?? "") }));
    state.calendar = calendar;
    if (!state.projects.some((p) => p.id === state.projectId)) state.projectId = state.projects[0]?.id || null;
    renderProjectSelect();
    renderMeetings();
  }

  // ---------------------------------------------------------------- actions
  async function toggleCapture(input) {
    const project = currentProject();
    const e = state.calendar.find((x) => x.joinUrl === input.dataset.join);
    const existing = state.meetings.find((m) => m.JoinUrl === e.joinUrl);
    input.disabled = true;
    try {
      if (input.checked && !existing) {
        await captureMeeting({ title: e.title, joinUrl: e.joinUrl, start: e.start, end: e.end, organizer: e.organizer }, project);
        toast(`MinuteMate will capture "${e.title}"`);
      } else if (!input.checked && existing) {
        if (existing.ProcessingStatus && existing.ProcessingStatus !== "Waiting for transcript") {
          input.checked = true; toast("Already processed. Remove it from the Meetings list instead."); return;
        }
        await data.remove("meetings", existing.id);
        toast(`Stopped capturing "${e.title}"`);
      }
      await loadAll();
    } catch (err) { input.checked = !input.checked; toast(err.message); }
    finally { input.disabled = false; }
  }

  async function captureMeeting(m, project) {
    await data.create("meetings", {
      Title: m.title, ProjectLookupId: Number(project.id) || project.id,
      MeetingDate: m.start, MeetingStart: m.start, MeetingEnd: m.end,
      JoinUrl: m.joinUrl, OrganizerEmail: m.organizer,
      CaptureMode: "Teams transcript", ProcessingStatus: "Waiting for transcript"
    });
  }

  async function saveProject(ev) {
    ev.preventDefault();
    const f = ev.target;
    const fields = {
      Title: f.title.value.trim(), ProjectOwnerEmail: f.ownerEmail.value.trim(), ApproverEmail: f.approverEmail.value.trim(),
      DefaultNotifyVia: $('input[name="notify"]:checked', f).value, WeeklyStatusOn: f.weekly.checked
    };
    const btn = $('button[type="submit"]', f); btn.disabled = true;
    try {
      if (f.id.value) { await data.update("projects", f.id.value, fields); state.projectId = f.id.value; }
      else { const res = await data.create("projects", fields); state.projectId = String(res.id); }
      await loadAll(); fillProjectForm(currentProject()); toast("Project saved");
    } catch (err) { toast(err.message); }
    finally { btn.disabled = false; }
  }

  async function addByLink(ev) {
    ev.preventDefault();
    const f = ev.target; const project = currentProject();
    if (!project) return toast("Create a project first.");
    if (!/^https:\/\/teams\.(microsoft|live)\.com\//i.test(f.joinUrl.value)) return toast("That doesn't look like a Teams meeting link.");
    try {
      await captureMeeting({
        title: f.title.value.trim(), joinUrl: f.joinUrl.value.trim(), organizer: f.organizer.value.trim(),
        start: new Date(f.start.value).toISOString(), end: new Date(f.end.value).toISOString()
      }, project);
      f.reset(); toast("Meeting added"); await loadAll();
    } catch (err) { toast(err.message); }
  }

  let peopleTimer;
  function suggestPeople(ev) {
    const q = ev.target.value.trim();
    clearTimeout(peopleTimer);
    if (q.length < 2 || q.includes("@")) return;
    peopleTimer = setTimeout(async () => {
      try {
        const people = await data.people(q);
        $("#peopleList").innerHTML = people.map((p) => `<option value="${esc(p.email)}">${esc(p.name)}</option>`).join("");
      } catch { /* suggestions are optional */ }
    }, 250);
  }

  // ---------------------------------------------------------------- boot
  async function boot() {
    $("#signinBtn").addEventListener("click", signIn);
    $$(".tabs button").forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));
    $("#projectSelect").addEventListener("change", (e) => { state.projectId = e.target.value; renderMeetings(); selectTab($('.tabs [aria-selected="true"]').dataset.tab); });
    $("#meetingList").addEventListener("change", (e) => { if (e.target.matches("input[data-join]")) toggleCapture(e.target); });
    $("#refreshMeetings").addEventListener("click", () => loadAll().then(() => toast("Refreshed")).catch((e) => toast(e.message)));
    $("#projectForm").addEventListener("submit", saveProject);
    $("#linkForm").addEventListener("submit", addByLink);
    $("#newProjectBtn").addEventListener("click", () => fillProjectForm(null));
    $$('#projectForm input[type="email"]').forEach((i) => i.addEventListener("input", suggestPeople));

    try {
      if (!DEMO) {
        if (!CFG.clientId) {
          $("#signin").hidden = false; $("#signinBtn").disabled = true;
          banner(`This site isn't connected to Microsoft 365 yet. Add your app registration to <code>config.js</code> (see <code>docs/setup-website.md</code>), or <a href="?demo=1">try the demo</a>.`);
          return;
        }
        await handleRedirect();
        if (!(await accessToken())) { $("#signin").hidden = false; return; }
      } else {
        banner(`Demo mode: sample data only, nothing is saved. <a href="${esc(location.pathname)}">Exit demo</a>`);
      }
      await data.init();
      state.me = await data.me();
      $("#account").innerHTML = `<span>${esc(state.me.name)}</span>` + (DEMO ? "" : `<button class="btn ghost small" id="signoutBtn">Sign out</button>`);
      $("#signoutBtn")?.addEventListener("click", signOut);
      $("#app").hidden = false;
      await loadAll();
    } catch (err) {
      $("#signin").hidden = false;
      banner(esc(err.message));
    }
  }
  boot();
})();
