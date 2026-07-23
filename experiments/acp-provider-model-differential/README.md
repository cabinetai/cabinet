# ACP provider/model differential

This experiment compares the provider/model inputs used by the accepted
standalone ACP probe with the failed integrated Cabinet run. It is diagnostic
only and does not import or modify Cabinet production code.

The readiness probe resolves configuration, provider metadata, and fallback
metadata without initializing ACP, creating a session, dispatching a prompt,
or contacting a model provider. Source and interpreter locations are supplied
through process environment variables and are never written to its output.

Run the fixture tests:

```sh
node --test experiments/acp-provider-model-differential/*.test.mjs
```

Run the single bounded readiness diagnostic:

```sh
PASSING_SOURCE_ROOT=/absolute/source/root \
PASSING_PYTHON=/absolute/python \
FAILING_SOURCE_ROOT=/absolute/source/root \
FAILING_PYTHON=/absolute/python \
node experiments/acp-provider-model-differential/run-readiness-diagnostic.mjs
```

The diagnostic uses an isolated temporary home and a non-secret presence
marker. It stops after local provider/model resolution.

Run the 100/100 readiness burn-in against an exact, disposable companion
executable:

```sh
HERMES_ACP_EXECUTABLE=/absolute/disposable/bin/hermes-acp \
node experiments/acp-provider-model-differential/run-readiness-burnin.mjs
```

The burn-in uses the same disposable directory for `HERMES_HOME` and
`config.yaml`, invokes only `--model-readiness-json`, supplies a non-secret
credential-presence marker, and fails unless all 100 results preserve the
exact provider/model identity with zero model requests, retries, fallbacks,
completions, or secret egress.
