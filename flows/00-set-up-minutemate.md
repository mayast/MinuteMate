# Flow 0 — Set up MinuteMate (creates the SharePoint lists)

**What it does:** creates all nine MinuteMate lists and their columns on a SharePoint site. It replaces the
PowerShell script for most people: no script, no app registration, standard connector only. It's safe to run again;
it skips anything that already exists and adds anything new, so it's also how you **upgrade** after a new release.

- **Type:** Instant cloud flow (manual trigger) · **Name:** `MinuteMate 0 - Set up MinuteMate`
- **Connector:** SharePoint (*Send an HTTP request to SharePoint*), standard
- **Who runs it:** someone with **Owner** permission on the SharePoint site
- In the packaged release this flow is already built; you just run it. The steps below are for building it yourself.

The list and column definitions live in [`provisioning/lists.json`](../provisioning/lists.json), generated from the
PowerShell script so both create exactly the same lists. Each column has ready-to-send `schemaXml`.

## Steps

### 1. Trigger — *Manually trigger a flow*
Input (text): **Site address**, e.g. `https://contoso.sharepoint.com/sites/ProjectHub`

### 2. **Definitions** — *Compose*
Paste the whole contents of `provisioning/lists.json`. Then **Lists** — *Compose*: `outputs('Definitions')?['lists']`

### 3. Initialize variable **ListIds** (Object) = `{}`

### 4. **Each List** — *Apply to each* over `outputs('Lists')` (Settings → Concurrency: **off**, so lookups find their target)

4a. **Find List** — *Send an HTTP request to SharePoint* · Site = the trigger's Site address · `GET`
`_api/web/lists/getbytitle('@{items('Each_List')?['title']}')?$select=Id` · Header `Accept: application/json;odata=nometadata`

4b. **Create List** — *Send an HTTP request to SharePoint* · **Configure run after: Find List *has failed*** · `POST`
`_api/web/lists` · Headers `Accept` and `Content-Type`: `application/json;odata=verbose` · Body:
```json
{ "__metadata": { "type": "SP.List" }, "BaseTemplate": 100, "Title": "@{items('Each_List')?['url']}", "Description": "MinuteMate" }
```
Creating with the short name first gives the list a clean web address (`/Lists/ActionItems`).

4c. **Rename List** — same action, run after Create List *succeeded* · `POST`
`_api/web/lists(guid'@{body('Create_List')?['d']?['Id']}')` · extra header `X-HTTP-Method: MERGE`, `IF-MATCH: *` · Body:
```json
{ "__metadata": { "type": "SP.List" }, "Title": "@{items('Each_List')?['title']}" }
```

4d. **Remember Id** — *Set variable* ListIds, run after 4a *succeeded* **or** 4c *succeeded* (add both):
```
setProperty(variables('ListIds'), items('Each_List')?['title'], coalesce(body('Find_List')?['Id'], body('Create_List')?['d']?['Id']))
```
(Power Automate won't let a variable reference itself in Set variable; use a *Compose* with this expression, then
*Set variable* = that Compose's output.)

### 5. **Each List Again** — *Apply to each* over `outputs('Lists')` (concurrency off)
Inside it, **Each Field** — *Apply to each* over `items('Each_List_Again')?['fields']` (concurrency off):

5a. **Schema** — *Compose* (swaps the lookup placeholder for the real list id):
```
if(empty(items('Each_Field')?['lookupList']),
   items('Each_Field')?['schemaXml'],
   replace(items('Each_Field')?['schemaXml'],
           concat('{ListId:', items('Each_Field')?['lookupList'], '}'),
           concat('{', variables('ListIds')?[items('Each_Field')?['lookupList']], '}')))
```

5b. **Find Field** — `GET`
`_api/web/lists(guid'@{variables('ListIds')?[items('Each_List_Again')?['title']]}')/fields/getbyinternalnameortitle('@{items('Each_Field')?['name']}')?$select=Id`

5c. **Create Field** — run after Find Field *has failed* · `POST`
`_api/web/lists(guid'@{variables('ListIds')?[items('Each_List_Again')?['title']]}')/fields/createfieldasxml` · verbose headers · Body:
```json
{ "parameters": { "__metadata": { "type": "SP.XmlSchemaFieldCreationInformation" }, "SchemaXml": "@{outputs('Schema')}", "Options": 8 } }
```
`Options: 8` adds the column to the list's default view.

### 6. Tell the person it's done
*Respond to a PowerApp or flow* (or a Teams message to the runner): "MinuteMate is set up on <site>. Open the
MinuteMate website and run **Setup check**."

## Notes
- **Run time:** about 2–4 minutes the first time (93 columns); seconds on later runs.
- **Existing columns aren't changed.** If an older install's *Processing Status* column lacks the choice
  *Waiting for transcript*, the website's Setup check flags it; add the choice in List settings.
- **Keeping things in sync:** if you add a column to `Setup-MinuteMate.ps1`, regenerate the JSON:
  `python3 scripts/gen_lists.py provisioning/Setup-MinuteMate.ps1 provisioning/lists.json`.
