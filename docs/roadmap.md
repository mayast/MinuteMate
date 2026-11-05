# MinuteMate roadmap

Phases 1–4 are in the repo (see `docs/architecture.md`). Phase 5 makes MinuteMate fit how teams already work,
keeps its data trustworthy, and proves its impact.

## Phase 5: meet teams where they work

**Principle:** SharePoint Lists stay MinuteMate's system of record, because every Microsoft 365 user has them.
Each project can also send work to the tool its team already uses. Status always comes back to SharePoint,
so the weekly status update, timeline and impact numbers work whatever tool a team picks. Loop and Teams chat
are places to *see* the work, not to run it.

| # | Item | What ships | Where | Status |
|---|---|---|---|---|
| 5.1 | **Sync to the team's work tracker** | Per-project setting: None / Microsoft Planner / Azure DevOps / GitHub Issues. New action items are created there; status changes flow back | Settings tab, Tracker links, Flow 8 | Website: built · Flow 8: guide |
| 5.2 | **Recap in the Teams meeting chat** | Summary and action items posted to the meeting chat right after processing | Flow 9 | Flow 9: guide |
| 5.3 | **Update items from the Teams card** | Buttons on the owner's card: Done, In progress, Blocked, new due date | Flow 3 (updated), actionable card | Card + Flow 3: guide |
| 5.4 | **No duplicate action items** | The AI sees open items and updates a match instead of creating a copy | Prompt 1, Flow 1 (updated) | Prompt + Flow 1: guide |
| 5.5 | **Agenda before the next meeting** | Open from last time, overdue, new risks and decisions, posted before recurring meetings; preview and copy on the website | Meetings tab, Flow 10 | Website: built · Flow 10: guide |
| 5.6 | **AI quality evaluation** | Test transcripts with expected results and a scoring script (precision, recall, owner and date accuracy) | `eval/` | Built (run it) |
| 5.7 | **Privacy and consent** | Capture notice, `[no-capture]` opt-out, transcript retention period | Settings tab, Flows 4, 5 and 11, `docs/privacy.md` | Website: built · Flows: guide |
| 5.8 | **Impact dashboard** | Meetings captured, items found by AI, on-time close rate, days to close, estimated hours saved | Impact tab | Website: built |
| 5.9 | **One-step install** | Power Platform solution packaging steps and a Teams app that opens the website as a tab | `docs/install.md`, `teams-app/` | Guide + Teams app files |

**Status key:** *built* = working in the website and tested in demo mode; *guide* = step-by-step build guide for
Power Automate, to build and test in your tenant.

Out of scope: localized (non-English) summaries.

## Phase 6: simple setup

| # | Item | What ships | Status |
|---|---|---|---|
| 6.1 | **Layered setup** | README rewritten as Starter (20 min, no admin) → Website (5 min) → Automatic capture (IT) | Built |
| 6.2 | **No PowerShell** | Flow 0 *Set up MinuteMate* creates all lists from `provisioning/lists.json`; safe to re-run for upgrades | Flow 0: guide |
| 6.3 | **Website asks for the site** | First sign-in asks for the SharePoint site address and remembers it; no config edits | Built |
| 6.4 | **Setup check** | Setup tab checks every list and column and gives the exact fix | Built |
| 6.5 | **One-page IT request** | `docs/it-request.md` lists exactly what to approve for automatic capture | Built |
| 6.6 | **One-click package** | Managed Power Platform solution attached to GitHub Releases | Maintainer: build once (see `docs/install.md`, part B) |

## Later ideas
- Portfolio view across all projects.
- Power BI report on the same lists.
- Loop component that shows a project's open action items live.
