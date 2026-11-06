# Flow 1 — Process meeting notes

**What it does:** when someone adds a meeting to the **Meetings** list (with notes or a Teams recap pasted in),
the flow reads it with AI, writes a summary back, creates the meeting notes page, and adds every action item,
risk and decision to its list. Owners are notified by **Flow 3**.

- **Type:** Automated cloud flow
- **Name:** `MinuteMate 1 - Process meeting notes`
- **Connectors:** SharePoint, AI Builder, Office 365 Users, Office 365 Outlook (errors only)

> Naming: rename each action as shown in **bold** so the expressions below work as written.

## Steps

### 1. Trigger — SharePoint *When an item is created or modified*
- Site: your project site · List: **Meetings**
- Settings → **Trigger conditions** (add both):
  ```
  @equals(triggerOutputs()?['body/ProcessingStatus/Value'], 'New')
  @not(empty(triggerOutputs()?['body/RawNotes']))
  ```
  This runs only for new, unprocessed meetings and stops the flow from re-triggering itself.

### 2. **Set Processing** — SharePoint *Update item* (Meetings)
- Id: `triggerOutputs()?['body/ID']` · Processing Status: `Processing`

### 3. **Get Project** — SharePoint *Get item* (Projects)
- Id: `triggerOutputs()?['body/Project/Id']`

### 4. **Attendee Names** — Data Operation *Select*
- From: `triggerOutputs()?['body/Attendees']`
- Map (text mode): `concat(item()?['DisplayName'], ' <', item()?['Email'], '>')`

Then **Attendees Text** — *Compose*: `join(body('Attendee_Names'), ', ')`

### 4b. **Open Items Text** — gather open action items so the AI can avoid duplicates
- SharePoint *Get items* (Action Items), Filter: `ProjectId eq @{triggerOutputs()?['body/Project/Id']} and ItemStatus ne 'Done'`
- *Select* (text mode): `concat(item()?['ID'], ' | ', item()?['Title'], ' | ', coalesce(item()?['OwnerAsWritten'], item()?['OwnerEmail'], ''), ' | ', coalesce(item()?['DueDate'], ''))`
- *Compose*: `if(empty(body('Select')), '(none)', join(body('Select'), decodeUriComponent('%0A')))`

### 5. Add a **Scope** named **Try** — put steps 6–12 inside it

### 6. **Run Extract Prompt** — AI Builder *Run a prompt*
- Prompt: `MinuteMate - Extract meeting items` (see `prompts/01-extract-meeting-items.md`)
- MeetingTitle: `triggerOutputs()?['body/Title']`
- MeetingDate: `formatDateTime(triggerOutputs()?['body/MeetingDate'], 'yyyy-MM-dd')`
- Attendees: `outputs('Attendees_Text')`
- ProjectName: `body('Get_Project')?['Title']`
- OpenActionItems: `outputs('Open_Items_Text')`
- Notes: `triggerOutputs()?['body/RawNotes']`

### 7. **Parse Items** — *Parse JSON*
- Content: the prompt's text/JSON output
- Schema: **Generate from sample** → paste the format sample from the prompt file.
  Then in the schema, change `"type": "string"` for `owner_email` and `due_date` to
  `"type": ["string", "null"]` so blank values never fail the flow.

### 8. **Each Action Item** — *Apply to each* over `body('Parse_Items')?['action_items']`

  8a. **Search Owner** — Office 365 Users *Search for users (V2)*
  - Search term: `items('Each_Action_Item')?['owner_name']` · Top: `2`
  - Settings → Run after: also allow when it **fails** (blank names fail the search).

  8b. **Owner Email** — *Compose*
  ```
  if(not(empty(items('Each_Action_Item')?['owner_email'])),
     items('Each_Action_Item')?['owner_email'],
     if(equals(length(coalesce(body('Search_Owner')?['value'], createArray())), 1),
        first(body('Search_Owner')?['value'])?['Mail'],
        coalesce(body('Get_Project')?['ProjectOwnerEmail'], body('Get_Project')?['ProjectOwner/Email'])))
  ```
  Falls back to the project owner when the owner is missing or the name matched several people.

  8b2. Condition **Is Duplicate** — `items('Each_Action_Item')?['matches_existing_id']` is not equal to `''`
  - *Yes:* **Get Existing** — SharePoint *Get item* (Action Items, Id = `int(items('Each_Action_Item')?['matches_existing_id'])`),
    then *Update item* on the same Id:
    - Seen in Meetings: `add(int(coalesce(body('Get_Existing')?['SeenInMeetings'], 1)), 1)`
    - Due Date: the new `due_date` if it isn't empty, otherwise keep `body('Get_Existing')?['DueDate']`
    - Details: append `concat(decodeUriComponent('%0A'), 'Raised again on ', formatDateTime(triggerOutputs()?['body/MeetingDate'], 'MMM d'), ': "', items('Each_Action_Item')?['source_quote'], '"')`
    - Skip step 8c for this item.
  - *No:* continue to 8c.

  8c. **Create Action Item** — SharePoint *Create item* (Action Items)
  - Title: `items('Each_Action_Item')?['title']`
  - Project Id: `triggerOutputs()?['body/Project/Id']`
  - Source Meeting Id: `triggerOutputs()?['body/ID']`
  - Owner Claims: `outputs('Owner_Email')`
  - Owner (as written in notes): `items('Each_Action_Item')?['owner_name']`
  - Due Date: `if(empty(items('Each_Action_Item')?['due_date']), null, items('Each_Action_Item')?['due_date'])`
  - Priority Value: `items('Each_Action_Item')?['priority']`
  - Details: `concat(items('Each_Action_Item')?['details'], decodeUriComponent('%0A%0A'), 'From notes: "', items('Each_Action_Item')?['source_quote'], '"')`
  - Notify Via Value: `Project default` · Notified: `No`
  - Source Value: `Meeting` · Seen in Meetings: `1` · Sync State Value: `Not synced`

### 9. **Each Risk** — *Apply to each* over `body('Parse_Items')?['risks']`
- SharePoint *Create item* (Risks): Title, Project Id, Source Meeting Id, Impact, Likelihood, Mitigation,
  Status `Open`. (Owner: optional — reuse the 8a/8b pattern if you want it resolved.)

### 9b. **Each Dependency** — *Apply to each* over `body('Parse_Items')?['dependencies']`
- SharePoint *Create item* (Dependencies): Title, Project Id, Source Meeting Id, Type Value `type`,
  Provided By `provided_by`, Status Value `status`, Impact Value `impact`,
  Needed By `if(empty(items('Each_Dependency')?['needed_by']), null, items('Each_Dependency')?['needed_by'])`.
  They appear on the website's **Risks & dependencies** tab, linked to this meeting.
- Older Prompt 1 without `dependencies`? Use `coalesce(body('Parse_Items')?['dependencies'], createArray())`.

### 10. **Each Decision** — *Apply to each* over `body('Parse_Items')?['decisions']`
- SharePoint *Create item* (Decisions): Title, Project Id, Source Meeting Id,
  Decision Date `triggerOutputs()?['body/MeetingDate']`, Decided By, Rationale.

### 11. Create the meeting notes page (optional but recommended)
Follow `docs/sharepoint-pages-rest.md` → **Create a page** with:
- Title: `concat('Notes: ', triggerOutputs()?['body/Title'], ' (', formatDateTime(triggerOutputs()?['body/MeetingDate'], 'MMM d, yyyy'), ')')`
- Body HTML: build from `templates/meeting-notes-page.html`. For the action table rows, use a *Select*
  (text mode) over `body('Parse_Items')?['action_items']`:
  `concat('<tr><td>', item()?['title'], '</td><td>', item()?['owner_name'], '</td><td>', item()?['due_date'], '</td><td>', item()?['priority'], '</td></tr>')`
  then `join(body('Action_Rows'), '')`. Lists use the same `<ul><li>` pattern as Flow 2, step 8.
- Promote to news: **No** · Publish: **Yes** (notes pages don't need approval)

### 12. **Finish Meeting** — SharePoint *Update item* (Meetings)
- AI Summary: `body('Parse_Items')?['summary']`
- Meeting Notes Page: the page URL from step 11
- Processing Status:
  ```
  if(equals(body('Parse_Items')?['needs_review'], true), 'Needs review', 'Done')
  ```

### 13. Add a **Scope** named **Catch** after **Try**
- Settings → Run after: **Try** *has failed* / *has timed out*
- Inside: SharePoint *Update item* (Meetings) → Processing Status `Error`
- Outlook *Send an email (V2)* to `triggerOutputs()?['body/Author/Email']`:
  "We couldn't process the notes for <meeting>. Check the notes and set Processing Status back to New to retry."

## After processing
- **Flow 9** posts the recap to the Teams meeting chat when the meeting is marked Done (if the project turns it on).
- **Flow 8** sends new action items to the project's work tracker (Planner, Azure DevOps or GitHub).

## Test

1. Add a project to **Projects** (owner, approver, Default Notify Via).
2. Add a meeting: pick the project, set the date, paste `samples/sample-meeting-notes.txt` into **Raw Notes**.
3. Within a minute or two: Summary filled, status **Done**, new rows in Action Items, Risks and Decisions.
4. Re-run: set Processing Status back to **New**.
