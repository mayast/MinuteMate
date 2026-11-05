# Set up the MinuteMate website (GitHub Pages)

The website in `web/` is a static page. People sign in with their work account, set up projects, and switch
**Capture** on for the Teams meetings MinuteMate should process. It talks to Microsoft 365 directly through
Microsoft Graph as the signed-in person, so it needs no server and holds no secrets.

Try it first with sample data: open `web/index.html?demo=1` (or your Pages URL with `?demo=1`).

## 1. Publish on GitHub Pages
1. Push this repo to GitHub.
2. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` publishes `web/` on every push to `main`.
4. Your site: `https://<github-user>.github.io/<repo>/` (for example `https://mayast.github.io/MinuteMate/`).

## 2. Register the website in Entra ID (needs permission to create app registrations)
1. **Entra ID → App registrations → New registration**
   - Name: `MinuteMate Website`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: platform **Single-page application (SPA)**, value = your exact Pages URL with the trailing slash
2. **API permissions → Add → Microsoft Graph → Delegated:**
   `User.Read`, `User.ReadBasic.All`, `Calendars.Read`, `Sites.ReadWrite.All`
   Ask an admin to **Grant admin consent** so people aren't prompted one by one (your tenant may require it).
3. Copy the **Application (client) ID** and **Directory (tenant) ID**.

> Tighter alternative to `Sites.ReadWrite.All`: `Sites.Selected` limits the app to the MinuteMate site only,
> but an admin has to grant the site permission separately. Worth it for a company-wide rollout.

## 3. Fill in `web/config.js`
```js
window.MINUTEMATE_CONFIG = {
  clientId: "<application client id>",
  tenantId: "<directory tenant id>",
  siteHostname: "<tenant>.sharepoint.com",
  sitePath: "/sites/<your site>",
  meetingLookaheadDays: 14
};
```
Commit and push. These values aren't secrets: single-page apps have no client secret.

## 4. Make sure the lists have the website's columns
Re-run `provisioning/Setup-MinuteMate.ps1`. It's safe to re-run: it adds the Milestones, Stakeholders and
Kickoffs lists and every column the website uses (see `docs/architecture.md`), and skips what already exists.

> If you created the *Processing Status* column with an earlier version of the script, add the choice
> **Waiting for transcript** to it by hand (List settings → Processing Status): re-running doesn't change
> existing columns.

## 4b. Optional: invite-based capture
Set `inviteAddress` in `config.js` to the MinuteMate mailbox (Flow 5) so the Meetings tab tells people they can
add it to an invite instead.

## 5. Turn on the transcript back end
The website only *registers* meetings. Reading transcripts needs app permissions a web page can't hold, so
**Flow 4** (`flows/04-capture-teams-transcript.md`) does it after each meeting ends.

## How it fits together
```
Website (GitHub Pages) ──Graph, as the user──▶ SharePoint lists (Projects, Meetings)
                                                   │ new meeting: Waiting for transcript
                                                   ▼
                              Flow 4 (app permissions) ── transcript ──▶ Meetings.Raw Notes, status New
                                                   ▼
                              Flow 1 → actions, risks, decisions → Flow 3 notifies owners
                              Flow 2 (Fridays) → draft → approval → News post
```

## Troubleshooting
| Message | Fix |
|---|---|
| "This site isn't connected to Microsoft 365 yet" | Fill in `config.js` and push |
| `AADSTS50011` redirect URI mismatch | The SPA redirect URI must match the Pages URL exactly, including the trailing `/` |
| "Need admin approval" | An admin must grant consent for the delegated permissions |
| `List "Meetings" wasn't found` | Run the setup script on the site in `sitePath` |
| No meetings listed | Only Teams meetings in your own calendar for the next 14 days are shown |
