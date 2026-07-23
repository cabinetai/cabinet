# Supervised Cabinet on macOS

Cabinet ships a private, loopback-only launchd template at `deploy/macos/ai.cabinet.plist.template`. It starts only the production Next server. It does not own or restart the Cabinet daemon, Hermes, Gateway, Desktop, Tailscale, or any public listener. The current supervised Hermes conversation contract is no-tools only; tool-enabled conversations require a separate governed design.

Build the exact clean runtime worktree first. Render the placeholders into a user LaunchAgent file with owner-only permissions. `CABINET_ENV_FILE` points at the existing owner-only environment file; only that nonsecret path is placed in the plist, never its contents. Cabinet rejects relative paths, symlinks, foreign ownership, and group/world access before startup.

Required substitutions:

- `__SERVICE_LABEL__`: a unique user service label
- `__NODE_PATH__`: the absolute Node executable used for the build
- `__RUNTIME_ROOT__`: the absolute clean runtime worktree
- `__CABINET_DATA_DIR__`: the absolute external Cabinet data directory
- `__CABINET_ENV_FILE__`: the absolute existing owner-only Cabinet environment file
- `__HERMES_EXECUTION_CLI_PATH__`: the approved absolute ACP-capable Hermes CLI
- `__HERMES_PROFILE__`: the exact Hermes profile
- `__CABINET_PORT__`: an unused private port
- `__LOG_DIR__`: an owner-only local log directory with normal host log rotation

Validate the rendered plist with `/usr/bin/plutil -lint`. Load it into the current GUI user domain with `/bin/launchctl bootstrap gui/$(/usr/bin/id -u) <plist>`, inspect with `/bin/launchctl print gui/$(/usr/bin/id -u)/<label>`, and stop it with `/bin/launchctl bootout gui/$(/usr/bin/id -u)/<label>`. `RunAtLoad` starts it after login; `KeepAlive.SuccessfulExit=false` restarts unexpected failures without relaunching after a clean stop or bootout.

The template explicitly sets `CABINET_HERMES_EXECUTION_NO_TOOLS=true`. The startup wrapper fails closed before spawning Next unless that value is exactly `true`, runtime mode is `hermes`, the listener is `127.0.0.1`, interventions are disabled, paths are absolute and usable, the data directory exists, and a production standalone build exists. It forces the no-tools value into the child process, so a value in the owner-only environment file cannot weaken the process-level contract. It uses argument-vector process launch and never evaluates a shell command.
