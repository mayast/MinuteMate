# Flow 11 — Delete old transcripts (Phase 5.7)

**What it does:** once a day, MinuteMate clears the raw transcript from meetings older than the project's retention
period (Settings → *Keep transcripts for (days)*, default 30). The AI summary, notes page, action items, risks and
decisions are kept; only the raw transcript text is removed. See `docs/privacy.md`.

- **Type:** Scheduled cloud flow, daily at 2:00 AM local time · **Name:** `MinuteMate 11 - Transcript retention`
- **Connectors:** SharePoint

## Steps
1. **Get Projects** — SharePoint *Get items* (Projects).
2. *Apply to each* project:
   - **Cutoff** — *Compose*: `addDays(utcNow(), mul(-1, int(coalesce(items('Apply_to_each')?['TranscriptRetentionDays'], 30))))`
   - **Old Meetings** — *Get items* (Meetings):
     `ProjectId eq <project id> and TranscriptPurged ne 1 and MeetingStart lt '@{outputs('Cutoff')}' and (ProcessingStatus eq 'Done' or ProcessingStatus eq 'Needs review' or ProcessingStatus eq 'Error')`
   - *Apply to each* meeting → *Update item*: Raw Notes = empty, Transcript Purged = Yes.
3. **Version history:** SharePoint keeps earlier versions of list items. If your retention promise must cover them,
   lower versioning on the Meetings list (List settings → Versioning settings) or delete old versions with a
   site admin's retention policy. Agree on this with your compliance team.
