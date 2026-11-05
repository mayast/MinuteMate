# Install and packaging

Most teams only need **Part A**. **Part B** is for the MinuteMate maintainer: you build the flows once and publish a
package so nobody else has to.

## A. Install for a team (about 20 minutes)
1. **Import** `MinuteMate_managed.zip` (from GitHub Releases): Power Automate → **Solutions** → **Import solution**.
   - Sign in to each connection when asked (SharePoint, Teams, Outlook, Approvals, AI Builder).
   - Enter the environment variable **MinuteMate site address**.
2. **Run Flow 0** (*MinuteMate 0 - Set up MinuteMate*) with your site address. It creates the nine lists.
3. **Turn on** the flows you want. The Starter set: Flows 1, 2 and 3.
4. **Open the website**, paste your site address, and check the **Setup** tab.
5. Later, for automatic capture: send IT `docs/it-request.md`, then turn on Flows 4, 5, 9 and 10.

**No package yet?** Build the flows from `flows/` in this order: 0 → 1 → 3 → 2 (Starter), then the rest as needed.

## B. Build and publish the package (maintainer, once per release)

### Build
1. Create a solution: Power Automate → **Solutions** → **New solution** → `MinuteMate`, with your publisher.
2. Inside the solution, build (or add existing) Flows 0–3, and Flows 4–11 if you want them in the package.
   Build flows **inside** the solution so they use connection references.
3. Add the three AI prompts (**Add existing → AI prompt**).
4. Add **environment variables** and use them in the flows instead of fixed values:
   | Variable | Type | Used by |
   |---|---|---|
   | `mm_SiteUrl`, display name **MinuteMate site address** | Text | every flow |
   | `mm_WebsiteUrl` | Text | links in cards and emails |
   | `mm_TenantId`, `mm_BackendClientId` | Text | Flows 4, 10 (automatic capture) |
   | `mm_BackendSecret` | Secret (Azure Key Vault) | Flows 4, 10 |
5. Leave every environment variable's **current value** empty in the solution, so importers are prompted.

### Test in a clean place
6. Export as **Managed**, import into a second environment (a trial or developer environment works), run Flow 0
   on a fresh site, and test Flows 1–3 with `samples/sample-meeting-notes.txt`.
7. Run `node eval/score.mjs` with real prompt output to confirm extraction quality.

### Publish
8. GitHub → **Releases → Draft a new release** → tag `v1.0.0` → attach `MinuteMate_managed.zip` (and the unmanaged
   zip for people who want to customize) → write what changed → **Publish**.
9. Check the README's Starter steps still match, using the release you just published.

Never put secrets, tenant IDs or connection details in the repo or the release.

## C. Add MinuteMate to Teams
`teams-app/` holds a Teams app that opens the website as a personal tab.
1. In `teams-app/manifest.json`, replace `id` with a new GUID (and the URLs, if your site address differs).
2. Zip `manifest.json`, `color.png` and `outline.png` (no folder inside the zip).
3. Teams → **Apps** → **Manage your apps** → **Upload an app**, or ask your Teams admin to publish it to your
   org's app catalog.

Microsoft sign-in can't run inside a Teams tab, so the tab offers **Open MinuteMate in your browser** for signing
in. Teams single sign-on is on the roadmap.
