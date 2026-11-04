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
  meetingLookaheadDays: 14
};
