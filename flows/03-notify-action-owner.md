# Flow 3 — Notify action item owners (Teams, Outlook, or both)

**What it does:** whenever an action item has an owner and hasn't been notified yet, it sends the owner a
message through the chosen channel, then marks the item **Notified**. Works for items the AI created
and items people add by hand.

**How the channel is chosen**

| Action item "Notify Via" | Channel used |
|---|---|
| Project default | The project's **Default Notify Via** (Teams, Outlook, or Teams and Outlook) |
| Teams / Outlook / Teams and Outlook | That choice, for this item only |

To re-send (for example after changing the owner or channel), set **Notified** back to **No**.

- **Type:** Automated cloud flow · **Name:** `MinuteMate 3 - Notify action owner`
- **Connectors:** SharePoint, Microsoft Teams, Office 365 Outlook

## Steps

### 1. Trigger — SharePoint *When an item is created or modified* (Action Items)
Trigger conditions:
```
@equals(triggerOutputs()?['body/Notified'], false)
@not(empty(coalesce(triggerOutputs()?['body/Owner/Email'], triggerOutputs()?['body/OwnerEmail'])))
```

### 1b. **Owner Email** — *Compose*
```
coalesce(triggerOutputs()?['body/Owner/Email'], triggerOutputs()?['body/OwnerEmail'])
```
Items the AI creates use the Owner (person) column; items added on the website use Owner Email. Use
`outputs('Owner_Email')` wherever the steps below say the owner's email.

### 2. **Get Project** — SharePoint *Get item* (Projects)
- Id: `triggerOutputs()?['body/Project/Id']`

### 3. **Channel** — *Compose*
```
if(equals(triggerOutputs()?['body/NotifyVia/Value'], 'Project default'),
   coalesce(body('Get_Project')?['DefaultNotifyVia/Value'], 'Teams'),
   triggerOutputs()?['body/NotifyVia/Value'])
```

### 4. **Item Link** — *Compose*
```
triggerOutputs()?['body/{Link}']
```

### 5. **Due Text** — *Compose*
```
if(empty(triggerOutputs()?['body/DueDate']), 'No due date', formatDateTime(triggerOutputs()?['body/DueDate'], 'ddd, MMM d'))
```

### 6. Condition **Use Teams** — `contains(outputs('Channel'), 'Teams')` is equal to `true`
- **Yes:** Microsoft Teams *Post card in a chat or channel*
  - Post as: **Flow bot** · Post in: **Chat with Flow bot**
  - Recipient: `outputs('Owner_Email')`
  - Adaptive Card: paste `templates/action-item-card.json`, then replace the `${...}` placeholders
    with dynamic content (title, project, due text, priority, details, item link).

### 7. Condition **Use Outlook** — `contains(outputs('Channel'), 'Outlook')` is equal to `true`
- **Yes:** Office 365 Outlook *Send an email (V2)*
  - To: `outputs('Owner_Email')`
  - Subject: `concat('Action item: ', triggerOutputs()?['body/Title'])`
  - Body: `templates/action-item-email.html` (switch the body editor to code view `</>` and paste),
    then replace the `${...}` placeholders.

### 8. **Mark Notified** — SharePoint *Update item* (Action Items)
- Id: `triggerOutputs()?['body/ID']` · Notified: **Yes**

## Optional extension: due-date reminders
A scheduled flow (daily, 8:00 local time) that gets Action Items where
`ItemStatus ne 'Done' and DueDate eq '<tomorrow>'` and sends the same card or email with "Due tomorrow".
