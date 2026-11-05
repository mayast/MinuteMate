# Flow 7 — Warn dependent teams when a milestone slips (Phase 4)

**What it does:** when a milestone's due date moves later, or it's marked **Blocked**, the flow finds every
milestone that depends on it and tells those owners (and the project owner) in Teams. It's the same check the
website's Timeline tab shows, delivered to the people who need to replan.

- **Type:** Automated cloud flow · **Name:** `MinuteMate 7 - Milestone slip alert`
- **Connectors:** SharePoint, Microsoft Teams (standard)

## Steps

### 1. Trigger — SharePoint *When an item or a file is modified* (Milestones)

### 2. **Changes** — SharePoint *Get changes for an item or a file (properties only)*
- Id: `triggerOutputs()?['body/ID']` · Since: `triggerOutputs()?['body/{TriggerWindowStartToken}']`

### 3. Condition **Slipped** — continue only if
```
or(body('Changes')?['ColumnHasChanged/DueDate'], and(body('Changes')?['ColumnHasChanged/MilestoneStatus'], equals(triggerOutputs()?['body/MilestoneStatus/Value'], 'Blocked')))
```
Otherwise *Terminate* (Succeeded).

### 4. **Project Milestones** — SharePoint *Get items* (Milestones)
- Filter: `ProjectId eq @{triggerOutputs()?['body/Project/Id']} and MilestoneStatus ne 'Done'`

### 5. **Dependents** — *Filter array* over `body('Project_Milestones')?['value']`
Advanced mode:
```
@contains(string(item()?['DependsOn']), concat('"Id":', triggerOutputs()?['body/ID'], ','))
```
(Multi-lookup values arrive as an array of `{ "Id": n, "Value": "title" }`. If your tenant formats them
differently, inspect one run's output and adjust the match.)

### 6. **Affected** — *Filter array* over `body('Dependents')` keeping the ones that now start before this milestone is due:
```
@less(ticks(coalesce(item()?['StartDate'], item()?['DueDate'])), ticks(triggerOutputs()?['body/DueDate']))
```
For a **Blocked** milestone, use `body('Dependents')` directly (everything downstream is at risk).

### 7. *Apply to each* **Affected** → Microsoft Teams *Post message in a chat or channel*
- Post as Flow bot → Chat with Flow bot → Recipient `item()?['OwnerEmail']` (skip if empty)
- Message: "Heads-up: **<this milestone>** now finishes <new due date> (or is blocked). **<dependent>** is planned
  to start <start date>, so it may need to move. Timeline: <website link>?tab=timeline"

### 8. Tell the project owner once
Get the project (Projects, Id = Project Id) and post one summary to `ProjectOwnerEmail` listing every affected
milestone. Skip when **Affected** is empty.
