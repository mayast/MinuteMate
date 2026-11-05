// MinuteMate website settings. Fill these in after you register the app (see docs/setup-website.md).
// Nothing here is secret: a single-page app has no client secret, so this file is safe to publish.
window.MINUTEMATE_CONFIG = {
  // Entra ID app registration → Overview → Application (client) ID
  clientId: "",
  // Entra ID → Overview → Directory (tenant) ID, or your domain, e.g. "contoso.onmicrosoft.com"
  tenantId: "",
  // The SharePoint site that holds the MinuteMate lists
  siteHostname: "contoso.sharepoint.com",
  sitePath: "/sites/ProjectHub",
  // How far ahead to look for Teams meetings in the meeting picker
  meetingLookaheadDays: 14,
  // Optional: mailbox people can add to invites so meetings are captured automatically (Flow 5), e.g. "minutemate@contoso.com"
  inviteAddress: "",
  // Impact tab: estimated minutes of note-taking and follow-up saved per processed meeting
  minutesSavedPerMeeting: 30
};
