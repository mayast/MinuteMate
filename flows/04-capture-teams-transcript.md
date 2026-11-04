# Flow 4 — Capture the Teams transcript automatically

**What it does:** when a meeting is added from the MinuteMate website (Capture Mode = *Teams transcript*),
the flow waits until the meeting ends, finds the meeting from its Teams link, downloads the transcript,
puts it in **Raw Notes**, and sets the status to **New**. Flow 1 then takes over as usual.

- **Type:** Automated cloud flow · **Name:** `MinuteMate 4 - Capture Teams transcript`
- **License:** Power Automate **Premium** (the *HTTP* action is premium)
- **Connectors:** SharePoint, HTTP

## One-time admin setup (needs your Microsoft 365 admins)

1. **Turn on Graph access to transcripts.** A Teams admin must allow apps to read meeting transcripts.
   Without it, calls fail with `403 GraphAccessToTranscriptsDisabled`.
2. **App registration for the back end** (separate from the website's registration):
   - Entra ID → App registrations → New → name `MinuteMate Backend`
   - API permissions → Microsoft Graph → **Application** permissions:
     `OnlineMeetings.Read.All` (find the meeting from its link) and `OnlineMeetingTranscript.Read.All`
     (read the transcript) → **Grant admin consent**
   - Certificates & secrets → new client secret. Store it in an **environment variable of type Secret**
     (backed by Azure Key Vault) or at least mark the HTTP action's inputs/outputs as **Secure**.
3. **Application access policy for online meetings.** Teams admins usually have to allow the app to read
   meetings for the organizers it serves (PowerShell, Teams module):
   ```powershell
   New-CsApplicationAccessPolicy -Identity MinuteMate-Policy -AppIds "<backend client id>" -Description "MinuteMate"
   Grant-CsApplicationAccessPolicy -PolicyName MinuteMate-Policy -Global
   ```
   Scope it to specific users instead of `-Global` if your admins prefer.
4. **Transcription must be on** in each meeting (the organizer starts it, or a Teams meeting policy turns it
   on automatically). No transcript, nothing to capture.

> Verify each permission name and the policy step against Microsoft Learn for your tenant before you start.
> Microsoft changes these APIs from time to time.

## Steps

### 1. Trigger — SharePoint *When an item is created* (Meetings)
Trigger conditions:
```
@equals(triggerOutputs()?['body/CaptureMode/Value'], 'Teams transcript')
@equals(triggerOutputs()?['body/ProcessingStatus/Value'], 'Waiting for transcript')
```

### 2. **Wait Until End** — *Delay until*
`addMinutes(triggerOutputs()?['body/MeetingEnd'], 15)`
(Flows can wait up to 30 days, so meetings scheduled well ahead are fine.)

### 3. **Get Organizer** — *HTTP*
- Method `GET` · URI `https://graph.microsoft.com/v1.0/users/@{triggerOutputs()?['body/OrganizerEmail']}?$select=id`
- Authentication: **Active Directory OAuth** · Authority `https://login.microsoftonline.com` ·
  Tenant `<tenant id>` · Audience `https://graph.microsoft.com` · Client ID / Secret from the backend app

Use the same Authentication settings on every HTTP action below.

### 4. **Find Meeting** — *HTTP*
- Method `GET`
- URI:
  ```
  https://graph.microsoft.com/v1.0/users/@{body('Get_Organizer')?['id']}/onlineMeetings?$filter=JoinWebUrl eq '@{encodeUriComponent(triggerOutputs()?['body/JoinUrl'])}'
  ```
**Meeting Id** — *Compose*: `first(body('Find_Meeting')?['value'])?['id']`

### 5. **Wait For Transcript** — *Do until* `not(empty(variables('TranscriptId')))` (limit: 12 runs)
Initialize a string variable `TranscriptId` before the loop. Inside the loop:
- **List Transcripts** — *HTTP* `GET`
  `https://graph.microsoft.com/v1.0/users/@{body('Get_Organizer')?['id']}/onlineMeetings/@{outputs('Meeting_Id')}/transcripts`
- *Set variable* `TranscriptId` = `coalesce(last(body('List_Transcripts')?['value'])?['id'], '')`
- If still empty: *Delay* 15 minutes

Transcripts can take a while to appear after a meeting ends; 12 × 15 minutes covers about 3 hours.

### 6. Condition **Got Transcript** — `empty(variables('TranscriptId'))` is equal to `false`

**Yes:**
1. **Get Content** — *HTTP* `GET`
   `https://graph.microsoft.com/v1.0/users/@{body('Get_Organizer')?['id']}/onlineMeetings/@{outputs('Meeting_Id')}/transcripts/@{variables('TranscriptId')}/content?$format=text/vtt`
2. **Clean Text** — *Compose* (keeps speaker lines, drops cue numbers and timestamps):
   ```
   join(xpath(xml(concat('<r><l>', replace(replace(replace(string(body('Get_Content')), '&', '&amp;'), '<', '&lt;'), decodeUriComponent('%0A'), '</l><l>'), '</l></r>')), '//l[not(contains(., ''-->'')) and string-length(normalize-space(.)) > 0 and not(starts-with(., ''WEBVTT''))]/text()'), decodeUriComponent('%0A'))
   ```
   If this expression is hard to maintain, skip it: the extraction prompt handles raw VTT, it just uses more
   of the prompt's input size.
3. SharePoint *Update item* (Meetings): Raw Notes = `outputs('Clean_Text')`, Processing Status = `New`
   → **Flow 1 starts automatically.**

**No:** SharePoint *Update item* (Meetings): Processing Status = `Error`, and email the organizer:
"No transcript was found for <meeting>. Was transcription turned on? You can paste notes into Raw Notes and set
the status to New."

## Limits to know
- Only meetings scheduled in Teams with a join link work; **channel meetings aren't supported** for transcripts.
- Recurring meetings share one join link: the flow takes the **latest** transcript, which is the one just held.
- Long meetings may exceed the AI prompt's input size. Trim, or summarize in two passes.
