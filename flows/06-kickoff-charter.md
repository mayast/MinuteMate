# Flow 6 — Turn the kickoff kit into a charter page (Phase 4)

**What it does:** when someone submits the kickoff kit on the website, the flow gathers the project, its
stakeholders and milestones, asks AI to draft the charter, and saves it as a **draft SharePoint page**. The
project owner gets a link to review and publish it. The website shows the status and the link on the Overview tab.

- **Type:** Automated cloud flow · **Name:** `MinuteMate 6 - Kickoff charter`
- **Connectors:** SharePoint, AI Builder, Microsoft Teams (standard)

## Steps

### 1. Trigger — SharePoint *When an item is created* (Kickoffs)
Trigger condition: `@equals(triggerOutputs()?['body/KickoffStatus/Value'], 'Draft requested')`

### 2. *Update item* (Kickoffs) → Status `Generating`

### 3. Gather the kit (SharePoint *Get item* / *Get items*), with `P` = `triggerOutputs()?['body/Project/Id']`
- **Get Project** — Projects, Id `P`
- **Get People** — Stakeholders, Filter `ProjectId eq P`
- **Get Milestones** — Milestones, Filter `ProjectId eq P`, Order By `DueDate`

Turn them into text with *Select* (text mode) + *Compose* `join(..., decodeUriComponent('%0A'))`:
- People: `concat('- ', item()?['Title'], ' (', coalesce(item()?['Role'], 'role not set'), '): ', item()?['RACI/Value'])`
- Milestones: `concat('- ', item()?['Title'], ' [', item()?['Workstream'], '] ', formatDateTime(item()?['StartDate'], 'MMM d'), ' to ', formatDateTime(item()?['DueDate'], 'MMM d'))`
- Dependencies (optional, for the "Depends on" column and better risk spotting): add an *Apply to each* over
  the milestones with a *Select* over `items('Apply_to_each')?['DependsOn']` mapping `item()?['Value']`, and
  append `concat(' (after: ', join(body('Select_Deps'), ', '), ')')` to that milestone's line.

### 4. **Run Charter Prompt** — AI Builder *Run a prompt* → `MinuteMate - Kickoff charter`
Map the inputs from the trigger (Goal, Scope, Out of scope, Success metrics, Constraints), the project
(Title, Start Date, Target Date) and the two Compose outputs from step 3.

### 5. **Parse Charter** — *Parse JSON* (schema from the prompt's format sample)

### 6. **Body HTML** — *Compose*, built from `templates/charter-page.html`
Lists use the same pattern as Flow 2, step 8:
```
if(empty(body('Parse_Charter')?['objectives']), '<p>To be agreed at kickoff.</p>',
   concat('<ul><li>', join(body('Parse_Charter')?['objectives'], '</li><li>'), '</li></ul>'))
```
For the RACI and milestone tables, build rows with *Select* + `join(..., '')`, like the action table in Flow 1.

### 7. Create the page — `docs/sharepoint-pages-rest.md` → **Create a page**
- Title: `concat(body('Get_Project')?['Title'], ' — Project charter')`
- `"PromotedState": 0` (a charter is a page, not News) · **Don't publish**: the owner reviews it first.

### 8. *Update item* (Kickoffs): Charter Page = page URL, Status `Ready`

### 9. Microsoft Teams *Post message in a chat or channel* (Flow bot → owner)
To `body('Get_Project')?['ProjectOwnerEmail']`: "Your charter draft for <project> is ready to review: <link>.
Edit it, then publish and share it with stakeholders."

### Errors
Wrap steps 3–9 in a **Try** scope; a **Catch** scope (run after *has failed*) sets Status `Error` and tells the owner.
