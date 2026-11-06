<#
.SYNOPSIS
  Creates the SharePoint lists used by MinuteMate (Phase 1 + 2).

.DESCRIPTION
  Run once per SharePoint site. Safe to re-run: existing lists and columns are skipped.
  Creates: Projects, Meetings, Artifacts, Action Items, Risks, Decisions, Status Updates,
  Milestones, Dependencies, Stakeholders, Kickoffs.

.REQUIREMENTS
  - PowerShell 7.4+
  - PnP.PowerShell module:  Install-Module PnP.PowerShell -Scope CurrentUser
  - An Entra ID app registration for PnP interactive sign-in (one-time, per tenant):
      Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP PowerShell" -Tenant <tenant>.onmicrosoft.com -Interactive
    Copy the Client ID it prints and pass it as -ClientId below.
  - Site Owner permission on the target site.

.EXAMPLE
  ./Setup-MinuteMate.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/ProjectHub" -ClientId "00000000-0000-0000-0000-000000000000"
#>
param(
    [Parameter(Mandatory = $true)] [string] $SiteUrl,
    [Parameter(Mandatory = $true)] [string] $ClientId
)

$ErrorActionPreference = "Stop"
Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive

# ---------- helpers ----------
function Ensure-List([string]$Title, [string]$Url) {
    $list = Get-PnPList -Identity "Lists/$Url" -ErrorAction SilentlyContinue
    if (-not $list) {
        Write-Host "Creating list: $Title" -ForegroundColor Cyan
        $list = New-PnPList -Title $Title -Url "Lists/$Url" -Template GenericList -OnQuickLaunch
    } else {
        Write-Host "List exists: $Title" -ForegroundColor DarkGray
    }
    return Get-PnPList -Identity "Lists/$Url"
}

function Field-Exists($List, [string]$InternalName) {
    return [bool](Get-PnPField -List $List -Identity $InternalName -ErrorAction SilentlyContinue)
}

function Add-XmlField($List, [string]$InternalName, [string]$Xml) {
    if (Field-Exists $List $InternalName) { return }
    Add-PnPFieldFromXml -List $List -FieldXml $Xml | Out-Null
    $f = Get-PnPField -List $List -Identity $InternalName
    $view = Get-PnPView -List $List -Includes ViewFields, DefaultView | Where-Object { $_.DefaultView } | Select-Object -First 1
    $fields = @($view.ViewFields) + $f.InternalName
    Set-PnPView -List $List -Identity $view.Id -Fields $fields | Out-Null
}

function New-Guid-Str { return ([guid]::NewGuid()).ToString() }

function Text($List, $Name, $Display, [switch]$Required) {
    $req = if ($Required) { 'TRUE' } else { 'FALSE' }
    Add-XmlField $List $Name "<Field Type='Text' ID='{$(New-Guid-Str)}' Name='$Name' StaticName='$Name' DisplayName='$Display' Required='$req' MaxLength='255' />"
}
function Note($List, $Name, $Display, [switch]$Rich) {
    $rich = if ($Rich) { "RichText='TRUE' RichTextMode='FullHtml'" } else { "RichText='FALSE'" }
    Add-XmlField $List $Name "<Field Type='Note' ID='{$(New-Guid-Str)}' Name='$Name' StaticName='$Name' DisplayName='$Display' NumLines='10' $rich />"
}
function Choice($List, $Name, $Display, [string[]]$Choices, [string]$Default) {
    $c = ($Choices | ForEach-Object { "<CHOICE>$_</CHOICE>" }) -join ''
    Add-XmlField $List $Name "<Field Type='Choice' ID='{$(New-Guid-Str)}' Name='$Name' StaticName='$Name' DisplayName='$Display' Format='Dropdown'><Default>$Default</Default><CHOICES>$c</CHOICES></Field>"
}
function DateF($List, $Name, $Display) {
    Add-XmlField $List $Name "<Field Type='DateTime' ID='{$(New-Guid-Str)}' Name='$Name' StaticName='$Name' DisplayName='$Display' Format='DateOnly' />"
}
function DateTimeF($List, $Name, $Display) {
    Add-XmlField $List $Name "<Field Type='DateTime' ID='{$(New-Guid-Str)}' Name='$Name' StaticName='$Name' DisplayName='$Display' Format='DateTime' />"
}
function NumberF($List, $Name, $Display) {
    Add-XmlField $List $Name "<Field Type='Number' ID='{$(New-Guid-Str)}' Name='$Name' StaticName='$Name' DisplayName='$Display' Decimals='0'><Default>0</Default></Field>"
}
function LookupMultiF($List, $Name, $Display, $TargetList) {
    Add-XmlField $List $Name "<Field Type='LookupMulti' Mult='TRUE' ID='{$(New-Guid-Str)}' Name='$Name' StaticName='$Name' DisplayName='$Display' List='{$($TargetList.Id)}' ShowField='Title' />"
}
function UserF($List, $Name, $Display, [switch]$Multi) {
    $t = if ($Multi) { "Type='UserMulti' Mult='TRUE'" } else { "Type='User'" }
    Add-XmlField $List $Name "<Field $t ID='{$(New-Guid-Str)}' Name='$Name' StaticName='$Name' DisplayName='$Display' UserSelectionMode='PeopleOnly' />"
}
function BoolF($List, $Name, $Display) {
    Add-XmlField $List $Name "<Field Type='Boolean' ID='{$(New-Guid-Str)}' Name='$Name' StaticName='$Name' DisplayName='$Display'><Default>0</Default></Field>"
}
function UrlF($List, $Name, $Display) {
    Add-XmlField $List $Name "<Field Type='URL' ID='{$(New-Guid-Str)}' Name='$Name' StaticName='$Name' DisplayName='$Display' Format='Hyperlink' />"
}
function LookupF($List, $Name, $Display, $TargetList) {
    Add-XmlField $List $Name "<Field Type='Lookup' ID='{$(New-Guid-Str)}' Name='$Name' StaticName='$Name' DisplayName='$Display' List='{$($TargetList.Id)}' ShowField='Title' />"
}

$notify = @('Teams', 'Outlook', 'Teams and Outlook')

# ---------- Projects ----------
$projects = Ensure-List "Projects" "Projects"
UserF  $projects "ProjectOwner" "Project Owner"
UserF  $projects "Approver" "Status Approver"
Text   $projects "ProjectOwnerEmail" "Project Owner Email"
Text   $projects "ApproverEmail" "Status Approver Email"
Choice $projects "DefaultNotifyVia" "Default Notify Via" $notify "Teams"
Choice $projects "OverallStatus" "Overall Status" @('On track', 'At risk', 'Off track') "On track"
BoolF  $projects "WeeklyStatusOn" "Weekly Status On"
Text   $projects "ProjectCode" "Project Code"
Text   $projects "AutoCaptureKeywords" "Auto-capture Keywords"
DateF  $projects "StartDate" "Start Date"
DateF  $projects "TargetDate" "Target Date"
# Phase 5: work tracker sync, privacy, impact
Choice $projects "WorkTracker" "Track Work In" @('None', 'Planner', 'Azure DevOps', 'GitHub') "None"
Text   $projects "TrackerTarget" "Tracker Target"
NumberF $projects "TranscriptRetentionDays" "Transcript Retention (days)"
BoolF  $projects "PostRecapToChat" "Post Recap to Meeting Chat"
BoolF  $projects "PostAgendaToChat" "Post Agenda Before Meeting"

# ---------- Meetings (intake: paste notes or the Teams recap here) ----------
$meetings = Ensure-List "Meetings" "Meetings"
LookupF $meetings "Project" "Project" $projects
DateF   $meetings "MeetingDate" "Meeting Date"
UserF   $meetings "Attendees" "Attendees" -Multi
Note    $meetings "RawNotes" "Raw Notes or Transcript"
Note    $meetings "Summary" "AI Summary" -Rich
Choice  $meetings "ProcessingStatus" "Processing Status" @('New', 'Waiting for transcript', 'Processing', 'Done', 'Needs review', 'Error') "New"
Choice  $meetings "CaptureMode" "Capture Mode" @('Pasted notes', 'Teams transcript') "Pasted notes"
DateTimeF $meetings "MeetingStart" "Meeting Start"
DateTimeF $meetings "MeetingEnd" "Meeting End"
Note    $meetings "JoinUrl" "Teams Join Link"
Text    $meetings "OrganizerEmail" "Organizer Email"
Text    $meetings "SeriesId" "Series Id"
NumberF $meetings "TranscriptAttempts" "Transcript Attempts"
DateTimeF $meetings "LastChecked" "Transcript Last Checked"
Text    $meetings "ChatId" "Teams Meeting Chat Id"
BoolF   $meetings "RecapPosted" "Recap Posted"
BoolF   $meetings "AgendaPosted" "Agenda Posted"
BoolF   $meetings "TranscriptPurged" "Transcript Purged"
UrlF    $meetings "NotesPage" "Meeting Notes Page"

# ---------- Artifacts (files and links added for risk and dependency assessment) ----------
$artifacts = Ensure-List "Artifacts" "Artifacts"
LookupF $artifacts "Project" "Project" $projects
Choice  $artifacts "ArtifactType" "Artifact Type" @('File', 'Link') "Link"
Note    $artifacts "LinkUrl" "Link"
Text    $artifacts "FileName" "File Name"
Note    $artifacts "Content" "Text or Notes"
Choice  $artifacts "AssessmentStatus" "Assessment Status" @('New', 'Assessing', 'Assessed', 'Needs review', 'Error') "New"
Note    $artifacts "AssessmentSummary" "Assessment Summary"
Text    $artifacts "AddedByEmail" "Added By Email"
DateTimeF $artifacts "LastAssessed" "Last Assessed"

# ---------- Action Items ----------
$actions = Ensure-List "Action Items" "ActionItems"
LookupF $actions "Project" "Project" $projects
LookupF $actions "SourceMeeting" "Source Meeting" $meetings
UserF   $actions "Owner" "Owner"
Text    $actions "OwnerAsWritten" "Owner (as written in notes)"
Text    $actions "OwnerEmail" "Owner Email"
Choice  $actions "Source" "Source" @('Meeting', 'Manual') "Manual"
DateF   $actions "ClosedDate" "Closed Date"
Text    $actions "ExternalId" "Tracker Item Id"
UrlF    $actions "ExternalLink" "Tracker Item"
Choice  $actions "SyncState" "Sync State" @('Not synced', 'Synced', 'Error') "Not synced"
NumberF $actions "SeenInMeetings" "Seen in Meetings"
DateF   $actions "DueDate" "Due Date"
Choice  $actions "ItemStatus" "Status" @('Not started', 'In progress', 'Blocked', 'Done') "Not started"
Choice  $actions "Priority" "Priority" @('High', 'Medium', 'Low') "Medium"
Choice  $actions "NotifyVia" "Notify Via" (@('Project default') + $notify) "Project default"
BoolF   $actions "Notified" "Notified"
Note    $actions "Details" "Details"

# ---------- Risks ----------
$risks = Ensure-List "Risks" "Risks"
LookupF $risks "Project" "Project" $projects
LookupF $risks "SourceMeeting" "Source Meeting" $meetings
Choice  $risks "Impact" "Impact" @('High', 'Medium', 'Low') "Medium"
Choice  $risks "Likelihood" "Likelihood" @('High', 'Medium', 'Low') "Medium"
Note    $risks "Mitigation" "Mitigation"
UserF   $risks "Owner" "Owner"
Choice  $risks "RiskStatus" "Status" @('Open', 'Mitigating', 'Closed') "Open"
LookupF $risks "SourceArtifact" "Source Artifact" $artifacts

# ---------- Decisions ----------
$decisions = Ensure-List "Decisions" "Decisions"
LookupF $decisions "Project" "Project" $projects
LookupF $decisions "SourceMeeting" "Source Meeting" $meetings
DateF   $decisions "DecisionDate" "Decision Date"
Text    $decisions "DecidedBy" "Decided By"
Note    $decisions "Rationale" "Rationale"

# ---------- Status Updates ----------
$status = Ensure-List "Status Updates" "StatusUpdates"
LookupF $status "Project" "Project" $projects
DateF   $status "WeekOf" "Week Of"
Choice  $status "OverallStatus" "Overall Status" @('On track', 'At risk', 'Off track') "On track"
UrlF    $status "DraftPage" "Draft Page"
Choice  $status "ApprovalStatus" "Approval Status" @('Pending', 'Approved', 'Rejected', 'Published') "Pending"
Note    $status "ReviewerComments" "Reviewer Comments"
UrlF    $status "PublishedPage" "Published News Post"

# ---------- Milestones (Phase 4: timeline and dependencies) ----------
$milestones = Ensure-List "Milestones" "Milestones"
LookupF $milestones "Project" "Project" $projects
Text    $milestones "Workstream" "Workstream"
DateF   $milestones "StartDate" "Start Date"
DateF   $milestones "DueDate" "Due Date"
Choice  $milestones "MilestoneStatus" "Status" @('Not started', 'In progress', 'Blocked', 'Done') "Not started"
Text    $milestones "OwnerEmail" "Owner Email"
BoolF   $milestones "IsGate" "Gate"
LookupMultiF $milestones "DependsOn" "Depends On" $milestones
BoolF   $milestones "SlipNotified" "Slip Notified"

# ---------- Dependencies (what the project waits on, found in meetings and artifacts) ----------
$dependencies = Ensure-List "Dependencies" "Dependencies"
LookupF $dependencies "Project" "Project" $projects
LookupF $dependencies "SourceMeeting" "Source Meeting" $meetings
LookupF $dependencies "SourceArtifact" "Source Artifact" $artifacts
Choice  $dependencies "DependencyType" "Type" @('Team', 'Vendor', 'System', 'Approval', 'Decision', 'Data') "Team"
Text    $dependencies "ProvidedBy" "Provided By"
Text    $dependencies "OwnerEmail" "Owner Email"
DateF   $dependencies "NeededBy" "Needed By"
Choice  $dependencies "DependencyStatus" "Status" @('Open', 'At risk', 'Blocked', 'Resolved') "Open"
Choice  $dependencies "Impact" "Impact" @('High', 'Medium', 'Low') "Medium"
LookupF $dependencies "RelatedMilestone" "Related Milestone" $milestones
Note    $dependencies "Details" "Details"

# ---------- Stakeholders (Phase 4: kickoff kit) ----------
$stakeholders = Ensure-List "Stakeholders" "Stakeholders"
LookupF $stakeholders "Project" "Project" $projects
Text    $stakeholders "Email" "Email"
Text    $stakeholders "Role" "Role"
Choice  $stakeholders "RACI" "RACI" @('Responsible', 'Accountable', 'Consulted', 'Informed') "Informed"
Choice  $stakeholders "Influence" "Influence" @('High', 'Medium', 'Low') "Medium"

# ---------- Kickoffs (Phase 4: kickoff kit → AI charter page) ----------
$kickoffs = Ensure-List "Kickoffs" "Kickoffs"
LookupF $kickoffs "Project" "Project" $projects
Note    $kickoffs "Goal" "Goal"
Note    $kickoffs "Scope" "In Scope"
Note    $kickoffs "OutOfScope" "Out of Scope"
Note    $kickoffs "SuccessMetrics" "Success Metrics"
Note    $kickoffs "Constraints" "Constraints and Assumptions"
Choice  $kickoffs "KickoffStatus" "Status" @('Draft requested', 'Generating', 'Ready', 'Error') "Draft requested"
UrlF    $kickoffs "CharterPage" "Charter Page"

Write-Host "`nDone. Lists are ready on $SiteUrl" -ForegroundColor Green
Write-Host "Next: add one item to 'Projects', then build the flows in /flows." -ForegroundColor Green
