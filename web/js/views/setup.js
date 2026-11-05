// Setup: connect the website to a SharePoint site (once per person), then check that every
// MinuteMate list and column exists and say exactly what to fix.
import { esc, toast, busy } from "../ui.js";
import { parseSiteUrl, saveSite, clearSite } from "../data.js";

let lastCheck = null;

export function render(ctx, el) {
  if (ctx.state.needSite) return renderConnect(ctx, el);
  el.innerHTML = `
    <div class="panel-head">
      <div><h2>Setup check</h2>
        <p class="muted">Connected to <strong>${esc(ctx.data.site?.name || "")}</strong> · <span class="mono">${esc(ctx.data.site?.url || "")}</span></p></div>
      <div class="row-actions">
        <button class="btn ghost small" data-act="change">Change site</button>
        <button class="btn small" data-act="run">Run check again</button>
      </div>
    </div>
    <div id="setupResult"><p class="muted">Checking lists and columns…</p></div>`;
  el.querySelector('[data-act="change"]').addEventListener("click", () => { clearSite(); location.reload(); });
  const run = (btn) => busy(btn, async () => { lastCheck = await ctx.data.checkSetup(); show(ctx, el.querySelector("#setupResult")); });
  el.querySelector('[data-act="run"]').addEventListener("click", (e) => run(e.target));
  if (lastCheck) show(ctx, el.querySelector("#setupResult")); else run(null);
}

function show(ctx, box) {
  const lists = lastCheck.lists;
  const problems = lists.filter((l) => !l.exists || l.missing.length || l.notes.length);
  const siteUrl = ctx.data.site?.url || "";
  box.innerHTML = `
    <div class="setup-summary ${problems.length ? "warn" : "ok"}">
      <strong>${problems.length ? `${problems.length} of ${lists.length} lists need setup` : "Everything is set up"}</strong>
      <span>${problems.length
        ? "Run the <em>Set up MinuteMate</em> flow on this site, then run this check again."
        : "All lists and columns are in place."}</span>
    </div>
    ${problems.length ? `
      <ol class="steps">
        <li>Open <strong>Power Automate</strong> → <strong>My flows</strong> → <strong>MinuteMate 0 - Set up MinuteMate</strong> → <strong>Run</strong>.</li>
        <li>For <em>Site address</em>, paste: <span class="mono copyable">${esc(siteUrl)}</span> <button class="btn ghost small" data-copy>Copy</button></li>
        <li>Wait 2–4 minutes for it to finish, then click <strong>Run check again</strong>.</li>
      </ol>
      <p class="muted small">No Set up flow yet? Your MinuteMate admin imports it with the MinuteMate package (see <em>docs/install.md</em>). People comfortable with PowerShell can run <em>provisioning/Setup-MinuteMate.ps1</em> instead.</p>` : `
      <p>Next: <button class="linkish" data-go="kickoff">Kick off your first project</button> or open <button class="linkish" data-go="meetings">Meetings</button> to pick meetings to capture.</p>
      <p class="muted small">Automatic capture of Teams transcripts needs one-time approval from IT. Send them <em>docs/it-request.md</em>.</p>`}
    <div class="table-wrap">
      <table class="grid">
        <thead><tr><th>List</th><th>Status</th><th>What's missing</th></tr></thead>
        <tbody>${lists.map((l) => `<tr>
          <td>${esc(l.title)}</td>
          <td>${!l.exists ? `<span class="pill bad">Missing</span>` : l.missing.length || l.notes.length ? `<span class="pill warn">Incomplete</span>` : `<span class="pill ok">Ready</span>`}</td>
          <td class="small">${!l.exists ? "The whole list" : [...(l.missing.length ? [`${l.missing.length} column${l.missing.length > 1 ? "s" : ""}: ${esc(l.missing.join(", "))}`] : []), ...l.notes.map(esc)].join("<br>") || "—"}</td>
        </tr>`).join("")}</tbody>
      </table>
    </div>`;
  box.querySelector("[data-copy]")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(siteUrl); toast("Site address copied"); }
    catch { toast("Couldn't copy. Select the address and copy it instead."); }
  });
  box.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => ctx.selectTab(b.dataset.go)));
}

function renderConnect(ctx, el) {
  el.innerHTML = `
    <div class="connect">
      <h2>Connect MinuteMate to your SharePoint site</h2>
      <p class="muted">Paste the address of the SharePoint site where your team keeps MinuteMate. You only do this once; this browser remembers it.</p>
      ${ctx.state.siteError ? `<p class="error-text">${esc(ctx.state.siteError)}</p>` : ""}
      <form data-form="site" class="connect-form">
        <label for="siteUrl">SharePoint site address</label>
        <input id="siteUrl" name="siteUrl" type="url" required placeholder="https://contoso.sharepoint.com/sites/ProjectHub" autocomplete="url">
        <button class="btn primary" type="submit">Connect</button>
      </form>
      <p class="muted small">Don't have a site yet? In SharePoint, choose <strong>+ Create site</strong> → <strong>Team site</strong>, then come back. After connecting, the Setup check tells you if anything is missing.</p>
    </div>`;
  el.querySelector('[data-form="site"]').addEventListener("submit", (ev) => {
    ev.preventDefault();
    const site = parseSiteUrl(ev.target.siteUrl.value);
    if (!site) { toast("That doesn't look like a SharePoint site address. It should start with https:// and end in .sharepoint.com/sites/…"); return; }
    if (!saveSite(site)) { toast("This browser blocks saved settings. Ask your MinuteMate admin to set the site in config.js."); return; }
    location.reload();
  });
}
