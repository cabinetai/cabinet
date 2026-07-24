# Final-route live acceptance r2 diagnosis

## Verdict

`NOT_ACCEPTED`

The single authorized replacement run was consumed without retry. The live
two-turn contract passed before the full route harness ran:

- one stable native session across two Cabinet restarts;
- exactly two user and two completed assistant turns;
- the fresh nonce appeared exactly once in both replies;
- zero duplicate chunks, provider retries, fallbacks, tools, decisions, or MCP
  servers;
- zero pending required writes after each completed turn.

The duplicate-chunk correction therefore passed its live acceptance boundary.

## Exact remaining blocker

The full harness failed `restart-route-persistence` because the room remount
issued `POST /api/git/pull`. The restart tracker correctly treats every
non-read-only request as consequential and cannot correlate a console transport
reset to a failed read-only request. It therefore failed closed with:

> Controlled restart console reset was not correlated to a failed read-only
> request.

The request originates from the status bar's mount-time `pullAndRefresh`
effect. This is outside the authorized duplicate-chunk correction and was not
changed or retried in this run.

## Safety and accounting

- Production touched: no.
- Consequential Hermes mutations: 0.
- Legacy daemon-output requests: 0.
- Search requests: 0.
- PTY create/write requests: 0.
- Secret indicators retained in the preserved artifacts: 0.
- Local-path indicators retained in the preserved artifacts: 0.
- Push, PR, merge, or deployment: none.

The route inventory itself completed 15/15. The authoritative product verdict
remains `NOT_ACCEPTED` until the mount-time Git pull and controlled-restart
boundary are reconciled and a separately authorized live run passes.
