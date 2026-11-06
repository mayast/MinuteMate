# Flow 12 — Assess an artifact for risks and dependencies

**What it does:** when someone adds a file or a link on the website's **Risks & dependencies** tab (or selects
**Assess again**), the flow reads it, asks AI which risks and dependencies it contains, and logs them in the
**Risks** and **Dependencies** lists with a link back to the artifact. The website then shows them in
*Needs attention*, the tables and the Overview.

Meeting notes pasted on that tab become a normal meeting, so **Flow 1** handles them (see its step 9b).

- **Type:** Automated cloud flow · **Name:** `MinuteMate 12 - Assess artifact`
- **Connectors:** SharePoint, AI Builder, OneDrive for Business (standard)

## Steps

### 1. Trigger — SharePoint *When an item is created or modified* (Artifacts)
Trigger condition (so it runs only for new items and **Assess again**):
```
@equals(triggerOutputs()?['body/AssessmentStatus/Value'], 'New')
```

### 2. *Update item* (Artifacts) → Assessment Status `Assessing`
This also stops the flow from triggering itself again.

### 3. Add a **Scope** named **Try** and put steps 4–11 inside it.

### 4. **Get Project** — SharePoint *Get item* (Projects, Id `triggerOutputs()?['body/Project/Id']`)

### 5. Get the document text
- **Notes** — *Compose*: `coalesce(triggerOutputs()?['body/Content'], '')`
  The website already puts the text of .txt, .md and .csv files here, plus anything the person typed.
- Condition **Is Uploaded File** — `triggerOutputs()?['body/ArtifactType/Value']` is equal to `File`
  - **Yes:** **Get File** — SharePoint *Get file content using path* (this site), File path:
    `concat('/Shared Documents/MinuteMate Artifacts/', coalesce(body('Get_Project')?['ProjectCode'], body('Get_Project')?['Title']), '/', triggerOutputs()?['body/FileName'])`
    - **PDF or image:** pass the content to Prompt 4's optional **ArtifactFile** input.
    - **Word or PowerPoint:** OneDrive for Business *Create file* (a temp folder) with the content, then
      *Convert file* → PDF, pass that PDF to **ArtifactFile**, and delete the temp file.
    - No document input in your prompt builder? Use AI Builder *Recognize text in an image or document* on the
      PDF and append the text to **Notes** instead.
  - **No (a link):** MinuteMate assesses the link from its title and the notes the person pasted. If the link
    points to a file on this same site, you can add a *Get file content using path* step like **Yes**.
    If **Notes** is empty, skip to step 12 and set the status to `Needs review`.

### 6. **Milestones Text** — SharePoint *Get items* (Milestones, Filter `ProjectId eq <project id>`), then *Select*
(text mode): `concat(item()?['ID'], ' | ', item()?['Title'], ' | ', formatDateTime(item()?['StartDate'], 'yyyy-MM-dd'), ' | ', formatDateTime(item()?['DueDate'], 'yyyy-MM-dd'), ' | ', item()?['MilestoneStatus/Value'])`
and *Compose* `join(body('Select_Milestones'), decodeUriComponent('%0A'))`.

### 7. **Open Items Text** — *Get items* on Risks (Filter `ProjectId eq <id> and RiskStatus ne 'Closed'`) and
Dependencies (Filter `ProjectId eq <id> and DependencyStatus ne 'Resolved'`); *Select* `concat('R-', item()?['ID'], ' | ', item()?['Title'])`
and `concat('D-', item()?['ID'], ' | ', item()?['Title'])`; join both with line breaks.

### 8. **Run Assess Prompt** — AI Builder *Run a prompt* → `MinuteMate - Assess artifact`
- ProjectName: `body('Get_Project')?['Title']` · ArtifactTitle: `triggerOutputs()?['body/Title']`
- ArtifactText: `substring(outputs('Notes'), 0, min(length(outputs('Notes')), 60000))`
- Milestones, OpenItems: outputs of steps 6–7

### 9. **Parse Assessment** — *Parse JSON* (schema from Prompt 4's format sample)

### 10. **Each Dependency** — *Apply to each* over `body('Parse_Assessment')?['dependencies']`
- Condition **Is Match** — `items('Each_Dependency')?['matches_existing_id']` is not equal to `''`
  - **Yes:** SharePoint *Update item* (Dependencies, Id = `int(...matches_existing_id)`): Needed By (if not
    empty), Status, Details: append `concat('Also in ', triggerOutputs()?['body/Title'], ': "', items('Each_Dependency')?['source_quote'], '"')`.
  - **No:** SharePoint *Create item* (Dependencies):
    - Title, Type Value `type`, Provided By `provided_by`, Impact Value `impact`, Status Value `status`
    - Needed By: `if(empty(items('Each_Dependency')?['needed_by']), null, items('Each_Dependency')?['needed_by'])`
    - Related Milestone Id: `if(empty(items('Each_Dependency')?['milestone_id']), null, int(items('Each_Dependency')?['milestone_id']))`
    - Project Id, Source Artifact Id `triggerOutputs()?['body/ID']`
    - Owner Email: `triggerOutputs()?['body/AddedByEmail']`
    - Details: `concat('From the source: "', items('Each_Dependency')?['source_quote'], '"')`

### 11. **Each Risk** — the same pattern over `risks` into the Risks list (Impact, Likelihood, Mitigation,
Status `Open`, Source Artifact Id).

### 12. **Finish** — *Update item* (Artifacts), after **Try**
- Assessment Summary: `body('Parse_Assessment')?['summary']` · Last Assessed: `utcNow()`
- Assessment Status:
  `if(or(equals(body('Parse_Assessment')?['needs_review'], true), equals(add(length(body('Parse_Assessment')?['dependencies']), length(body('Parse_Assessment')?['risks'])), 0)), 'Needs review', 'Assessed')`

### 13. **Catch** — a Scope after **Try** that runs if it *has failed* or *has timed out*:
*Update item* (Artifacts) → Assessment Status `Error`, Assessment Summary `Couldn't read this artifact. Check the link
or file, then select Assess again.`

## Optional: tell the owner
Add a Teams *Post message in a chat or channel* to `AddedByEmail` when a **Blocked** or **High**-impact dependency
is created, linking to `https://<your website>/?tab=risks`.

## Test
1. On the website, open **Risks & dependencies**, choose **Add a link**, paste a SharePoint page link and a title.
2. Within a minute or two the Sources list shows **Assessed**, and new rows appear in Dependencies and Risks,
   each with *From: <your artifact>*.
3. Select **Assess again**: matching items are updated, not duplicated.
