// MinuteMate website: boot, shared state and tab routing.
import { $, $$, esc, toast, banner } from "./ui.js";
import { signIn, signOut, handleRedirect, accessToken } from "./auth.js";
import { GraphData, createDemoData, LISTS } from "./data.js";
import * as overview from "./views/overview.js";
import * as meetings from "./views/meetings.js";
import * as tracker from "./views/tracker.js";
import * as timeline from "./views/timeline.js";
import * as settings from "./views/settings.js";
import * as impact from "./views/impact.js";
import * as kickoff from "./views/kickoff.js";

const CFG = window.MINUTEMATE_CONFIG || {};
// demoOnly: a hosted showcase copy with no Microsoft 365 connection (sample data only).
const DEMO = new URLSearchParams(location.search).has("demo") || CFG.demoOnly === true;
const VIEWS = { overview, meetings, tracker, timeline, impact, settings, kickoff };

const ctx = {
  cfg: CFG,
  demo: DEMO,
  data: DEMO ? createDemoData() : GraphData,
  state: { lists: {}, calendar: [], projectId: null, tab: "overview", me: null },

  project() { return this.state.lists.projects?.find((p) => p.id === this.state.projectId) || null; },
  items(key) { return (this.state.lists[key] || []).filter((x) => x.ProjectLookupId === this.state.projectId); },

  async reload(keys = Object.keys(LISTS)) {
    const results = await Promise.all(keys.map((k) => this.data.items(k)));
    keys.forEach((k, i) => (this.state.lists[k] = results[i]));
    if (!this.state.lists.projects.some((p) => p.id === this.state.projectId)) {
      this.state.projectId = this.state.lists.projects[0]?.id || null;
    }
    renderProjectSelect();
  },
  async loadCalendar() { this.state.calendar = await this.data.calendar(CFG.meetingLookaheadDays || 14); },
  render() { const v = VIEWS[this.state.tab]; v.render(ctx, $(`#view-${this.state.tab}`)); },
  selectTab(name) {
    this.state.tab = name;
    $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    $$(".panel").forEach((p) => (p.hidden = p.dataset.panel !== name));
    this.render();
  },
  selectProject(id) { this.state.projectId = id; renderProjectSelect(); this.render(); }
};

function renderProjectSelect() {
  const sel = $("#projectSelect");
  const projects = ctx.state.lists.projects || [];
  sel.innerHTML = projects.length
    ? projects.map((p) => `<option value="${esc(p.id)}">${esc(p.Title)}</option>`).join("")
    : `<option value="">No projects yet</option>`;
  if (ctx.state.projectId) sel.value = ctx.state.projectId;
}

let peopleTimer;
function suggestPeople(ev) {
  const q = ev.target.value.trim();
  clearTimeout(peopleTimer);
  if (q.length < 2 || q.includes("@")) return;
  peopleTimer = setTimeout(async () => {
    try {
      const people = await ctx.data.people(q);
      $("#peopleList").innerHTML = people.map((p) => `<option value="${esc(p.email)}">${esc(p.name)}</option>`).join("");
    } catch { /* suggestions are optional */ }
  }, 250);
}

async function boot() {
  $("#signinBtn").addEventListener("click", signIn);
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => ctx.selectTab(b.dataset.tab)));
  $("#projectSelect").addEventListener("change", (e) => ctx.selectProject(e.target.value));
  $("#kickoffBtn").addEventListener("click", () => ctx.selectTab("kickoff"));
  document.addEventListener("input", (e) => { if (e.target.matches('input[type="email"][list="peopleList"]')) suggestPeople(e); });

  try {
    if (!DEMO) {
      if (!CFG.clientId) {
        $("#signin").hidden = false;
        $("#signinBtn").disabled = true;
        banner(`This site isn't connected to Microsoft 365 yet. Add your app registration to <code>config.js</code> (see <code>docs/setup-website.md</code>), or <a href="?demo=1">try the demo</a>.`);
        return;
      }
      await handleRedirect();
      if (!(await accessToken())) {
        $("#signin").hidden = false;
        // Inside a Teams tab (an iframe), Microsoft's sign-in page can't load. Open the site in the browser instead.
        if (window.self !== window.top) {
          const btn = $("#signinBtn");
          btn.textContent = "Open MinuteMate in your browser";
          btn.replaceWith(Object.assign(document.createElement("a"), { className: btn.className, textContent: btn.textContent, href: location.href.split("?")[0], target: "_blank", rel: "noopener" }));
          banner(`Sign-in opens in your browser. In Teams you can still <a href="?demo=1">try the demo</a>.`);
        }
        return;
      }
    } else {
      banner(CFG.demoOnly ? "Demo with sample data. Nothing you change here is saved." : `Demo mode: sample data only, nothing is saved. <a href="${esc(location.pathname)}">Exit demo</a>`);
    }
    await ctx.data.init();
    ctx.state.me = await ctx.data.me();
    $("#account").innerHTML = `<span>${esc(ctx.state.me.name)}</span>` + (DEMO ? "" : `<button class="btn ghost small" id="signoutBtn">Sign out</button>`);
    $("#signoutBtn")?.addEventListener("click", signOut);
    await Promise.all([ctx.reload(), ctx.loadCalendar()]);
    $("#app").hidden = false;
    const startTab = new URLSearchParams(location.search).get("tab") || location.hash.replace("#", "");
    ctx.selectTab(VIEWS[startTab] ? startTab : (ctx.state.lists.projects.length ? "overview" : "kickoff"));
  } catch (err) {
    $("#signin").hidden = false;
    banner(esc(err.message));
    toast(err.message);
  }
}

boot();
