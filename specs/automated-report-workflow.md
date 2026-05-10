# Spec: Automated Report Workflow

**Status:** Draft  
**Date:** 2026-05-04  
**Source:** Validated pain point from UA team interview  

---

## The problem

Client emails asking for a report. Someone has to manually pull data from Looker Studio, build a deck, and send it. That takes hours and it's repetitive work.

---

## Who this is for

CSM or UA manager who needs to respond to a client report request without doing it manually.

---

## What done looks like

Client sends an email. An hour later, the internal person gets a notification that a draft report is ready for review. They check it, approve it, it sends. They never opened Looker Studio.

---

## AI vs. automation -- pick the right tool per step

AI is not required throughout this workflow. Each step should use the simplest solution that works reliably. Normal automation (triggers, templates, scheduled jobs) is often faster to build, easier to maintain, and more predictable than an AI agent. Use AI only where judgment, language, or ambiguity handling is actually needed.

| Step | What's needed | Best approach |
|------|--------------|---------------|
| Email received | Detect inbound email and route it | Plain automation (email webhook / inbound parse) |
| Parse the request | Understand client, time period, report type | AI if freeform language; rule-based if structured |
| Pull data | Query BigQuery for the right client and period | Plain automation (parameterized SQL query) |
| Generate report | Write the narrative, summary, recommendations | AI (this is where language generation earns its place) |
| Approval queue | Surface draft for human review and edits | Plain UI + notification, no AI needed |
| Send report | Deliver to client once approved | Plain automation (email API) |

The only step where AI clearly earns its place is report generation -- turning raw data into a readable, structured narrative. Everything else can be rule-based automation unless there's a specific reason to add AI.

---

## The flow

**Step 1 -- Email received**  
Client sends an email to a dedicated address (e.g. reports@yellowhead.com). The email might say "can you send me last week's performance summary" or "I need the monthly report for April."

**Step 2 -- Request parsed**  
The system extracts: which client sent it, what time period they want, what kind of report. If the email is structured or follows a predictable pattern, this is a simple rule-based parse. If clients write in freeform language, this is where an LLM call earns its place. If something is ambiguous or missing, the system flags it rather than guessing.

**Step 3 -- Data pulled from BigQuery**  
Parameterized SQL queries run against BigQuery for that client and time period. Spend, installs, CPI, ROAS by channel -- whatever the report type calls for. This is plain automation, not AI.

**Step 4 -- Report generated**  
Claude takes the structured data and writes the report: executive summary, KPI section, channel breakdown, top campaigns, one or two recommendations. Same structure every time so it's predictable and editable. This is the one step where AI clearly adds value over a template.

**Step 5 -- Approval queue in Lumen**  
The draft lands in a queue inside Lumen. The internal person (CSM or UA manager) gets a notification. They open the draft, read it, make any edits, and hit approve. Or they reject it with a note and the system revises or flags for manual handling. No AI in this step -- just a clean UI.

**Step 6 -- Report sent**  
Once approved, Lumen sends the report to the client automatically. Either as an email with a shareable link or as a PDF attachment, depending on what the client expects. Plain automation.

---

## MVP -- what to build first

Skip the email trigger for now. That adds infrastructure complexity early. Start with a manual trigger inside Lumen:

1. Someone clicks "Generate report for client X, last 7 days"
2. System queries BigQuery and generates the draft
3. Draft lands in the approval queue
4. Reviewer approves and sends

Once that loop works end to end and people trust it, swap the manual trigger for the email trigger. Prove the core loop before adding the automation layer on top.

---

## Open questions

- What report formats do clients currently expect? (PDF, email body, link?)
- Is there a standard report structure today or does it vary by client?
- Who is the approver -- always the CSM, or does it depend on the client?
- What happens if the email is ambiguous -- who gets flagged?
- Rivery sync cadence: how fresh is the data at the time the report is generated?
