# Prompt 2 — Draft the weekly status update

- **Name:** `PMA - Weekly status draft`
- **Output:** **JSON** (format sample below)
- **Inputs (text):** `ProjectName`, `WeekOf`, `MeetingSummaries`, `OpenActions`, `OverdueActions`,
  `CompletedActions`, `OpenRisks`, `NewDecisions`

The flow fills each input with a short text list built from the SharePoint lists (see `flows/02-weekly-status.md`).

## Prompt text

```
You write the weekly status update for a project. Readers are senior leaders and partner teams.
Be specific, short and factual. Use only the information provided. Never invent progress.

Project: {{ProjectName}}
Week of: {{WeekOf}}

Meeting summaries this week:
{{MeetingSummaries}}

Completed action items this week:
{{CompletedActions}}

Open action items:
{{OpenActions}}

Overdue action items:
{{OverdueActions}}

Open risks:
{{OpenRisks}}

Decisions made this week:
{{NewDecisions}}

Return JSON only, matching the format sample.

Rules:
- overall_status: "On track", "At risk" or "Off track".
  Off track if any High-impact risk is unmitigated or 3+ High-priority items are overdue.
  At risk if any High-impact risk is open or any High-priority item is overdue.
  Otherwise On track.
- status_reason: one sentence explaining the status.
- headline: one sentence, the single most important thing this week.
- highlights: up to 5 completed outcomes, each one line.
- risks: up to 5, highest impact first; include the mitigation in the same line.
- decisions: each decision in one line.
- asks: specific help or decisions needed from leaders, each with who it is for if known.
- next_steps: up to 5 items planned for next week, with owner and date when known.
- Use empty arrays when there is nothing for a section.
```

## Format sample

```json
{
  "overall_status": "At risk",
  "status_reason": "Vendor API delay threatens the June 12 launch.",
  "headline": "Beta scope is locked; launch moved to June 12 pending vendor API.",
  "highlights": ["Beta scope signed off by product and engineering"],
  "risks": ["Vendor API may slip again (High). Mitigation: weekly vendor check-in, manual-import fallback."],
  "decisions": ["Launch moved from June 5 to June 12."],
  "asks": ["Procurement: confirm vendor penalty clause by May 30."],
  "next_steps": ["Priya: send revised timeline to stakeholders by May 29."]
}
```

The flow turns this JSON into the News post using `templates/status-page-template.html`,
so formatting stays consistent and the reviewer only checks the content.
