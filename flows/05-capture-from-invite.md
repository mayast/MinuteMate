# Flow 5 — Capture meetings by inviting MinuteMate (Phase 3)

**What it does:** people add **minutemate@yourcompany.com** to any Teams invite and put the project code in
the title, e.g. `[PHX] Weekly sync`. The flow sees the invite, matches the project code, and adds the meeting
to the Meetings list as **Waiting for transcript**. Flow 4 picks up the transcript after the meeting.

No website visit needed: inviting MinuteMate is the whole step.

- **Type:** Automated cloud flow · **Name:** `MinuteMate 5 - Capture from invite`
- **Connectors:** Office 365 Outlook, SharePoint (standard)

## One-time setup
1. Create a mailbox for MinuteMate, e.g. `minutemate@contoso.com`. A licensed service account is simplest;
   the flow's Outlook connection signs in as that account. (Ask IT; a shared mailbox can work if your admins
   grant the flow owner access to its calendar.)
2. Set the mailbox to **auto-accept** meeting invites so organizers see MinuteMate accepted.
3. Put the address in `web/config.js` → `inviteAddress`, so the website shows the tip on the Meetings tab.
4. Give each project a **Project code** (Settings tab, or the kickoff kit).

## Steps

### 1. Trigger — Office 365 Outlook *When a new event is created (V3)*
- Calendar id: **Calendar** (of the MinuteMate account)

### 2. **Join Url** — *Compose*
```
coalesce(triggerOutputs()?['body/onlineMeeting/joinUrl'], '')
```
Then a Condition: if it's empty, *Terminate* (Succeeded): not a Teams meeting.

### 3. **Code** — *Compose* (text between the first `[` and `]` in the subject)
```
if(and(contains(triggerOutputs()?['body/subject'], '['), contains(triggerOutputs()?['body/subject'], ']')),
   trim(substring(triggerOutputs()?['body/subject'], add(indexOf(triggerOutputs()?['body/subject'], '['), 1),
     sub(indexOf(triggerOutputs()?['body/subject'], ']'), add(indexOf(triggerOutputs()?['body/subject'], '['), 1)))),
   '')
```

### 4. **Find Project** — SharePoint *Get items* (Projects)
- Filter Query: `ProjectCode eq '@{outputs('Code')}'` · Top Count: 1

If no project matched (`empty(body('Find_Project')?['value'])`): reply to the organizer with Outlook
*Send an email (V2)*: "MinuteMate didn't recognize the project code in '<subject>'. Add a code like [PHX]
from the MinuteMate site, or switch Capture on there." Then *Terminate*.

### 5. **Already Captured** — SharePoint *Get items* (Meetings)
- Filter Query: `JoinUrl eq '@{outputs('Join_Url')}'` (if your tenant rejects filtering on multi-line text,
  filter on `SeriesId` + `MeetingStart` instead, or skip this check)
- If any item exists, *Terminate*.

### 6. **Add Meeting** — SharePoint *Create item* (Meetings)
| Column | Value |
|---|---|
| Title | `triggerOutputs()?['body/subject']` |
| Project Id | `first(body('Find_Project')?['value'])?['ID']` |
| Meeting Date / Meeting Start | `triggerOutputs()?['body/start']` |
| Meeting End | `triggerOutputs()?['body/end']` |
| Teams Join Link | `outputs('Join_Url')` |
| Organizer Email | `triggerOutputs()?['body/organizer']` |
| Series Id | `coalesce(triggerOutputs()?['body/seriesMasterId'], '')` |
| Capture Mode | `Teams transcript` |
| Processing Status | `Waiting for transcript` |
| Transcript Attempts | `0` |

Field names on the V3 trigger can differ slightly by connector version; pick them from the dynamic content list.

## Recurring meetings
A series invite creates one calendar event for the series. Two options:
- **Simple:** have organizers turn on Capture for the series on the website (one click: "Capture every meeting
  in this series").
- **Automatic:** add a daily scheduled flow on the MinuteMate calendar that lists the next 7 days of event
  occurrences (*Get calendar view of events (V3)*) and runs steps 2–6 for each one.
