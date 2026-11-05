# Privacy and consent (Phase 5.7)

MinuteMate reads meeting transcripts, so people should know when it's listening, be able to say no, and trust that
raw transcripts don't live forever. Agree on these settings with your privacy or compliance team before rollout.

## What MinuteMate stores, where, and for how long
| Data | Where | Kept |
|---|---|---|
| Raw transcript or pasted notes | Meetings list → Raw Notes | Until the project's retention period ends (default **30 days**), then deleted by Flow 11 |
| AI summary, meeting notes page | Meetings list, SharePoint page | Like any project document |
| Action items, risks, decisions, milestones | SharePoint lists (and your work tracker, if synced) | Like any project record |
| Status updates | SharePoint News posts | Like any News post |

Everything stays in your Microsoft 365 tenant (SharePoint, Teams, Outlook, Power Automate, AI Builder), under the
site's existing permissions. Nothing is sent to a third-party service. The website stores nothing on a server: it
reads and writes the lists as the signed-in person.

## Telling attendees
Add this line to captured meeting invites (organizers can paste it, or Flow 5 can reply-all with it once):

> MinuteMate will use this meeting's transcript to log action items, risks and decisions for <project>. The raw
> transcript is deleted after <N> days. Prefer not to be captured? Ask the organizer, or add [no-capture] to the
> meeting title.

When Flow 9 posts a recap to the meeting chat, it ends with "reply here if anything is wrong", so attendees can
correct the record.

## Opting out
- **Per meeting:** put **[no-capture]** anywhere in the title. The website won't capture it (it shows *Opted out*),
  Flow 5 ignores invites with it, and Flow 4 skips it even if it was captured before the rename.
- **Sensitive meetings:** if your tenant uses sensitivity labels on meetings, also filter on the label in Flows 4
  and 5 (for example, skip anything labeled *Highly Confidential*).
- **Per person:** keep a short "do not capture" list in SharePoint and check organizer emails against it in Flow 5.

## Retention
Set **Keep transcripts for (days)** per project on the Settings tab. Flow 11 clears Raw Notes after that and marks
the meeting *Transcript Purged*. SharePoint item version history may still hold old text; see Flow 11 for options.

## Responsible AI checks built in
- The AI drafts; people decide. Status updates are published only after approval, and uncertain meetings are marked
  *Needs review*.
- Owners are resolved, not guessed. Ambiguous names go to the project owner to reassign.
- Extraction quality is measured with the test set in `eval/`, and re-checked after any prompt or model change.
