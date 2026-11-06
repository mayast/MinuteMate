# Prompt 4 — Assess an artifact for risks and dependencies

Used by Flow 12 when someone adds a file or a link on the website's **Risks & dependencies** tab.
(Meeting notes added on that tab go through Prompt 1, which also returns dependencies.)

Create this in **Power Automate → AI hub → Prompts → Build your own prompt** (or Copilot Studio → Prompts).

- **Name:** `MinuteMate - Assess artifact`
- **Output:** **JSON**. Paste the format sample below as the sample.
- **Inputs (text):** `ProjectName`, `ArtifactTitle`, `ArtifactText`, `Milestones`, `OpenItems`
  - `ArtifactText`: the notes the person typed plus the document's text (Flow 12 fills this in).
  - `Milestones`: one line per milestone: `id | title | start | due | status`.
  - `OpenItems`: one line per open risk or dependency: `R-id | title` or `D-id | title`, so the AI updates a match
    instead of creating a duplicate.
- **Optional document input:** if your prompt builder offers a *Document* (file) input, add `ArtifactFile` and
  let Flow 12 pass PDF or image files to it directly.

## Prompt text

```
You help a project manager spot what could delay their project. Read the document below and find:
1. DEPENDENCIES: things this project is waiting on from someone else (another team, a vendor, a system,
   an approval, a decision or data) before it can move forward.
2. RISKS: things that could delay, block or harm the project.
Only report what the document clearly says or directly implies. Do not invent owners, dates or teams.

Project: {{ProjectName}}
Document: {{ArtifactTitle}}

Project milestones (id | title | start | due | status):
{{Milestones}}

Risks and dependencies already logged (R-id or D-id | title):
{{OpenItems}}

Document text:
"""
{{ArtifactText}}
"""

Return JSON only, matching the format sample exactly.

Rules:
- summary: 1-3 plain sentences: what the document means for the schedule.
- dependencies:
  - title: what we are waiting on, as a short noun phrase ("Sandbox access from the vendor").
  - type: Team, Vendor, System, Approval, Decision or Data.
  - provided_by: the team, company or person who must deliver it; "" if not stated.
  - needed_by: YYYY-MM-DD only if a date or clear deadline is stated; otherwise "".
  - status: Blocked if the document says work is blocked or stopped; At risk if it says the item is late,
    uncertain or has no firm date; otherwise Open.
  - impact: High, Medium or Low. High if it holds up a launch, a gate or several milestones.
  - milestone_id: the id of the milestone it holds up, from the list above; "" if none clearly matches.
  - source_quote: the shortest phrase from the document that supports it.
  - matches_existing_id: the D-id of the same dependency in the logged list (without "D-"), or "".
- risks:
  - title, impact (High/Medium/Low), likelihood (High/Medium/Low; Medium if unclear),
    mitigation ("" if none is stated), source_quote, matches_existing_id (R-id without "R-", or "").
- needs_review: true if the text is too short, unreadable, or you were unsure about any item.
Use empty arrays when there is nothing for a section. At most 10 dependencies and 10 risks.
```

## Format sample

```json
{
  "summary": "Integration can't start until the vendor opens sandbox access and procurement signs the change order.",
  "dependencies": [
    {
      "title": "Change order signed by procurement",
      "type": "Approval",
      "provided_by": "Procurement",
      "needed_by": "2026-11-05",
      "status": "Blocked",
      "impact": "High",
      "milestone_id": "62",
      "source_quote": "work beyond the pilot requires a signed change order",
      "matches_existing_id": ""
    }
  ],
  "risks": [
    {
      "title": "Unsigned change order could stall vendor integration",
      "impact": "High",
      "likelihood": "Medium",
      "mitigation": "Escalate to the procurement lead",
      "source_quote": "pending procurement review",
      "matches_existing_id": ""
    }
  ],
  "needs_review": false
}
```

## Tips

- Test with a real statement of work, plan or checklist from your project before wiring it into the flow.
- Long documents: AI Builder prompts have an input size limit. Flow 12 sends the first 60,000 characters; ask
  people to add a short note about the part that matters for big files.
- Each run uses AI Builder credits.
