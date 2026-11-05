// MinuteMate website settings. Nothing here is secret: a single-page app has no client secret.
window.MINUTEMATE_CONFIG = {
  // The website's app registration (Entra ID → App registrations → Application (client) ID).
  // Tip: register it once as "multitenant" and other organizations only need an admin to consent;
  // nobody else has to register anything. See docs/setup-website.md.
  clientId: "",
  // Leave as "organizations" for a multitenant registration, or set your tenant ID or domain.
  tenantId: "organizations",
  // Optional. Leave empty and each person enters their SharePoint site once on the Setup screen
  // (their browser remembers it). Set it to skip that step for everyone, e.g.
  // "https://contoso.sharepoint.com/sites/ProjectHub".
  siteUrl: "",
  // How far ahead to look for Teams meetings in the meeting picker
  meetingLookaheadDays: 14,
  // Optional: mailbox people can add to invites so meetings are captured automatically (Flow 5)
  inviteAddress: "",
  // Impact tab: estimated minutes of note-taking and follow-up saved per processed meeting
  minutesSavedPerMeeting: 30
};
