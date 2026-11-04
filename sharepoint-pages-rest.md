# Creating and publishing SharePoint pages from Power Automate

Flows 1 and 2 create modern SharePoint pages with the **standard** SharePoint action
*Send an HTTP request to SharePoint*, so no premium connector or app registration is needed.
The flow runs as the connection owner, who needs **Edit** (or higher) on the site.

> Why pages and not .html files: SharePoint Online downloads .html files from libraries instead of
> showing them in the browser. Pages render for everyone and can be promoted as News.

## Create a page

### A. **Create Page** — *Send an HTTP request to SharePoint*
- Method: `POST` · Uri: `_api/sitepages/pages`
- Headers:
  ```
  Accept: application/json;odata=verbose
  Content-Type: application/json;odata=verbose
  ```
- Body:
  ```json
  { "__metadata": { "type": "SP.Publishing.SitePage" }, "PageLayoutType": "Article", "PromotedState": 0 }
  ```
  Use `"PromotedState": 1` for status updates. That marks the page to become a **News post when it is published**.

Keep these with *Compose*:
- **Page Id:** `body('Create_Page')?['d']?['Id']`
- **Page Url:** `body('Create_Page')?['d']?['AbsoluteUrl']`

### B. **Canvas** — *Compose* (one full-width text web part holding your HTML)
```json
[
  {
    "controlType": 4,
    "id": "@{guid()}",
    "position": { "zoneIndex": 1, "sectionIndex": 1, "controlIndex": 1, "sectionFactor": 12, "layoutIndex": 1 },
    "innerHTML": "@{outputs('Body_HTML')}",
    "emphasis": {}
  }
]
```

### C. **Save Body** — *Compose*
```json
{
  "__metadata": { "type": "SP.Publishing.SitePage" },
  "Title": "@{outputs('Page_Title')}",
  "CanvasContent1": "@{string(outputs('Canvas'))}"
}
```
Building the body as an object first, then sending `string(...)`, handles all quote escaping for you.

### D. **Save Page** — *Send an HTTP request to SharePoint*
- Method: `POST` · Uri: `_api/sitepages/pages(@{outputs('Page_Id')})/savepage`
- Headers: same as step A
- Body (expression only): `string(outputs('Save_Body'))`

The page now exists as a **draft**. Reviewers can open it and edit it.

## Publish a page

### **Publish Page** — *Send an HTTP request to SharePoint*
- Method: `POST` · Uri: `_api/sitepages/pages(@{outputs('Page_Id')})/publish`
- Headers: same as step A · Body: empty

If the page was created with `"PromotedState": 1`, it shows in the site's **News** web part after publishing.
If it doesn't, open the page and use **Promote → Post as News on this site** once, then check the
`PromotedState` value you sent.

## HTML that works well in the text web part
`<h2> <h3> <p> <strong> <em> <ul> <ol> <li> <a href> <table> <tr> <th> <td>`.
Inline styles and scripts are removed by SharePoint. Replace `&`, `<` and `>` in AI text with
`&amp;`, `&lt;`, `&gt;` if your notes contain them.

> Verify in your tenant: these are the SharePoint REST endpoints used by modern pages. Test once
> with a throwaway page before turning the flows on for real projects.
