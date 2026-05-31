"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, KeyRound, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError } from "@/lib/ui/toast";
import { confirmDialog } from "@/lib/ui/confirm";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

/**
 * Settings → Integrations → API Keys.
 *
 * Backed by `<PROJECT_ROOT>/.cabinet.env`. The server never returns full
 * values; only `{ key, hasValue, lastFour }`. Edits are re-entry: clicking
 * Edit opens a blank value field; we never round-trip the plaintext through
 * the client.
 *
 * Common providers are surfaced as a preset dropdown so the user picks an
 * intent ("OpenAI") instead of remembering env-var names. Last entry is
 * "Custom…" for free-form keys.
 */

interface SnapshotEntry {
  key: string;
  hasValue: boolean;
  lastFour: string;
}

interface Preset {
  id: string;
  label: string;
  envVar: string;
  hint: string;
}

const PRESETS: Preset[] = [
  {
    id: "openai",
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    hint: "Used by skills like imagegen and any tool calling api.openai.com",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    hint: "Used when the Claude CLI is configured to use API-key auth",
  },
  {
    id: "github",
    label: "GitHub (personal access token)",
    envVar: "GITHUB_TOKEN",
    hint: "Lifts skill-search rate limits; used by Cabinet's GitHub fetches",
  },
  {
    id: "google-ai",
    label: "Google AI Studio",
    envVar: "GOOGLE_AI_API_KEY",
    hint: "For Gemini-related skills that don't use the Gemini CLI directly",
  },
  {
    id: "google-sa",
    label: "Google Service Account",
    envVar: "GOOGLE_APPLICATION_CREDENTIALS",
    hint: "File path to a service-account JSON; not a secret string itself",
  },
];

const CUSTOM_PRESET_ID = "__custom__";
const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

type FormState =
  | { mode: "closed" }
  | { mode: "adding"; presetId: string; customKey: string; value: string }
  | { mode: "editing"; key: string; value: string };

export function ApiKeysSection(): React.ReactElement {
  const { t } = useLocale();
  const [entries, setEntries] = useState<SnapshotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({ mode: "closed" });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/config/cabinet-env");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { entries?: SnapshotEntry[] };
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const closeForm = useCallback(() => setForm({ mode: "closed" }), []);

  const handleSave = useCallback(
    async (key: string, value: string) => {
      if (!KEY_PATTERN.test(key)) {
        showError(
          "Invalid env var name. Use uppercase letters, digits, and underscores; must start with a letter.",
        );
        return;
      }
      if (!value.trim()) {
        showError("Value can't be empty.");
        return;
      }
      setSubmitting(true);
      try {
        const res = await fetch("/api/agents/config/cabinet-env", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { entries?: SnapshotEntry[] };
        setEntries(Array.isArray(data.entries) ? data.entries : []);
        closeForm();
      } catch (err) {
        showError(err instanceof Error ? err.message : "Failed to save key");
      } finally {
        setSubmitting(false);
      }
    },
    [closeForm],
  );

  const handleDelete = useCallback(
    async (key: string) => {
      const ok = await confirmDialog({
        title: `Remove ${key}?`,
        message:
          "The key will be deleted from .cabinet.env and from this process's environment. New tasks won't see it.",
        confirmText: "Remove",
        destructive: true,
      });
      if (!ok) return;
      try {
        const res = await fetch(
          `/api/agents/config/cabinet-env?key=${encodeURIComponent(key)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { entries?: SnapshotEntry[] };
        setEntries(Array.isArray(data.entries) ? data.entries : []);
      } catch (err) {
        showError(err instanceof Error ? err.message : "Failed to remove key");
      }
    },
    [],
  );

  return (
    <section>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-[14px] font-semibold flex items-center gap-1.5">
          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
          API Keys
        </h3>
        {form.mode === "closed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setForm({
                mode: "adding",
                presetId: PRESETS[0].id,
                customKey: "",
                value: "",
              })
            }
            className="h-7 text-[11px]"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add key
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Stored locally in <code className="text-[11px]">.cabinet.env</code> at the
        project root. Gitignored, owner-only file permissions. Available to skills
        and CLIs at spawn time.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {form.mode === "adding" && (
            <AddKeyForm
              state={form}
              setState={(next) => setForm(next)}
              submitting={submitting}
              onSubmit={(k, v) => handleSave(k, v)}
              onCancel={closeForm}
              existingKeys={new Set(entries.map((e) => e.key))}
            />
          )}

          {entries.length === 0 && form.mode !== "adding" && (
            <div className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
              No API keys yet. Click <strong>{t("apiKeys:addKey")}</strong> to set one.
            </div>
          )}

          {entries.map((entry) =>
            form.mode === "editing" && form.key === entry.key ? (
              <EditKeyForm
                key={entry.key}
                state={form}
                setState={(next) => setForm(next)}
                submitting={submitting}
                onSubmit={(v) => handleSave(entry.key, v)}
                onCancel={closeForm}
              />
            ) : (
              <KeyRow
                key={entry.key}
                entry={entry}
                onEdit={() => setForm({ mode: "editing", key: entry.key, value: "" })}
                onDelete={() => handleDelete(entry.key)}
                disabled={form.mode !== "closed"}
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

function KeyRow({
  entry,
  onEdit,
  onDelete,
  disabled,
}: {
  entry: SnapshotEntry;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}): React.ReactElement {
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2">
      <code className="text-[12.5px] font-medium flex-1 truncate">{entry.key}</code>
      <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
        {entry.hasValue
          ? entry.lastFour
            ? `••••${entry.lastFour}`
            : "••••"
          : "(not set)"}
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={onEdit}
        disabled={disabled}
        className="h-7 w-7 p-0"
        title={t("apiKeys:edit")}
      >
        <Pencil className="h-3 w-3" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        disabled={disabled}
        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
        title={t("apiKeys:remove")}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function AddKeyForm({
  state,
  setState,
  submitting,
  onSubmit,
  onCancel,
  existingKeys,
}: {
  state: { mode: "adding"; presetId: string; customKey: string; value: string };
  setState: (s: FormState) => void;
  submitting: boolean;
  onSubmit: (key: string, value: string) => void;
  onCancel: () => void;
  existingKeys: Set<string>;
}): React.ReactElement {
  const { t } = useLocale();
  const isCustom = state.presetId === CUSTOM_PRESET_ID;
  const preset = useMemo(
    () => PRESETS.find((p) => p.id === state.presetId) ?? null,
    [state.presetId],
  );
  const resolvedKey = isCustom
    ? state.customKey.trim().toUpperCase()
    : preset?.envVar ?? "";
  const hint = isCustom
    ? "Any environment variable name. Uppercase letters, digits, and underscores; must start with a letter."
    : preset?.hint ?? "";

  const alreadyExists = resolvedKey.length > 0 && existingKeys.has(resolvedKey);

  const canSubmit =
    !!resolvedKey && KEY_PATTERN.test(resolvedKey) && state.value.trim().length > 0 && !alreadyExists;

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold">{t("apiKeys:newApiKey")}</span>
        <button
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground p-1 -m-1"
          title={t("apiKeysSection:cancel")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        <label className="text-[10px] text-muted-foreground/70 uppercase tracking-wide block mb-1">
          Provider
        </label>
        <select
          value={state.presetId}
          onChange={(e) => setState({ ...state, presetId: e.target.value })}
          className="w-full h-8 bg-background border border-border rounded px-2 text-[12.5px]"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.envVar})
            </option>
          ))}
          <option value={CUSTOM_PRESET_ID}>Custom…</option>
        </select>
        <p className="text-[10.5px] text-muted-foreground mt-1">{hint}</p>
      </div>

      {isCustom && (
        <div>
          <label className="text-[10px] text-muted-foreground/70 uppercase tracking-wide block mb-1">
            Env var name
          </label>
          <Input
            value={state.customKey}
            onChange={(e) =>
              setState({
                ...state,
                customKey: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""),
              })
            }
            placeholder="MY_CUSTOM_TOKEN"
            className="h-8 text-[12.5px] font-mono"
            autoFocus
          />
        </div>
      )}

      {!isCustom && (
        <div>
          <label className="text-[10px] text-muted-foreground/70 uppercase tracking-wide block mb-1">
            Env var name
          </label>
          <code
            className={cn(
              "block w-full h-8 leading-8 px-2 rounded bg-muted/30 border border-border/50 text-[12.5px]",
              alreadyExists && "border-destructive/40",
            )}
          >
            {resolvedKey}
          </code>
          {alreadyExists && (
            <p className="text-[10.5px] text-destructive mt-1">
              Already set. Use Edit on the existing row instead.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="text-[10px] text-muted-foreground/70 uppercase tracking-wide block mb-1">
          Value
        </label>
        <Input
          type="password"
          value={state.value}
          onChange={(e) => setState({ ...state, value: e.target.value })}
          placeholder={t("apiKeysSection:pasteHere")}
          className="h-8 text-[12.5px] font-mono"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-7">
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit(resolvedKey, state.value)}
          disabled={!canSubmit || submitting}
          className="h-7"
        >
          {submitting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Check className="h-3 w-3 mr-1" />
              Save
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function EditKeyForm({
  state,
  setState,
  submitting,
  onSubmit,
  onCancel,
}: {
  state: { mode: "editing"; key: string; value: string };
  setState: (s: FormState) => void;
  submitting: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const { t } = useLocale();
  const canSubmit = state.value.trim().length > 0;
  return (
    <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
      <code className="text-[12.5px] font-medium shrink-0">{state.key}</code>
      <Input
        type="password"
        value={state.value}
        onChange={(e) => setState({ ...state, value: e.target.value })}
        placeholder={t("apiKeysSection:pasteNewValue")}
        className="h-7 text-[12.5px] font-mono flex-1"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit && !submitting) {
            e.preventDefault();
            onSubmit(state.value);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <Button
        size="sm"
        onClick={() => onSubmit(state.value)}
        disabled={!canSubmit || submitting}
        className="h-7"
      >
        {submitting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 w-7 p-0">
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
