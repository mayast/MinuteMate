# Flow 2 — Weekly status: draft → human approval → SharePoint News post

**What it does:** every week, for each active project, it gathers the week's meetings, action items, risks and
decisions, asks AI to draft the status update, and saves it as a **draft page**. The project's approver gets an
approval request with a link to the draft. They can edit the page first. **Nothing is published until they approve.**

- **Type:** Scheduled cloud flow · **Name:** `MinuteMate 2 - Weekly status`
- **Schedule:** weekly, Friday 1:00 PM, your local time zone
- **Connectors:** SharePoint, AI Builder, Approvals, Office 365 Outlook

## Steps

### 1. Trigger — *Recurrence*
Interval 1, Frequency Week, On these days: Friday, At these hours: 13, Time zone: your zone.

### 2. **Week Start** — *Compose*: `addDays(utcNow(), -7, 'yyyy-MM-dd')`
### 3. **Today** — *Compose*: `utcNow('yyyy-MM-dd')`

### 4. **Get Projects** — SharePoint *Get items* (Projects)
- Filter Query: `WeeklyStatusOn eq 1`

### 5. **Each Project** — *Apply to each* over `body('Get_Projects')?['value']`
Use Compose actions inside the loop rather than variables. In the loop's Settings, set
**Concurrency control → Degree of parallelism = 1** so pages and approvals don't overlap.

Let `P` mean `items('Each_Project')?['ID']` in the filters below.

| Action (SharePoint *Get items*) | List | Filter Query |
|---|---|---|
| **Week Meetings** | Meetings | `ProjectId eq P and MeetingDate ge '@{outputs('Week_Start')}'` |
| **Open Actions** | Action Items | `ProjectId eq P and ItemStatus ne 'Done'` |
| **Overdue Actions** | Action Items | `ProjectId eq P and ItemStatus ne 'Done' and DueDate lt '@{outputs('Today')}'` |
| **Done This Week** | Action Items | `ProjectId eq P and ItemStatus eq 'Done' and Modified ge '@{outputs('Week_Start')}'` |
| **Open Risks** | Risks | `ProjectId eq P and RiskStatus ne 'Closed'` |
| **New Decisions** | Decisions | `ProjectId eq P and Created ge '@{outputs('Week_Start')}'` |

Turn each result into short text lines with *Select* (text mode) + *Compose* `join(..., decodeUriComponent('%0A'))`:

- Meetings: `concat('- ', item()?['Title'], ': ', item()?['Summary'])`
- Actions: `concat('- [', item()?['Priority/Value'], '] ', item()?['Title'], ' — ', coalesce(item()?['Owner/DisplayName'], 'no owner'), ', due ', coalesce(item()?['DueDate'], 'n/a'))`
- Risks: `concat('- [', item()?['Impact/Value'], '] ', item()?['Title'], '. Mitigation: ', coalesce(item()?['Mitigation'], 'none yet'))`
- Decisions: `concat('- ', item()?['Title'], ' (', coalesce(item()?['Rationale'], ''), ')')`

> Tip: if a project had no meetings and no changes this week, add a Condition to skip it.

### 6. **Run Status Prompt** — AI Builder *Run a prompt* → `MinuteMate - Weekly status draft`
Map each input to the matching Compose output from step 5. ProjectName: `items('Each_Project')?['Title']`,
WeekOf: `outputs('Week_Start')`.

### 7. **Parse Status** — *Parse JSON* (generate schema from the prompt's format sample)

### 8. **Body HTML** — *Compose*
Build from `templates/status-page.html`. A list section uses this pattern (repeat for each array):
```
if(empty(body('Parse_Status')?['highlights']),
   '<p>None this week.</p>',
   concat('<ul><li>', join(body('Parse_Status')?['highlights'], '</li><li>'), '</li></ul>'))
```

### 9. Create the draft page — follow `docs/sharepoint-pages-rest.md` → **Create a page**
- Title: `concat(items('Each_Project')?['Title'], ' — Status, week of ', formatDateTime(outputs('Week_Start'), 'MMM d'))`
- Promote to news: **Yes** (it becomes a News post when published)
- Publish: **No** — stop after *savepage*. Keep the page Id and URL.

### 10. **Log Status** — SharePoint *Create item* (Status Updates)
Project Id, Week Of, Overall Status `body('Parse_Status')?['overall_status']`, Draft Page (URL),
Approval Status `Pending`.

### 11. **Ask Approver** — Approvals *Start and wait for an approval*
- Type: **Approve/Reject – First to respond**
- Title: `concat('Approve status: ', items('Each_Project')?['Title'])`
- Assigned to: `items('Each_Project')?['Approver/Email']`
- Details (Markdown):
  ```
  **Overall status:** @{body('Parse_Status')?['overall_status']} — @{body('Parse_Status')?['status_reason']}

  **Headline:** @{body('Parse_Status')?['headline']}

  Review the draft page. You can edit it, then click **Save as draft** (not Publish) and approve here.
  ```
- Item link: the draft page URL · Item link description: `Open draft status page`

### 12. Condition **Approved** — `outputs('Ask_Approver')?['body/outcome']` is equal to `Approve`

**Yes (approved):**
1. Publish the page — `docs/sharepoint-pages-rest.md` → **Publish a page** (it appears as a News post).
2. SharePoint *Update item* (Status Updates): Approval Status `Published`, Published News Post = page URL,
   Reviewer Comments `first(outputs('Ask_Approver')?['body/responses'])?['comments']`.
3. SharePoint *Update item* (Projects): Overall Status = `body('Parse_Status')?['overall_status']`.

**No (rejected):**
1. SharePoint *Update item* (Status Updates): Approval Status `Rejected`, Reviewer Comments as above.
2. Outlook *Send an email (V2)* to the project owner with the comments and the draft link, so they can fix the
   page and publish it manually or re-run the flow.

## Test
Turn on **Weekly Status On** for one project, run the flow manually (*Test → Manually*), and approve from
Teams or the Approvals app. Check the site's News section.
