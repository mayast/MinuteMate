# MinuteMate

**Meetings that spark joy, not more work.**

MinuteMate turns Teams meetings into action items, risks, decisions, a live timeline and a reviewed weekly
status update, all inside SharePoint, Teams and Outlook. Built for project managers who aren't technical:
they pick the meetings to capture (or invite MinuteMate), and the rest happens automatically. A person approves
every status update before it is published.

**Phases 1–5.** See [docs/architecture.md](docs/architecture.md) for the diagram and [docs/roadmap.md](docs/roadmap.md) for the plan.
Try the website with sample data: `web/index.html?demo=1`.

## What it does

1. **Kick off** — one form sets up the project, stakeholders with RACI roles, and a milestone plan with
   dependencies from a template. AI drafts the charter page for review (Flow 6).
2. **Capture** — switch **Capture** on for Teams meetings on the website (one meeting, a whole recurring
   series, or every meeting matching the project's keywords), or add the MinuteMate mailbox to the invite
   (Flow 5). Flow 4 picks up each transcript after the meeting. Pasting notes still works too.
3. **Extract** — AI writes a summary and meeting notes page, and adds each action item, risk and decision
   to its own Microsoft List.
4. **Notify** — each action item owner gets a Teams card, an Outlook email, or both. Set the default per
   project, and override it per item.
5. **Track** — the website's Tracker edits action items, risks, decisions and milestones in one table;
   the Timeline shows milestones by workstream with dependency arrows and flags conflicts. Owners of dependent
   milestones are warned in Teams when something slips (Flow 7).
   Action items also go to the team's own tracker (Planner, Azure DevOps or GitHub), and status comes back (Flow 8).
   Owners can update status and due dates right from the Teams card.
6. **Follow through in Teams** — the recap lands in the meeting chat right after processing (Flow 9), and an agenda
   with open, overdue and at-risk items arrives before the next meeting (Flow 10). The **Impact** tab shows meetings
   captured, items found, on-time close rate and estimated hours saved.
7. **Report** — every Friday, AI drafts each project's status update as a draft SharePoint page.
8. **Approve** — the project's approver reviews (and can edit) the draft. On approval it is published as a
   SharePoint **News post**; on rejection the comments go back to the project owner.

## What's in this repo

| Path | What it is |
|---|---|
| `web/` | The MinuteMate website (GitHub Pages): Overview, Meetings, Tracker, Timeline, Settings, Kickoff kit. Try `?demo=1` |
| `docs/setup-website.md` | Publishing the website and registering it in Entra ID |
| `provisioning/Setup-MinuteMate.ps1` | Creates the nine SharePoint lists and their columns (safe to re-run) |
| `prompts/01-extract-meeting-items.md` | AI Builder prompt: notes or transcript → summary, actions, risks, decisions |
| `prompts/02-weekly-status-draft.md` | AI Builder prompt: week's data → status update |
| `prompts/03-kickoff-charter.md` | AI Builder prompt: kickoff kit → project charter |
| `flows/01-process-meeting-notes.md` | Flow 1: notes → summary page, action items, risks, decisions |
| `flows/02-weekly-status.md` | Flow 2: weekly draft → approval → News post |
| `flows/03-notify-action-owner.md` | Flow 3: notify owners in Teams, Outlook or both |
| `flows/04-capture-teams-transcript.md` | Flow 4: pick up Teams transcripts every 30 minutes (Premium) |
| `flows/05-capture-from-invite.md` | Flow 5: capture meetings when the MinuteMate mailbox is invited |
| `flows/06-kickoff-charter.md` | Flow 6: kickoff kit → AI charter page for review |
| `flows/07-milestone-slip-alert.md` | Flow 7: warn dependent owners when a milestone slips |
| `flows/08-sync-work-tracker.md` | Flow 8: sync action items with Planner, Azure DevOps or GitHub |
| `flows/09-post-meeting-recap.md` | Flow 9: post the recap to the Teams meeting chat |
| `flows/10-pre-meeting-agenda.md` | Flow 10: post an agenda before the next meeting |
| `flows/11-transcript-retention.md` | Flow 11: delete raw transcripts after the retention period |
| `eval/` | AI quality evaluation: test meetings, expected results, scoring script |
| `docs/privacy.md` | What's stored, attendee notice, `[no-capture]` opt-out, retention |
| `docs/install.md` | Package as a Power Platform solution; add MinuteMate to Teams |
| `teams-app/` | Teams app manifest and icons (opens the website as a tab) |
| `docs/roadmap.md` | The plan and what's built |
| `docs/sharepoint-pages-rest.md` | How the flows create, save and publish SharePoint pages |
| `templates/` | Teams card, Outlook email, and status, meeting notes and charter page HTML |
| `samples/sample-meeting-notes.txt` | Notes for testing |

## Requirements

- A SharePoint site where you are **Site Owner**
- **Power Automate** with **AI Builder** credits (for *Run a prompt*). Check capacity in the Power Platform admin center.
- Standard connectors for Flows 1–3 and 5–7: SharePoint, AI Builder, Approvals, Microsoft Teams, Office 365 Outlook, Office 365 Users
- **Power Automate Premium** and admin approval for Flow 4 (automatic Teams transcripts); see its guide
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
3. **Create the three prompts** in AI hub from the `prompts/` files and test each with the sample notes.
4. **Build the core flows:** Flow 1 → Flow 3 → Flow 2, following the guides in `flows/`.
5. **Website:** follow `docs/setup-website.md`.
6. **Automatic capture (Phase 3):** Flow 4 (needs admin setup), then Flow 5 if you want invite-based capture.
7. **Planning (Phase 4):** Flow 6 (charter) and Flow 7 (slip alerts).
   **Follow-through (Phase 5):** Flow 8 (tracker sync), Flow 9 (recap), Flow 10 (agenda), Flow 11 (retention);
   read `docs/privacy.md` before rollout and run `node eval/score.mjs` after any prompt change.
8. **Test end to end** with `samples/sample-meeting-notes.txt`, then run Flow 2 manually and approve.
9. **Share with your team:** give project managers Contribute access to the site, pin the Meetings list
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
