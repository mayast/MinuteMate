# AI quality evaluation (Phase 5.6)

MinuteMate is only useful if people trust what the AI extracts. This folder measures it: test meetings with
hand-written expected results, and a script that scores the extraction prompt (Prompt 1) against them.

## What's measured
| Measure | Meaning |
|---|---|
| Precision | Of the items the AI found, how many are real (no made-up tasks, risks or decisions) |
| Recall | Of the real items, how many the AI found |
| Owner correct | Matched action items with the right owner ("Priya" matches "Priya Patel") |
| Due date correct | Matched action items with the right date (relative dates like "Friday" resolved) |
| Duplicate matching correct | On recurring meetings, repeated tasks point to the right existing item id |

Items are matched by title similarity, so wording can differ.

## Test cases (`cases/`)
| Case | What it tests |
|---|---|
| case-01 | A typical weekly sync: actions with owners and dates, risks, decisions |
| case-02 | A recurring meeting: three repeated tasks must match open items 21, 23, 24; one is new |
| case-03 | Tricky: proposals and open debates are not decisions; an unowned task keeps an empty owner |

Each case has `<case>.notes.txt` (the meeting), `<case>.input.json` (the other prompt inputs) and
`<case>.expected.json` (the right answer).

## Run it
1. In AI hub, open **MinuteMate - Extract meeting items** → **Test**. Fill the inputs from `<case>.input.json`
   and paste `<case>.notes.txt` as Notes.
2. Save the JSON output as `runs/<case>.json`.
3. `node eval/score.mjs` (Node 18+). Add `--threshold 0.8` to fail when overall F1 drops below 80%.

`runs/case-01.json` is an **illustrative** output so you can see the report format; replace it with a real run.

## When to re-run
After any change to Prompt 1, the AI model, or the AI Builder settings. Add a case whenever someone reports a wrong
or missing item: copy the meeting into a new case with the correct answer, so the mistake can't come back unnoticed.
