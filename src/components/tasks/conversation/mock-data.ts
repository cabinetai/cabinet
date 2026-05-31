import type { Task } from "@/types/tasks";

export const MOCK_TASK: Task = {
  meta: {
    id: "demo",
    title: "Refactor auth to support SSO",
    summary:
      "Refactoring auth to use the new session helper and add SSO support. 2 files changed, tests passing. Awaiting decision on SAML vs OIDC.",
    status: "awaiting-input",
    trigger: "manual",
    providerId: "claude-code",
    adapterType: "claude-code-cli",
    adapterConfig: { model: "claude-opus-4-7", effort: "medium" },
    runtime: { contextWindow: 200_000 },
    tokens: { input: 7_400, output: 1_400, cache: 17_500, total: 12_400 },
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    startedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    lastActivityAt: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
    mentionedPaths: [],
  },
  notes: "",
  session: null,
  artifactsIndex: {
    filesEdited: ["src/auth/login.ts", "src/auth/session.ts"],
    filesCreated: [],
    commandsRun: [{ cmd: "npm test", exit: 0, durationMs: 4_210 }],
    pagesTouched: [{ path: "data/engineering/auth-notes.md", title: "Auth notes" }],
    toolCalls: 2,
    generatedAt: new Date().toISOString(),
  },
  turns: [
    {
      id: "t1u",
      turn: 1,
      role: "user",
      ts: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      content:
        "Refactor `src/auth/login.ts` to use the new session helper. Keep the public API the same. Run the test suite when you're done.",
    },
    {
      id: "t1a",
      turn: 2,
      role: "agent",
      ts: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      tokens: { input: 3_200, output: 1_050, cache: 8_400 },
      content:
        "Done. Moved session creation into `createSession()` from `auth/session.ts`. Public `login()` signature unchanged. All 24 tests pass.",
      artifacts: [
        { kind: "file-edit", path: "src/auth/login.ts", added: 42, removed: 18, commit: "abc123" },
        { kind: "file-edit", path: "src/auth/session.ts", added: 8, removed: 3, commit: "abc123" },
        { kind: "command", cmd: "npm test", exit: 0, durationMs: 4_210, output: "Tests: 24 passed, 24 total\nTime: 4.21s" },
        { kind: "page-edit", path: "data/engineering/auth-notes.md", title: "Auth notes" },
      ],
    },
    {
      id: "t2u",
      turn: 3,
      role: "user",
      ts: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      content: "Nice. Now also handle SSO — same module.",
    },
    {
      id: "t2a",
      turn: 4,
      role: "agent",
      ts: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
      tokens: { input: 4_100, output: 320, cache: 9_100 },
      awaitingInput: true,
      content:
        "Before I scaffold this — should SSO use **SAML 2.0** or **OIDC**? They land in different files and different dependencies. If you're agnostic, I'd default to OIDC (simpler, JSON-native, fewer cert headaches).",
      artifacts: [
        { kind: "tool-call", tool: "Read", target: "src/auth/login.ts" },
        { kind: "tool-call", tool: "Grep", target: "saml|oidc" },
      ],
    },
  ],
};
