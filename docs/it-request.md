# Request for IT: approve automatic meeting capture for MinuteMate

**From:** <your name, team> · **Site:** <SharePoint site address>

## What we're asking for
Our team uses MinuteMate, a set of Power Automate flows and SharePoint lists in our Microsoft 365 tenant, to turn
meeting notes into tracked action items and weekly status updates. Today we paste notes in by hand. We'd like it to
read the **Teams transcript** of meetings we choose, automatically, after each meeting ends.

Nothing leaves our tenant. There's no external service and no server.

## What we need you to approve (about 30 minutes)
1. **Allow apps to read meeting transcripts** through Microsoft Graph (Teams admin setting for Graph access to
   meeting transcripts). Without it, requests fail with `GraphAccessToTranscriptsDisabled`.
2. **One app registration** named `MinuteMate Backend` with these Microsoft Graph **application** permissions, and
   admin consent:
   | Permission | Why |
   |---|---|
   | `OnlineMeetings.Read.All` | Find a meeting from its Teams link |
   | `OnlineMeetingTranscript.Read.All` | Read that meeting's transcript |
   | `User.Read.All` | Look up the meeting organizer |
   A client secret stored in Azure Key Vault (or a Power Platform environment variable of type Secret).
3. **An application access policy** that lets this app read online meetings, scoped to the organizers who use
   MinuteMate (or the whole tenant, if you prefer):
   ```powershell
   New-CsApplicationAccessPolicy -Identity MinuteMate-Policy -AppIds "<client id>" -Description "MinuteMate"
   Grant-CsApplicationAccessPolicy -PolicyName MinuteMate-Policy -Identity <organizer@contoso.com>
   ```
4. **One Power Automate Premium license** for the account that runs the capture flow (the HTTP action is premium).
5. Optional: **a mailbox `minutemate@<domain>`** so people can capture a meeting by inviting it.

## Safeguards already built in
- Only meetings someone explicitly turns on, or invites MinuteMate to, are captured. Titles with **[no-capture]**
  are always skipped.
- Raw transcripts are deleted after a set number of days (default 30); summaries and action items are kept.
- AI output is reviewed by people; status updates are published only after a named approver says yes.
- Details: `docs/privacy.md` and `flows/04-capture-teams-transcript.md` in github.com/mayast/MinuteMate.

Please check the current Microsoft Learn pages for these settings before applying them; Microsoft updates these
APIs from time to time.
