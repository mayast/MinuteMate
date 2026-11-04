# MinuteMate

**Meetings that spark joy, not more work.**

MinuteMate turns meeting notes into action items, risks, decisions and a reviewed weekly status update, all inside
SharePoint, Teams and Outlook. Built for project managers who aren't technical: they paste notes into a list,
and the rest happens automatically. A person approves every status update before it is published.

**Phase 1 + 2 kit.** See [docs/architecture.md](docs/architecture.md) for the diagram and roadmap.

## What it does

1. **Capture** — on the MinuteMate website, switch **Capture** on for a Teams meeting (Flow 4 fetches the
   transcript after it ends), or paste notes into the **Meetings** list.
2. **Extract** — AI writes a summary and meeting notes page, and adds each action item, risk and decision
   to its own Microsoft List.
3. **Notify** — each action item owner gets a Teams card, an Outlook email, or both. Set the default per
   project, and override it per item.
4. **Report** — every Friday, AI drafts each project's status update as a draft SharePoint page.
5. **Approve** — the project's approver reviews (and can edit) the draft. On approval it is published as a
   SharePoint **News post**; on rejection the comments go back to the project owner.

## What's in this repo

| Path | What it is |
|---|---|
| `web/` | The MinuteMate website (GitHub Pages): sign in, set up projects, pick meetings to capture. Try `?demo=1` |
| `docs/setup-website.md` | Publishing the website and registering it in Entra ID |
| `flows/04-capture-teams-transcript.md` | Step-by-step build guide for Flow 4 (Teams transcript → Raw Notes; Premium) |
| `provisioning/Setup-MinuteMate.ps1` | Creates the six SharePoint lists and their columns |
| `prompts/01-extract-meeting-items.md` | AI Builder prompt: notes → summary, actions, risks, decisions (JSON) |
| `prompts/02-weekly-status-draft.md` | AI Builder prompt: week's data → status update (JSON) |
| `flows/01-process-meeting-notes.md` | Step-by-step build guide for Flow 1 |
| `flows/02-weekly-status.md` | Step-by-step build guide for Flow 2 (draft → approval → News) |
| `flows/03-notify-action-owner.md` | Step-by-step build guide for Flow 3 (Teams / Outlook / both) |
| `docs/sharepoint-pages-rest.md` | How the flows create, save and publish SharePoint pages |
| `templates/` | Teams Adaptive Card, Outlook email, status page and meeting notes page HTML |
| `samples/sample-meeting-notes.txt` | Notes for testing |

## Requirements

- A SharePoint site where you are **Site Owner**
- **Power Automate** with **AI Builder** credits (for *Run a prompt*). Check capacity in the Power Platform admin center.
- Standard connectors only: SharePoint, AI Builder, Approvals, Microsoft Teams, Office 365 Outlook, Office 365 Users
- For the setup script: PowerShell 7.4+ and the `PnP.PowerShell` module

## Setup (about 2–3 hours the first time)

1. **Create the lists**
   ```powershell
   Install-Module PnP.PowerShell -Scope CurrentUser
   # One-time per tenant (may need an admin to consent):
   Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP PowerShell" -Tenant <tenant>.onmicrosoft.com -Interactive
   ./provisioning/Setup-MinuteMate.ps1 -SiteUrl "https://<tenant>.sharepoint.com/sites/<site>" -ClientId "<client id>"
   ```
   Can't run scripts? Create the lists by hand from the table in `docs/architecture.md`.
2. **Add a project** to the Projects list: owner, approver, Default Notify Via, Weekly Status On = Yes.
3. **Create the two prompts** in AI hub from the `prompts/` files and test each with the sample notes.
4. **Build the flows** in this order: Flow 1 → Flow 3 → Flow 2, following the guides in `flows/`.
5. **Website (optional, recommended):** follow `docs/setup-website.md`, then build Flow 4 so meetings are
   captured from Teams transcripts with no copy and paste.
6. **Test end to end** with `samples/sample-meeting-notes.txt`, then run Flow 2 manually and approve.
7. **Share with your team:** give project managers Contribute access to the site, pin the Meetings list
   to the site navigation, and add the News web part to the home page.

## Packaging for other teams

Once the flows work, put them and the prompts in a **Power Platform solution** (Power Automate → Solutions →
New solution → Add existing). Export it as a .zip and add it to `solution/` in this repo so another team can
import it and only set their site URL and connections.

## Saving to GitHub

```bash
git remote add origin https://github.com/<you>/minutemate.git
git push -u origin main
```
Don't commit tenant URLs, client IDs or exported connection details; keep them in your own notes.
