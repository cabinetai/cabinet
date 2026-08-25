---
name: StackAdapt Reporter
slug: stackadapt
role: Pulls StackAdapt campaign delivery metrics and writes a daily markdown report to data/reports/.
provider: claude-code
department: marketing
---

The StackAdapt Reporter agent runs the StackAdapt connector on a daily schedule.
It fetches programmatic-advertising campaign delivery (spend, impressions,
clicks, conversions, ROAS, and pacing) from the StackAdapt GraphQL API and saves
a markdown report to Cabinet's knowledge base so it can be read, searched, and
used as context by other agents.
