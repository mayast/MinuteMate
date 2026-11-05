# Flow 8 — Sync action items with the team's work tracker (Phase 5.1)

**What it does:** each project picks where its team tracks work (Settings tab → *Track action items in*):
**None, Microsoft Planner, Azure DevOps or GitHub**. MinuteMate keeps every action item in SharePoint and also
creates it in that tool. When the item is finished there, the status comes back to SharePoint, so the weekly
status, timeline and Impact tab stay complete whatever tool a team uses.

Loop and Teams chat aren't sync targets on purpose: they're good for *seeing* work (Flow 9 posts there), but
they have no reliable status, ownership or reporting to sync with.

Build it as two flows: **8a (out)** creates or updates the item in the tracker; **8b (back)** brings status changes
back. Build only the branches for the tools your teams use.

- **Connectors:** SharePoint, Planner, Azure DevOps, GitHub, Office 365 Users. Check the connector tier in your
  tenant (Planner and Azure DevOps are standard; GitHub may be premium).

## Settings it reads (Projects list)
| Track Work In | Tracker Target | Example |
|---|---|---|
| Planner | Plan ID (from the plan's URL), or blank to use one plan per project you create once | `xqQg5FS2LkCp935s-FIFm2QAFkHM` |
| Azure DevOps | `organization/project` | `contoso/Phoenix` |
| GitHub | `owner/repo` | `contoso/phoenix` |

## 8a. Out: create in the tracker
### 1. Trigger — SharePoint *When an item is created or modified* (Action Items)
Trigger condition: `@not(equals(triggerOutputs()?['body/SyncState/Value'], 'Synced'))`
(A status change on an item that's already synced is handled in step 5.)

### 2. **Get Project** (Projects, Id = `triggerOutputs()?['body/Project/Id']`)
Stop if `body('Get_Project')?['WorkTracker/Value']` is `None` or empty.

### 3. **Owner Email** — `coalesce(triggerOutputs()?['body/Owner/Email'], triggerOutputs()?['body/OwnerEmail'])`

### 4. *Switch* on `body('Get_Project')?['WorkTracker/Value']`
**Planner**
- Office 365 Users *Get user profile (V2)* for the owner → `id`
- Planner *Create a task*: Group Id (the plan's group), Plan Id = Tracker Target, Title, Due date, Assigned user ids = the profile id
- Planner *Update task details*: Description = Details + link to the MinuteMate item
- External Id = task `id`; Tracker Item = `https://tasks.office.com/` link from the task (or the plan link)

**Azure DevOps**
- Azure DevOps *Create a work item*: Organization = `first(split(Tracker Target, '/'))`, Project = `last(split(Tracker Target, '/'))`,
  Type = **Task** (or your team's type), Title, Assigned To = owner email, Description = Details + MinuteMate link,
  Tags = `MinuteMate`
- External Id = work item `id`; Tracker Item = `https://dev.azure.com/<org>/<project>/_workitems/edit/<id>`

**GitHub**
- GitHub *Create an issue*: Repository owner/name from Tracker Target, Title, Body = Details + due date + MinuteMate link,
  Labels = `minutemate`. (Assignee needs the person's GitHub username; skip it unless you keep a mapping list.)
- External Id = issue `number`; Tracker Item = issue `html_url`

Then SharePoint *Update item* (Action Items): External Id, Tracker Item, Sync State = `Synced`.
Wrap step 4 in a Try scope; on failure set Sync State = `Error` (the website shows "Sync error" on the item).

### 5. Status pushed from MinuteMate (website, Teams card) to the tracker
Add a second automated flow, or a branch, on *When an item is created or modified* with condition
`Sync State = Synced` and `Status` changed (use *Get changes for an item* → `ColumnHasChanged/ItemStatus`):
- Planner: *Update a task* → Progress `Completed` when Done, `In progress` otherwise
- Azure DevOps: *Update a work item* → State `Done`/`Closed` when Done, `Active` when In progress
- GitHub: *Update an issue* → State `closed` when Done, `open` otherwise

## 8b. Back: status changes in the tracker
| Tool | Trigger | Map to MinuteMate |
|---|---|---|
| Planner | *When a task is completed* (per plan) | Status `Done`, Closed Date = now |
| Azure DevOps | *When a work item is updated* (Project, Type Task, Tags contain MinuteMate) | `Done`/`Closed` → Done; `Active` → In progress; `Removed` → Done with a note |
| GitHub | scheduled every 30 min: list issues with label `minutemate` updated since the last run | `closed` → Done; reopened → In progress |

For each: SharePoint *Get items* (Action Items) with `ExternalId eq '<id>'`, then *Update item* with the new Status
and Closed Date. **Avoid loops:** only update when the value actually differs, so 8a step 5 doesn't fire back.

## Test
1. Set a project to Azure DevOps with `org/project`, add an action item on the website → a Task appears in ADO,
   and the website shows "Open in tracker ↗".
2. Close the Task in ADO → the item shows Done in MinuteMate with a Closed Date, and the Impact tab counts it.
