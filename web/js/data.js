// Data access: Microsoft Graph (as the signed-in user) or in-memory sample data for ?demo=1.
// Every list item comes back as a flat object: { id, Title, ProjectLookupId, ...fields }.
import { accessToken } from "./auth.js";
import { REQUIRED } from "./schema.js";

const CFG = window.MINUTEMATE_CONFIG || {};

// ------------------------------------------------------------------ which SharePoint site
// The site comes from (1) what this person entered on the Setup screen, saved in their browser,
// or (2) config.js. People only need to enter it once, so a team can share one website.
const SITE_KEY = "mm_site";
const PLACEHOLDER_HOSTS = ["", "contoso.sharepoint.com"];
export function parseSiteUrl(text) {
  try {
    const u = new URL(String(text).trim());
    if (!/\.sharepoint\.(com|us|de|cn)$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/(sites|teams)\/[^/]+/i);
    return { host: u.hostname, path: m ? m[0] : "", url: `https://${u.hostname}${m ? m[0] : ""}` };
  } catch { return null; }
}
export function resolveSite() {
  try { const saved = localStorage.getItem(SITE_KEY); if (saved && parseSiteUrl(saved)) return parseSiteUrl(saved); } catch { /* storage blocked */ }
  if (CFG.siteUrl) return parseSiteUrl(CFG.siteUrl);
  if (!PLACEHOLDER_HOSTS.includes(CFG.siteHostname || "")) return parseSiteUrl(`https://${CFG.siteHostname}${CFG.sitePath || ""}`);
  return null;
}
export function saveSite(site) {
  try { localStorage.setItem(SITE_KEY, site.url); return true; } catch { return false; }
}
export function clearSite() { try { localStorage.removeItem(SITE_KEY); } catch { /* ignore */ } }

// list key → list URL name created by provisioning/Setup-MinuteMate.ps1
export const LISTS = {
  projects: "Projects", meetings: "Meetings", actions: "ActionItems", risks: "Risks", decisions: "Decisions",
  status: "StatusUpdates", milestones: "Milestones", stakeholders: "Stakeholders", kickoffs: "Kickoffs"
};

function normalize(key, item) {
  const out = { ...item, id: String(item.id) };
  if (out.ProjectLookupId != null) out.ProjectLookupId = String(out.ProjectLookupId);
  if (key === "milestones") {
    const raw = item.DependsOnIds ?? item.DependsOn ?? [];
    out.DependsOnIds = (Array.isArray(raw) ? raw : []).map((d) => String(typeof d === "object" ? d.LookupId : d));
  }
  return out;
}

// ------------------------------------------------------------------ Microsoft Graph
async function graph(path, { method = "GET", body, headers = {} } = {}) {
  const token = await accessToken();
  if (!token) throw new Error("Your sign-in expired. Please sign in again.");
  const url = path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);
  return data;
}

export const GraphData = {
  siteId: null,
  site: null,
  listIds: {},
  missingLists: [],
  async init(site) {
    let found;
    try { found = await graph(`/sites/${site.host}:${site.path || "/"}`); }
    catch (e) { throw new Error(`Couldn't open the SharePoint site ${site.url}. Check the address, and that you have access to it. (${e.message})`); }
    this.siteId = found.id;
    this.site = { name: found.displayName, url: found.webUrl };
    const lists = await graph(`/sites/${this.siteId}/lists?$select=id,displayName,webUrl&$top=200`);
    this.listIds = {};
    this.missingLists = [];
    for (const [key, urlName] of Object.entries(LISTS)) {
      const l = lists.value.find((x) => decodeURIComponent(x.webUrl).toLowerCase().endsWith(`/lists/${urlName.toLowerCase()}`));
      if (l) this.listIds[key] = l.id; else this.missingLists.push(urlName);
    }
  },
  async checkSetup() {
    const results = [];
    for (const [urlName, req] of Object.entries(REQUIRED)) {
      const key = Object.keys(LISTS).find((k) => LISTS[k] === urlName);
      const id = this.listIds[key];
      if (!id) { results.push({ title: req.title, exists: false, missing: req.columns, notes: [] }); continue; }
      const cols = await graph(`/sites/${this.siteId}/lists/${id}/columns?$select=name,choice&$top=500`);
      const names = new Set(cols.value.map((c) => c.name));
      const notes = [];
      if (urlName === "Meetings") {
        const ps = cols.value.find((c) => c.name === "ProcessingStatus");
        if (ps?.choice && !ps.choice.choices.includes("Waiting for transcript")) notes.push("Processing Status is missing the choice \"Waiting for transcript\". Add it in List settings.");
      }
      results.push({ title: req.title, exists: true, missing: req.columns.filter((c) => !names.has(c)), notes });
    }
    return { site: this.site, lists: results };
  },
  async me() {
    const m = await graph("/me?$select=displayName,mail,userPrincipalName");
    return { name: m.displayName, email: m.mail || m.userPrincipalName };
  },
  async items(key) {
    if (!this.listIds[key]) return [];
    let next = `/sites/${this.siteId}/lists/${this.listIds[key]}/items?$expand=fields&$top=500`;
    const out = [];
    for (let i = 0; next && i < 10; i++) {
      const page = await graph(next);
      out.push(...page.value.map((v) => normalize(key, { ...v.fields, id: v.id, webUrl: v.webUrl })));
      next = page["@odata.nextLink"];
    }
    return out;
  },
  async create(key, fields) {
    const r = await graph(`/sites/${this.siteId}/lists/${this.listIds[key]}/items`, { method: "POST", body: { fields } });
    return { id: String(r.id) };
  },
  async update(key, id, fields) {
    return graph(`/sites/${this.siteId}/lists/${this.listIds[key]}/items/${id}/fields`, { method: "PATCH", body: fields });
  },
  async remove(key, id) {
    return graph(`/sites/${this.siteId}/lists/${this.listIds[key]}/items/${id}`, { method: "DELETE" });
  },
  async setDeps(id, ids) {
    return this.update("milestones", id, {
      "DependsOnLookupId@odata.type": "Collection(Edm.Int32)",
      DependsOnLookupId: ids.map(Number)
    });
  },
  async calendar(days) {
    const start = new Date();
    const end = new Date(Date.now() + days * 864e5);
    const q = new URLSearchParams({
      startDateTime: start.toISOString(), endDateTime: end.toISOString(),
      $select: "id,subject,start,end,isOnlineMeeting,onlineMeeting,organizer,seriesMasterId,type",
      $orderby: "start/dateTime", $top: "200"
    });
    const res = await graph(`/me/calendarView?${q}`, { headers: { Prefer: 'outlook.timezone="UTC"' } });
    const z = (s) => s.replace(/(\.\d+)?$/, "Z");
    return res.value
      .filter((e) => e.isOnlineMeeting && e.onlineMeeting?.joinUrl)
      .map((e) => ({
        id: e.id, title: e.subject || "(No title)", joinUrl: e.onlineMeeting.joinUrl,
        start: z(e.start.dateTime), end: z(e.end.dateTime),
        organizer: e.organizer?.emailAddress?.address || "", seriesId: e.seriesMasterId || ""
      }));
  },
  async people(q) {
    const s = encodeURIComponent(q.replace(/'/g, "''"));
    const res = await graph(`/users?$filter=startswith(displayName,'${s}') or startswith(mail,'${s}')&$select=displayName,mail&$top=8`);
    return res.value.filter((u) => u.mail).map((u) => ({ name: u.displayName, email: u.mail }));
  }
};

// ------------------------------------------------------------------ demo data
export function createDemoData() {
  const at = (d, h = 12, m = 0) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  let seq = 500;
  const db = {
    projects: [
      { id: "1", Title: "Project Phoenix", ProjectCode: "PHX", ProjectOwnerEmail: "maya@contoso.com", ApproverEmail: "dana.lee@contoso.com",
        DefaultNotifyVia: "Teams", WeeklyStatusOn: true, OverallStatus: "At risk", AutoCaptureKeywords: "Phoenix, go/no-go",
        StartDate: at(-30), TargetDate: at(45), WorkTracker: "Azure DevOps", TrackerTarget: "contoso/Phoenix",
        TranscriptRetentionDays: 30, PostRecapToChat: true, PostAgendaToChat: true },
      { id: "2", Title: "Website Localization 2027", ProjectCode: "LOC27", ProjectOwnerEmail: "maya@contoso.com", ApproverEmail: "ken.sato@contoso.com",
        DefaultNotifyVia: "Teams and Outlook", WeeklyStatusOn: true, OverallStatus: "On track", AutoCaptureKeywords: "localization",
        StartDate: at(-10), TargetDate: at(80), WorkTracker: "Planner", TrackerTarget: "",
        TranscriptRetentionDays: 90, PostRecapToChat: true, PostAgendaToChat: false }
    ],
    meetings: [
      { id: "15", Title: "Phoenix weekly sync", ProjectLookupId: "1", MeetingStart: at(-28, 10), Summary: "Kicked off the weekly sync. Agreed the support escalation path needs review before beta.", ProcessingStatus: "Done", CaptureMode: "Teams transcript", JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-past-5", SeriesId: "s-phx", RecapPosted: true },
      { id: "16", Title: "Phoenix weekly sync", ProjectLookupId: "1", MeetingStart: at(-21, 10), Summary: "Beta customer list and announcement owners confirmed. Launch messaging draft due next week.", ProcessingStatus: "Done", CaptureMode: "Teams transcript", JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-past-6", SeriesId: "s-phx", RecapPosted: true },
      { id: "17", Title: "Phoenix weekly sync", ProjectLookupId: "1", MeetingStart: at(-14, 10), Summary: "Beta FAQ assigned to Ken. Team agreed launch success metrics need sign-off from Dana.", ProcessingStatus: "Done", CaptureMode: "Teams transcript", JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-past-7", SeriesId: "s-phx", RecapPosted: true },
      { id: "18", Title: "Vendor API kickoff", ProjectLookupId: "1", MeetingStart: at(-25, 14), Summary: "Vendor walked through the API plan. Ken to share the test plan; integration starts mid-month.", ProcessingStatus: "Done", CaptureMode: "Teams transcript", JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-past-8", RecapPosted: true },
      { id: "11", Title: "Phoenix weekly sync", ProjectLookupId: "1", MeetingStart: at(-7, 10), Summary: "Beta scope is frozen and launch moved to June 12 because the vendor API slipped. Priya will send the revised timeline; Maya will confirm the vendor penalty clause.", ProcessingStatus: "Done", SeriesId: "s-phx", RecapPosted: true, CaptureMode: "Teams transcript", JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-past-1", NotesPage: { Url: "https://contoso.sharepoint.com/sites/ProjectHub/SitePages/Notes-Phoenix-weekly-sync.aspx" } },
      { id: "12", Title: "Vendor API checkpoint", ProjectLookupId: "1", MeetingStart: at(-2, 14), Summary: "Vendor confirmed a new API date. Localized UI strings haven't been reviewed; Laura will book the language leads. Some owners were unclear, so this meeting needs review.", ProcessingStatus: "Needs review", CaptureMode: "Teams transcript", JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-past-2" },
      { id: "14", Title: "Design sync", ProjectLookupId: "1", MeetingStart: at(-1, 11), ProcessingStatus: "Error", CaptureMode: "Teams transcript", TranscriptAttempts: 12, JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-past-3" },
      { id: "19", Title: "Phoenix weekly sync", ProjectLookupId: "1", MeetingStart: at(7, 10), MeetingEnd: at(7, 10, 45), ProcessingStatus: "Waiting for transcript", CaptureMode: "Teams transcript", JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-5", SeriesId: "s-phx" },
      { id: "13", Title: "Phoenix weekly sync", ProjectLookupId: "1", MeetingStart: at(0, 10), MeetingEnd: at(0, 10, 45), ProcessingStatus: "Waiting for transcript", CaptureMode: "Teams transcript", JoinUrl: "https://teams.microsoft.com/l/meetup-join/demo-1", SeriesId: "s-phx" }
    ],
    actions: [
      { id: "21", Title: "Send revised timeline to stakeholders", ProjectLookupId: "1", OwnerAsWritten: "Priya Patel", OwnerEmail: "priya.patel@contoso.com", DueDate: at(1), ItemStatus: "In progress", Priority: "High", Source: "Meeting", Created: at(-7), SourceMeetingLookupId: "11", SeenInMeetings: 2, ExternalLink: { Url: "https://dev.azure.com/contoso/Phoenix/_workitems/edit/4812" }, SyncState: "Synced" },
      { id: "22", Title: "Book JA/DE string review with language leads", ProjectLookupId: "1", OwnerAsWritten: "Laura Chen", OwnerEmail: "laura.chen@contoso.com", DueDate: at(5), ItemStatus: "Not started", Priority: "Medium", Source: "Meeting", Created: at(-2), SourceMeetingLookupId: "12", ExternalLink: { Url: "https://dev.azure.com/contoso/Phoenix/_workitems/edit/4830" }, SyncState: "Synced" },
      { id: "23", Title: "Confirm vendor penalty clause with procurement", ProjectLookupId: "1", OwnerAsWritten: "Maya Stewart", OwnerEmail: "maya@contoso.com", DueDate: at(-1), ItemStatus: "Not started", Priority: "High", Source: "Meeting", Created: at(-7), SourceMeetingLookupId: "11", SyncState: "Error" },
      { id: "25", Title: "Update beta FAQ for support team", ProjectLookupId: "1", OwnerAsWritten: "Ken Sato", OwnerEmail: "ken.sato@contoso.com", DueDate: at(-3), ItemStatus: "Done", Priority: "Low", Source: "Meeting", Created: at(-14), ClosedDate: at(-4), SourceMeetingLookupId: "17", SyncState: "Synced" },
      { id: "26", Title: "Share vendor API test plan", ProjectLookupId: "1", OwnerAsWritten: "Ken Sato", OwnerEmail: "ken.sato@contoso.com", DueDate: at(-20), ItemStatus: "Done", Priority: "High", Source: "Meeting", Created: at(-25), ClosedDate: at(-21), SourceMeetingLookupId: "18" },
      { id: "27", Title: "Draft beta announcement", ProjectLookupId: "1", OwnerAsWritten: "Dana Lee", OwnerEmail: "dana.lee@contoso.com", DueDate: at(-15), ItemStatus: "Done", Priority: "Medium", Source: "Meeting", Created: at(-21), ClosedDate: at(-13), SourceMeetingLookupId: "16" },
      { id: "28", Title: "Confirm beta customer list", ProjectLookupId: "1", OwnerAsWritten: "Priya Patel", OwnerEmail: "priya.patel@contoso.com", DueDate: at(-10), ItemStatus: "Done", Priority: "High", Source: "Meeting", Created: at(-21), ClosedDate: at(-11), SourceMeetingLookupId: "16" },
      { id: "29", Title: "Set up beta telemetry dashboard", ProjectLookupId: "1", OwnerAsWritten: "Ken Sato", OwnerEmail: "ken.sato@contoso.com", DueDate: at(-6), ItemStatus: "Done", Priority: "Medium", Source: "Manual", Created: at(-18), ClosedDate: at(-6) },
      { id: "30", Title: "Review support escalation path", ProjectLookupId: "1", OwnerAsWritten: "Maya Stewart", OwnerEmail: "maya@contoso.com", DueDate: at(-24), ItemStatus: "Done", Priority: "Low", Source: "Meeting", Created: at(-28), ClosedDate: at(-25), SourceMeetingLookupId: "15" },
      { id: "31", Title: "Agree on launch success metrics", ProjectLookupId: "1", OwnerAsWritten: "Dana Lee", OwnerEmail: "dana.lee@contoso.com", DueDate: at(-12), ItemStatus: "Done", Priority: "High", Source: "Meeting", Created: at(-14), ClosedDate: at(-9), SourceMeetingLookupId: "17" },
      { id: "24", Title: "Draft localization style guide v2", ProjectLookupId: "2", OwnerAsWritten: "Ken Sato", OwnerEmail: "ken.sato@contoso.com", DueDate: at(8), ItemStatus: "Not started", Priority: "Low" }
    ],
    risks: [
      { id: "33", Title: "Vendor API may slip again", ProjectLookupId: "1", Impact: "High", Likelihood: "Medium", Mitigation: "Weekly vendor check-in; manual CSV import fallback", RiskStatus: "Mitigating" },
      { id: "34", Title: "Localized strings not reviewed before beta", ProjectLookupId: "1", SourceMeetingLookupId: "12", Created: at(-2), Impact: "Medium", Likelihood: "High", Mitigation: "Book review with language leads", RiskStatus: "Open" }
    ],
    decisions: [
      { id: "51", Title: "Launch moved from June 5 to June 12", ProjectLookupId: "1", SourceMeetingLookupId: "11", DecisionDate: at(-7), DecidedBy: "Steering group", Rationale: "Vendor API not ready" },
      { id: "52", Title: "Beta scope frozen", ProjectLookupId: "1", SourceMeetingLookupId: "11", DecisionDate: at(-7), DecidedBy: "Product and engineering", Rationale: "Protect the launch date" }
    ],
    status: [
      { id: "41", Title: "Project Phoenix — Status, last week", ProjectLookupId: "1", WeekOf: at(-7), OverallStatus: "At risk", ApprovalStatus: "Published" },
      { id: "42", Title: "Project Phoenix — Status, this week", ProjectLookupId: "1", WeekOf: at(0), OverallStatus: "At risk", ApprovalStatus: "Pending" }
    ],
    milestones: [
      { id: "61", Title: "Requirements signed off", ProjectLookupId: "1", Workstream: "Product", StartDate: at(-30), DueDate: at(-18), MilestoneStatus: "Done", OwnerEmail: "dana.lee@contoso.com", DependsOnIds: [] },
      { id: "62", Title: "Vendor API integration", ProjectLookupId: "1", Workstream: "Engineering", StartDate: at(-16), DueDate: at(9), MilestoneStatus: "In progress", OwnerEmail: "ken.sato@contoso.com", DependsOnIds: ["61"] },
      { id: "63", Title: "Beta build", ProjectLookupId: "1", Workstream: "Engineering", StartDate: at(6), DueDate: at(20), MilestoneStatus: "Not started", OwnerEmail: "ken.sato@contoso.com", DependsOnIds: ["62"] },
      { id: "64", Title: "UI string localization (JA, DE)", ProjectLookupId: "1", Workstream: "Localization", StartDate: at(-5), DueDate: at(14), MilestoneStatus: "In progress", OwnerEmail: "laura.chen@contoso.com", DependsOnIds: ["61"] },
      { id: "65", Title: "Localized QA", ProjectLookupId: "1", Workstream: "Localization", StartDate: at(15), DueDate: at(26), MilestoneStatus: "Not started", OwnerEmail: "laura.chen@contoso.com", DependsOnIds: ["64", "63"] },
      { id: "66", Title: "Launch readiness review", ProjectLookupId: "1", Workstream: "Launch", StartDate: at(30), DueDate: at(32), MilestoneStatus: "Not started", OwnerEmail: "maya@contoso.com", DependsOnIds: ["65"], IsGate: true },
      { id: "67", Title: "Launch", ProjectLookupId: "1", Workstream: "Launch", StartDate: at(38), DueDate: at(38), MilestoneStatus: "Not started", OwnerEmail: "maya@contoso.com", DependsOnIds: ["66"], IsGate: true },
      { id: "71", Title: "Vendor selection", ProjectLookupId: "2", Workstream: "Vendors", StartDate: at(-10), DueDate: at(10), MilestoneStatus: "In progress", OwnerEmail: "ken.sato@contoso.com", DependsOnIds: [] }
    ],
    stakeholders: [
      { id: "81", Title: "Dana Lee", ProjectLookupId: "1", Email: "dana.lee@contoso.com", Role: "Product director", RACI: "Accountable", Influence: "High" },
      { id: "82", Title: "Maya Stewart", ProjectLookupId: "1", Email: "maya@contoso.com", Role: "Program manager", RACI: "Responsible", Influence: "High" },
      { id: "83", Title: "Ken Sato", ProjectLookupId: "1", Email: "ken.sato@contoso.com", Role: "Engineering lead", RACI: "Responsible", Influence: "Medium" },
      { id: "84", Title: "Laura Chen", ProjectLookupId: "1", Email: "laura.chen@contoso.com", Role: "Localization lead", RACI: "Consulted", Influence: "Medium" },
      { id: "85", Title: "Support org", ProjectLookupId: "1", Email: "", Role: "Customer support", RACI: "Informed", Influence: "Low" }
    ],
    kickoffs: [
      { id: "91", Title: "Project Phoenix kickoff", ProjectLookupId: "1", Goal: "Launch the Phoenix beta to 500 customers.", KickoffStatus: "Ready", CharterPage: { Url: "#" } }
    ]
  };
  const calendar = [
    { id: "e1", title: "Phoenix weekly sync", joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-1", start: at(0, 10), end: at(0, 10, 45), organizer: "maya@contoso.com", seriesId: "s-phx" },
    { id: "e2", title: "Localization vendor QBR", joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-2", start: at(1, 13), end: at(1, 14), organizer: "ken.sato@contoso.com", seriesId: "" },
    { id: "e7", title: "Exec 1:1 [no-capture]", joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-7", start: at(2, 16), end: at(2, 16, 30), organizer: "dana.lee@contoso.com", seriesId: "" },
    { id: "e3", title: "Beta go/no-go", joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-3", start: at(3, 9, 30), end: at(3, 10, 30), organizer: "dana.lee@contoso.com", seriesId: "" },
    { id: "e5", title: "Phoenix weekly sync", joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-5", start: at(7, 10), end: at(7, 10, 45), organizer: "maya@contoso.com", seriesId: "s-phx" },
    { id: "e4", title: "Design review: status dashboard", joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-4", start: at(4, 15), end: at(4, 15, 30), organizer: "maya@contoso.com", seriesId: "" },
    { id: "e6", title: "Phoenix weekly sync", joinUrl: "https://teams.microsoft.com/l/meetup-join/demo-6", start: at(14, 10), end: at(14, 10, 45), organizer: "maya@contoso.com", seriesId: "s-phx" }
  ].sort((a, b) => a.start.localeCompare(b.start));
  const people = [
    { name: "Dana Lee", email: "dana.lee@contoso.com" }, { name: "Ken Sato", email: "ken.sato@contoso.com" },
    { name: "Laura Chen", email: "laura.chen@contoso.com" }, { name: "Priya Patel", email: "priya.patel@contoso.com" }
  ];
  const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 60));
  return {
    site: { name: "Project Hub (demo)", url: "https://contoso.sharepoint.com/sites/ProjectHub" },
    missingLists: [],
    async init() {},
    async me() { return { name: "Maya Stewart (demo)", email: "maya@contoso.com" }; },
    async checkSetup() {
      return wait({ site: this.site, lists: Object.values(REQUIRED).map((r) => ({ title: r.title, exists: true, missing: [], notes: [] })) });
    },
    async items(key) { return wait(db[key].map((x) => normalize(key, x))); },
    async create(key, fields) { const item = { id: String(++seq), Created: new Date().toISOString(), ...fields }; if (key === "milestones") item.DependsOnIds = item.DependsOnIds || []; db[key].push(item); return wait({ id: item.id }); },
    async update(key, id, fields) { Object.assign(db[key].find((x) => x.id === id), fields); return wait(null); },
    async remove(key, id) { db[key] = db[key].filter((x) => x.id !== id); return wait(null); },
    async setDeps(id, ids) { db.milestones.find((x) => x.id === id).DependsOnIds = ids.map(String); return wait(null); },
    async calendar() { return wait(calendar); },
    async people(q) { const s = q.toLowerCase(); return wait(people.filter((p) => p.name.toLowerCase().startsWith(s) || p.email.startsWith(s))); }
  };
}
