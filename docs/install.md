# Install MinuteMate for another team (Phase 5.9)

Once MinuteMate works for one team, package it so the next team can install it in about an hour instead of
rebuilding every flow.

## 1. Package the flows and prompts as a Power Platform solution (one time, by the builder)
1. Power Automate → **Solutions** → **New solution** → name `MinuteMate`, publisher = your org's publisher.
2. **Add existing** → Cloud flows: Flows 1–11 you built. **Add existing** → AI prompts: the three MinuteMate prompts.
3. Add **environment variables** to the solution and point the flows at them instead of fixed values:
   | Variable | Example |
   |---|---|
   | `mm_SiteUrl` | `https://contoso.sharepoint.com/sites/ProjectHub` |
   | `mm_WebsiteUrl` | `https://mayast.github.io/MinuteMate/` |
   | `mm_TenantId`, `mm_BackendClientId` | from the Flow 4 app registration |
   | `mm_BackendSecret` | type **Secret**, backed by Azure Key Vault |
4. Use **connection references** for SharePoint, Teams, Outlook, Approvals, AI Builder, HTTP, Planner, Azure DevOps.
5. **Export** → *Managed* → save `MinuteMate_1_0_0_0_managed.zip` to `solution/` in this repo (don't commit secrets).

## 2. Install for a new team (about an hour)
1. Create their SharePoint site and run `provisioning/Setup-MinuteMate.ps1` against it.
2. Power Automate → Solutions → **Import** the managed zip → create or pick each connection → fill the environment
   variables → turn the flows on.
3. Point the website at their site: either a copy of `web/` with their `config.js`, or one shared site with a
   site picker (a later improvement).
4. Add their first project with the website's **Kick off a project** form.

## 3. Add MinuteMate to Teams
`teams-app/` holds a Teams app that opens the website as a personal tab.
1. Edit `teams-app/manifest.json`: replace the `id` with a new GUID, and the URLs if your site address differs.
2. Zip the three files (`manifest.json`, `color.png`, `outline.png`) with no folder inside the zip.
3. Teams → **Apps** → **Manage your apps** → **Upload an app** (needs custom app upload allowed by your admin),
   or ask your Teams admin to publish it to the org app catalog.

Note: Microsoft sign-in can't run inside an embedded tab, so the tab offers **Open MinuteMate in your browser** for
signing in, and the demo works inside Teams. Adding Teams single sign-on (Teams JavaScript SDK) would let people sign
in inside the tab; it's a good next improvement.
