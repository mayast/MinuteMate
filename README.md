# MinuteMate

**Meetings that spark joy, not more work.**

MinuteMate turns Teams meetings into action items, risks, decisions, a live timeline and a weekly status update
that a person approves before it's published. It runs entirely inside Microsoft 365 (SharePoint, Teams, Outlook,
Power Automate), so there's no server to run and your data stays in your tenant.

**[Try the demo →](https://mayast.github.io/MinuteMate/?demo=1)** (sample data, no sign-in)

## What you get

- **Capture:** pick the Teams meetings to capture, or invite MinuteMate to the meeting. Pasting notes works too.
- **Follow-through:** AI logs action items, risks and decisions; owners get a Teams card they can update; the recap
  lands in the meeting chat, and an agenda arrives before the next one.
- **Risks and dependencies:** upload a file, add a link or paste meeting notes, and MinuteMate logs the risks
  and dependencies it finds, linked back to the source. One tab ranks what needs attention; the Overview links
  straight to each item.
- **Planning:** a kickoff kit (charter, RACI, milestone plan), a timeline that flags dependency conflicts, and one
  tracker for everything. Action items can also go to Planner, Azure DevOps or GitHub.
- **Reporting:** a weekly status draft, approved by a person, published as a SharePoint News post. The Impact tab
  shows what MinuteMate saved.

## Set it up

Pick the level you need. Each one builds on the one before.

| | What you do | Time | Who |
|---|---|---|---|
| **1. Starter** | Import the package, run *Set up MinuteMate* | ~20 min | Anyone who owns a SharePoint site |
| **2. Website** | Open the website, paste your site address | ~5 min | Each person, once |
| **3. Automatic capture** | Send IT a one-page request | IT's time | Your Microsoft 365 admin |

### 1. Starter (about 20 minutes, no admin needed)

You need a SharePoint site you own and Power Automate with AI Builder (most Microsoft 365 business plans).

1. **Import the package.** Download the latest `MinuteMate_managed.zip` from
   [Releases](https://github.com/mayast/MinuteMate/releases). In [Power Automate](https://make.powerautomate.com),
   go to **Solutions → Import solution**, choose the file, sign in to each connection when asked, and enter your
   SharePoint site address.
2. **Create the lists.** In **My flows**, open **MinuteMate 0 - Set up MinuteMate**, click **Run**, and paste your
   site address. It finishes in 2–4 minutes.
3. **Try it.** Open the **Meetings** list on your site, add a meeting, and paste your notes (or the Teams recap)
   into *Raw Notes*. A minute later the summary, action items, risks and decisions appear, and owners get a Teams
   message.

That's the core: notes → tracked follow-ups → weekly status with approval, using standard connectors only.

> The package isn't published yet? Build the flows from the guides in [`flows/`](flows/) instead, starting with
> Flow 0, then Flows 1–3. See [docs/install.md](docs/install.md).

### 2. Website (about 5 minutes)

1. Open **[mayast.github.io/MinuteMate](https://mayast.github.io/MinuteMate/)** and sign in with your work account.
   (The first time, your organization may ask an admin to approve the app. That's one click for them.)
2. Paste your SharePoint site address. The **Setup** tab checks every list and column and tells you exactly what's
   missing, if anything.
3. Click **Kick off a project**, or open **Meetings** to choose meetings to capture.

Running your own copy of the website? See [docs/setup-website.md](docs/setup-website.md).

### 3. Automatic capture from Teams (needs your IT admin)

Reading Teams transcripts automatically needs one-time approval from your Microsoft 365 admin and a Power Automate
Premium license. Send your admin [docs/it-request.md](docs/it-request.md): one page with exactly what to approve
and why. Until then, pasting the Teams recap into a meeting works.

## Good to know

- **Privacy:** add **[no-capture]** to any meeting title to skip it. Raw transcripts are deleted after 30 days
  (you can change this per project). See [docs/privacy.md](docs/privacy.md).
- **People stay in charge:** the AI drafts; status updates publish only after approval.
- **Upgrading:** import the new package, then run *Set up MinuteMate* again. It only adds what's new.

## For builders

| Folder | What's inside |
|---|---|
| [`web/`](web/) | The website (plain HTML and JavaScript, no build step). Demo with `?demo=1` |
| [`flows/`](flows/) | Step-by-step guides for Flows 0–12, if you want to build or customize them |
| [`prompts/`](prompts/) | The four AI Builder prompts |
| [`provisioning/`](provisioning/) | `lists.json` (list definitions) and a PowerShell alternative to Flow 0 |
| [`eval/`](eval/) | AI quality tests: `node eval/score.mjs` |
| [`templates/`](templates/) | Teams cards, email, and page templates |
| [`teams-app/`](teams-app/) | A Teams app that opens the website as a tab |
| [`docs/`](docs/) | Architecture, install and packaging, privacy, IT request, roadmap |

When you change a list column, edit `provisioning/Setup-MinuteMate.ps1`, then run
`python3 scripts/gen_lists.py provisioning/Setup-MinuteMate.ps1 provisioning/lists.json` to update the setup flow's
definitions and the website's Setup check.
