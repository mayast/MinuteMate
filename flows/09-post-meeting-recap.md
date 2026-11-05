# Flow 9 — Post the recap to the Teams meeting chat (Phase 5.2)

**What it does:** right after Flow 1 finishes a meeting, MinuteMate posts the summary, action items (with owners
and due dates), decisions and new risks into that meeting's Teams chat, where attendees already are. This is the
biggest adoption win: people see results without opening anything.

- **Type:** Automated cloud flow · **Name:** `MinuteMate 9 - Post meeting recap`
- **Connectors:** SharePoint, Microsoft Teams, Office 365 Outlook (fallback)

## Who posts (important)
Teams only lets a member of a chat post into it. The simplest setup: the flow's Teams connection signs in as the
**MinuteMate account** (the mailbox from Flow 5). When people invite MinuteMate to a meeting, that account is an
attendee, so it's in the meeting chat and can post there. For meetings captured from the website, ask organizers to
add MinuteMate to the invite too, or use the email fallback below.

## Steps
### 1. Trigger — SharePoint *When an item is created or modified* (Meetings)
Trigger conditions:
```
@equals(triggerOutputs()?['body/ProcessingStatus/Value'], 'Done')
@not(equals(triggerOutputs()?['body/RecapPosted'], true))
```

### 2. **Get Project** → stop unless `PostRecapToChat` is Yes.

### 3. Gather this meeting's items (SharePoint *Get items*, filter `SourceMeetingId eq <meeting ID>`)
- Action Items, Decisions, Risks

### 4. **Recap HTML** — *Compose*
```
<b>MinuteMate recap: @{triggerOutputs()?['body/Title']}</b><br>
@{triggerOutputs()?['body/Summary']}<br><br>
<b>Action items</b><br>@{join(body('Select_Actions'), '<br>')}<br><br>
<b>Decisions</b><br>@{join(body('Select_Decisions'), '<br>')}<br><br>
<b>New risks</b><br>@{join(body('Select_Risks'), '<br>')}<br><br>
<a href="@{triggerOutputs()?['body/NotesPage/Url']}">Meeting notes</a> · reply here if anything is wrong
```
Select maps, for example: actions `concat('• ', item()?['Title'], ' — ', coalesce(item()?['OwnerAsWritten'], 'no owner'), if(empty(item()?['DueDate']), '', concat(', due ', formatDateTime(item()?['DueDate'], 'MMM d'))))`.
Show "None" for an empty section.

### 5. Condition — has a chat id (`not(empty(triggerOutputs()?['body/ChatId']))`)
- **Yes:** Microsoft Teams *Post message in a chat or channel* → Post as **User** → Post in **Group chat** →
  Group chat = custom value `triggerOutputs()?['body/ChatId']` → Message = Recap HTML.
  If it fails (the account isn't in the chat), fall through to the email.
- **No / failed:** Outlook *Send an email (V2)* to the organizer (and attendees, if you store them) with the same HTML.

### 6. *Update item* (Meetings): Recap Posted = Yes.

## Test
Invite MinuteMate to a test meeting, turn on transcription, run it, then wait for Flow 4 and Flow 1. The recap
appears in the meeting chat within a few minutes of processing.
