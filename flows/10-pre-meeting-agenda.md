# Flow 10 — Post an agenda before the next meeting (Phase 5.5)

**What it does:** about an hour before a captured meeting, MinuteMate posts an agenda into the meeting chat:
what was done and decided since the last meeting, open and overdue action items, risks to discuss, milestones due
in the next two weeks, and dependency conflicts. The website's Meetings tab shows the same agenda
(**Preview agenda**, with a Copy button), built by `web/js/agenda.js`.

- **Type:** Scheduled cloud flow, every hour · **Name:** `MinuteMate 10 - Pre-meeting agenda`
- **Connectors:** SharePoint, Microsoft Teams, Office 365 Outlook; HTTP (premium) only to look up the chat id
- Same "who posts" rule as Flow 9: the posting account must be in the meeting chat.

## Steps
### 1. **Upcoming** — SharePoint *Get items* (Meetings)
```
ProcessingStatus eq 'Waiting for transcript' and AgendaPosted ne 1
and MeetingStart ge '@{addMinutes(utcNow(), 45)}' and MeetingStart lt '@{addMinutes(utcNow(), 105)}'
```

### 2. *Apply to each* meeting → **Get Project** → skip unless `PostAgendaToChat` is Yes.

### 3. **Chat Id** — the chat exists from the moment the meeting is scheduled.
If the meeting's Teams Meeting Chat Id is empty, look it up with the same two HTTP calls as Flow 4 (steps 3a–3b)
and save `chatInfo.threadId` to the item.

### 4. Build the sections (each a *Get items* + *Select* + *Compose*)
`P` = project id, `Since` = start of the previous captured meeting in the same series
(`SeriesId eq '<id>' and ProcessingStatus eq 'Done'`, order by MeetingStart desc, top 1), or 7 days ago.
| Section | Query |
|---|---|
| Since the last meeting | Action Items `ItemStatus eq 'Done' and ClosedDate ge Since`; Decisions `DecisionDate ge Since` |
| Open action items | Action Items `ItemStatus ne 'Done'`, order by DueDate; prefix `OVERDUE · ` when DueDate is past |
| Risks to discuss | Risks `RiskStatus ne 'Closed' and (Impact eq 'High' or Created ge Since)` |
| Milestones in the next two weeks | Milestones `MilestoneStatus ne 'Done' and DueDate le <now + 14 days>` |

(The dependency check needs the multi-lookup comparison from Flow 7; include it if you built Flow 7, or leave it to
the website preview.)

### 5. Post — Teams *Post message in a chat or channel* (User → Group chat = Chat Id) with the agenda HTML;
fall back to an Outlook email to the organizer.

### 6. *Update item* (Meetings): Agenda Posted = Yes.
