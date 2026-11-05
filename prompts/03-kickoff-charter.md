# Prompt 3 — Draft the project charter from the kickoff kit

- **Name:** `MinuteMate - Kickoff charter`
- **Output:** **JSON** (format sample below)
- **Inputs (text):** `ProjectName`, `Goal`, `Scope`, `OutOfScope`, `SuccessMetrics`, `Constraints`,
  `StartDate`, `TargetDate`, `Stakeholders`, `Milestones`

## Prompt text

```
You draft a one-page project charter for senior leaders and the project team.
Use only the information provided. Where something important is missing, say so in open_questions
instead of inventing it. Plain, specific language; no buzzwords.

Project: {{ProjectName}}
Goal: {{Goal}}
In scope: {{Scope}}
Out of scope: {{OutOfScope}}
Success metrics: {{SuccessMetrics}}
Constraints and assumptions: {{Constraints}}
Dates: {{StartDate}} to {{TargetDate}}
Stakeholders (name, role, RACI): {{Stakeholders}}
Milestones (title, workstream, start, due, depends on): {{Milestones}}

Return JSON only, matching the format sample.

Rules:
- purpose: 2-3 sentences: the problem, who it affects, and what changes when the project succeeds.
- objectives: 3-5 measurable objectives drawn from the goal and success metrics.
- scope_in / scope_out: short bullets; rephrase the user's text, don't add new scope.
- deliverables: the main outputs implied by the milestones.
- risks: 3-5 early risks you can see from the dates, dependencies, scope or constraints
  (for example a tight gap between dependent milestones), each with a first mitigation.
- governance: who is accountable, who approves status, and the meeting rhythm
  ("Weekly status drafted Fridays and approved by <approver>" if an approver is given).
- open_questions: what the team must answer in the kickoff meeting.
- Use empty arrays when there is nothing for a section.
```

## Format sample

```json
{
  "purpose": "Support agents spend too long triaging tickets. This pilot tests an AI assistant that routes and summarizes tickets so agents can start solving sooner.",
  "objectives": ["Cut median triage time by 50% for pilot queues", "Keep routing accuracy at or above 95%"],
  "scope_in": ["Two English support queues", "Ticket summary and routing suggestions"],
  "scope_out": ["Automatic replies to customers", "Non-English queues"],
  "deliverables": ["Baseline metrics report", "Pilot assistant in two queues", "Scale-or-stop recommendation"],
  "risks": ["Baseline data may be incomplete. Mitigation: agree on the metric definition in week 1."],
  "governance": "Dana Lee is accountable. Weekly status is drafted Fridays and approved by Dana Lee. Scale-or-stop review on Jan 3.",
  "open_questions": ["Which two queues join the pilot?"]
}
```
