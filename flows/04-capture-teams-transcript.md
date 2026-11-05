# Flow 4 — Pick up Teams transcripts automatically (Phase 3)

**What it does:** every 30 minutes, it looks for captured meetings that have ended and are still
**Waiting for transcript**. For each one it finds the meeting from its Teams link, downloads the newest
transcript, puts it in **Raw Notes**, and sets the status to **New**, which starts Flow 1. If no transcript
appears after about 6 hours, the meeting is marked **Error** and the organizer is told how to fix it. People can
click **Retry** on the website's transcript queue to start over.

Why a scheduled sweep instead of one waiting flow per meeting: runs survive flow edits, meetings scheduled weeks
ahead don't hold a run open, and one flow handles every project.

- **Type:** Scheduled cloud flow · **Name:** `MinuteMate 4 - Pick up Teams transcripts`
- **Schedule:** every 30 minutes
- **License:** Power Automate **Premium** (the *HTTP* action is premium)
- **Connectors:** SharePoint, HTTP, Office 365 Outlook

## One-time admin setup (needs your Microsoft 365 admins)

1. **Turn on Graph access to transcripts.** A Teams admin must allow apps to read meeting transcripts.
   Without it, calls fail with `403 GraphAccessToTranscriptsDisabled`.
2. **App registration for the back end** (separate from the website's registration):
   - Entra ID → App registrations → New → `MinuteMate Backend`
   - API permissions → Microsoft Graph → **Application**: `OnlineMeetings.Read.All` (find a meeting from its
     link), `OnlineMeetingTranscript.Read.All` (read transcripts), `User.Read.All` (look up the organizer) →
     **Grant admin consent**
   - Certificates & secrets → new client secret. Keep it in an **environment variable of type Secret** (backed by
     Azure Key Vault), and turn on **Secure inputs/outputs** for every HTTP action.
3. **Application access policy for online meetings** (Teams PowerShell):
   ```powershell
   New-CsApplicationAccessPolicy -Identity MinuteMate-Policy -AppIds "<backend client id>" -Description "MinuteMate"
   Grant-CsApplicationAccessPolicy -PolicyName MinuteMate-Policy -Global   # or grant to specific organizers
   ```
4. **Transcription must be on** in each meeting: the organizer starts it, or a Teams meeting policy turns it on.

> Check each permission name and the policy step against current Microsoft Learn pages before you start.
> Microsoft changes these APIs from time to time.

**HTTP authentication (use on every HTTP action below):** Active Directory OAuth · Authority
`https://login.microsoftonline.com` · Tenant `<tenant id>` · Audience `https://graph.microsoft.com` ·
Client ID / Secret from the backend app.

## Steps

### 1. Trigger — *Recurrence*: every 30 minutes

### 2. **Due Meetings** — SharePoint *Get items* (Meetings)
- Filter Query:
  ```
  ProcessingStatus eq 'Waiting for transcript' and MeetingEnd lt '@{addMinutes(utcNow(), -10)}'
  ```
- Top Count: 50

### 3. **Each Meeting** — *Apply to each* over `body('Due_Meetings')?['value']`
Settings → Concurrency control: **on**, degree **5**. Inside the loop, add a **Scope** named **Try** with steps 3a–3e.

**3a. Get Organizer** — *HTTP* `GET`
```
https://graph.microsoft.com/v1.0/users/@{items('Each_Meeting')?['OrganizerEmail']}?$select=id
```

**3b. Find Meeting** — *HTTP* `GET`
```
https://graph.microsoft.com/v1.0/users/@{body('Get_Organizer')?['id']}/onlineMeetings?$filter=JoinWebUrl eq '@{encodeUriComponent(items('Each_Meeting')?['JoinUrl'])}'
```

**3c. List Transcripts** — *HTTP* `GET`
```
https://graph.microsoft.com/v1.0/users/@{body('Get_Organizer')?['id']}/onlineMeetings/@{first(body('Find_Meeting')?['value'])?['id']}/transcripts
```
Then **Newest Transcript** — *Compose*:
```
last(sort(coalesce(body('List_Transcripts')?['value'], createArray()), 'createdDateTime'))
```
Recurring meetings share one link, so the newest transcript is the one from the meeting that just ended.
Only accept it if it was created after the meeting started — **Is New** (*Compose*):
```
and(not(empty(outputs('Newest_Transcript'))), greater(ticks(outputs('Newest_Transcript')?['createdDateTime']), ticks(items('Each_Meeting')?['MeetingStart'])))
```

**3d. Condition — Got Transcript** — `outputs('Is_New')` is equal to `true`

*Yes:*
1. **Get Content** — *HTTP* `GET`
   ```
   https://graph.microsoft.com/v1.0/users/@{body('Get_Organizer')?['id']}/onlineMeetings/@{first(body('Find_Meeting')?['value'])?['id']}/transcripts/@{outputs('Newest_Transcript')?['id']}/content?$format=text/vtt
   ```
2. SharePoint *Update item* (Meetings, Id = `items('Each_Meeting')?['ID']`):
   Raw Notes = `string(body('Get_Content'))`, Processing Status = `New`, Transcript Last Checked = `utcNow()`
   → **Flow 1 starts automatically.** (The extraction prompt reads raw VTT. If you hit the prompt's size limit on
   long meetings, strip timestamp lines first or summarize in two passes.)

*No:*
1. **Attempts** — *Compose*: `add(int(coalesce(items('Each_Meeting')?['TranscriptAttempts'], 0)), 1)`
2. Condition `outputs('Attempts')` is greater than or equal to `12` (12 × 30 min ≈ 6 hours)
   - *Yes:* *Update item*: Processing Status `Error`, Transcript Attempts = `outputs('Attempts')`; then Outlook
     *Send an email (V2)* to `items('Each_Meeting')?['OrganizerEmail']`:
     "MinuteMate couldn't find a transcript for <meeting>. Was transcription on? You can paste notes into Raw Notes
     and set the status to New, or click Retry on the MinuteMate site."
   - *No:* *Update item*: Transcript Attempts = `outputs('Attempts')`, Transcript Last Checked = `utcNow()`

**3e. Catch** — a Scope after **Try**, run after *has failed*: *Update item* → Transcript Attempts + 1 and
Transcript Last Checked = `utcNow()` (the next sweep tries again; after 12 tries it becomes Error).

## Limits to know
- Channel meetings aren't supported for transcripts.
- The organizer must be in your tenant; external organizers' meetings can't be read.
- Each sweep makes about four Graph calls per waiting meeting.
