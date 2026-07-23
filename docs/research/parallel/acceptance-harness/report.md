# Production acceptance harness

Verdict: **NOT_ACCEPTED**

The runner exercised an isolated application build on port 4325. It sent 2 bounded live model message request(s) and did not touch production or canonical data.

## Checks

| Area | Check | Status | Result |
| --- | --- | --- | --- |
| conversation | live-two-turn-contract | FAILED | Two-turn provider gate failed: Error: initial response was not the exact acceptance token |
| routes | full-route-harness | NOT_RUN | NOT_RUN because the two-turn provider gate did not pass; no additional conversation or model call was made. |

## Exact blockers

- `live-two-turn-contract-failed`: Two-turn provider gate failed: Error: initial response was not the exact acceptance token

## Accounting

- Requests: 2
- Mutations observed: 2
- Legacy daemon-output requests: 0
- Search requests: 0
- PTY create/write requests: 0
- Model message requests: 2
- Provider identities observed: ollama-cloud
- Effective model identities observed: glm-5.2
- Provider requests attempted: 2
- Provider retries: 0
- Fallback attempts: 0
- Consequential Hermes mutations: 0
- Relevant browser issues: 0
- Developer diagnostics observed: not observed
- Secret indicators: 0
- Local-path indicators: 0

## Recommendation

Resolve only the exact blockers above, then rerun the same bounded acceptance.
