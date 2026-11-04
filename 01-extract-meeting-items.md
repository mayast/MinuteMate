# Prompt 1 — Extract meeting summary, action items, risks and decisions

Create this in **Power Automate → AI hub → Prompts → Build your own prompt** (or Copilot Studio → Prompts).

- **Name:** `PMA - Extract meeting items`
- **Output:** set the prompt output to **JSON** and paste the example output below as the format sample.
- **Inputs (text):** `MeetingTitle`, `MeetingDate`, `Attendees`, `ProjectName`, `Notes`

## Prompt text

Copy everything inside the block. In the prompt builder, replace each `{{Name}}` with the matching input chip.

```
You are an assistant for a project manager. Read the meeting notes or transcript below and
extract only what is clearly stated. Do not invent owners, dates or decisions.

Project: {{ProjectName}}
Meeting: {{MeetingTitle}} on {{MeetingDate}}
Attendees: {{Attendees}}

Notes or transcript:
"""
{{Notes}}
"""

Return JSON only, matching the format sample exactly.

Rules:
- summary: 3-5 plain sentences a busy executive can read in 20 seconds.
- key_points: up to 6 short bullets.
- action_items: a concrete task someone agreed to do.
  - owner_name: the person's name as written; "" if no owner was stated.
  - owner_email: only if an email address appears in the notes or attendee list; otherwise "".
  - due_date: YYYY-MM-DD only if a date or clear deadline was stated (resolve "Friday" etc. relative
    to the meeting date); otherwise "".
  - priority: High, Medium or Low. Use Medium if unclear.
  - source_quote: the shortest phrase from the notes that supports the item.
- risks: something that could delay, block or harm the project.
  - impact and likelihood: High, Medium or Low. Use Medium if unclear.
  - mitigation: what was proposed, or "" if nothing was proposed.
- decisions: something the group agreed or approved. Not proposals or open questions.
- open_questions: questions raised but not answered.
- needs_review: true if the notes are too short, unclear, or you were unsure about any item.
Use empty arrays when there is nothing for a section.
```

## Format sample (paste into the JSON output settings)

```json
{
  "summary": "Team confirmed the beta scope and moved launch to June 12 due to a vendor delay.",
  "key_points": ["Beta scope confirmed", "Launch moved to June 12"],
  "action_items": [
    {
      "title": "Send revised timeline to stakeholders",
      "owner_name": "Priya Patel",
      "owner_email": "",
      "due_date": "2026-05-29",
      "priority": "High",
      "details": "Include the new launch date and the vendor dependency.",
      "source_quote": "Priya will send the updated timeline by Friday"
    }
  ],
  "risks": [
    {
      "title": "Vendor API delivery may slip again",
      "impact": "High",
      "likelihood": "Medium",
      "mitigation": "Weekly check-in with vendor; fallback to manual import.",
      "owner_name": "Ken Sato"
    }
  ],
  "decisions": [
    {
      "title": "Launch date moved to June 12",
      "decided_by": "Steering group",
      "rationale": "Vendor API not ready for the original date."
    }
  ],
  "open_questions": ["Who signs off on the localized UI strings?"],
  "needs_review": false
}
```

## Tips

- Test the prompt with `samples/sample-meeting-notes.txt` before wiring it into the flow.
- Very long transcripts: AI Builder prompts have an input size limit. Paste the Teams meeting recap
  or trim the transcript to the discussion parts if you hit it.
- Each run uses AI Builder credits. Check your tenant's credit capacity in the Power Platform admin center.
