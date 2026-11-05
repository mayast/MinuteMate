# Run your own copy of the MinuteMate website

Most people don't need this: they open the shared website, sign in, and paste their SharePoint site address. This
page is for the maintainer who publishes the website, or a team that wants its own copy.

The website (`web/`) is a static page. It signs people in with their work account and reads and writes the
MinuteMate lists as that person, through Microsoft Graph. No server, no secrets.

Try it with sample data first: add `?demo=1` to the address.

## 1. Publish on GitHub Pages
1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Actions** tab → **Publish website to GitHub Pages** → **Run workflow** (it also runs on every change in `web/`).
3. The site appears at `https://<github-user>.github.io/<repo>/`.

If the workflow isn't listed or fails, check **Settings → Actions → General** (allow actions) and
**Settings → Environments → github-pages** (allow the `main` branch).

## 2. Register the website once (the maintainer)
1. **Entra ID → App registrations → New registration**
   - Name: `MinuteMate`
   - Supported account types: **Accounts in any organizational directory (multitenant)**. Other organizations then
     only need an admin to consent once; nobody else registers anything. Choose single-tenant if only your
     organization will use it.
   - Redirect URI: platform **Single-page application (SPA)**, your exact Pages URL with the trailing slash.
2. **API permissions → Microsoft Graph → Delegated:** `User.Read`, `User.ReadBasic.All`, `Calendars.Read`,
   `Sites.ReadWrite.All`. In your own tenant, click **Grant admin consent**.
3. Put the **Application (client) ID** in `web/config.js` as `clientId`. Leave `tenantId` as `"organizations"` for
   multitenant, or set your tenant ID. Commit; Pages republishes.

For a company-wide rollout, `Sites.Selected` limits the app to the MinuteMate site only (an admin grants that site
separately).

## 3. Connecting a site (each person, once)
On first sign-in the website asks for the **SharePoint site address** and remembers it in that browser. The
**Setup** tab then checks all nine lists and their columns and says exactly what's missing, with the steps to fix
it (run Flow 0 on that site). **Change site** on the Setup tab switches sites.

To skip that question for everyone, set `siteUrl` in `config.js`.

## Troubleshooting
| Message | Fix |
|---|---|
| "This site isn't connected to Microsoft 365 yet" | `clientId` is empty in `config.js` |
| `AADSTS50011` redirect URI mismatch | The SPA redirect URI must match the Pages URL exactly, including the trailing `/` |
| "Need admin approval" | An admin in that organization consents to the app once |
| "Couldn't open the SharePoint site" | Check the address, and that you can open the site yourself |
| Setup tab shows missing lists or columns | Run **MinuteMate 0 - Set up MinuteMate** on that site |
| No meetings on the Meetings tab | Only Teams meetings in your own calendar for the next 14 days are shown |
