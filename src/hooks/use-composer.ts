"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import type { UseComposerAttachmentsReturn } from "@/components/composer/use-composer-attachments";

export interface MentionableItem {
  type: "page" | "agent" | "skill";
  id: string; // path for pages, slug for agents, key for skills
  label: string; // title for pages, name for agents/skills
  sublabel: string; // path for pages, role for agents, description for skills
  icon?: string; // emoji for agents
}

export interface ComposerPayload {
  message: string;
  mentionedPaths: string[];
  mentionedAgents: string[];
  /** Skill keys mentioned in the composer — attached to this run only (run-only by default per Decision §2). */
  mentionedSkills: string[];
  attachmentPaths: string[];
  stagingClientUuid?: string;
}

export interface MentionInsertBehavior {
  replaceText?: string;
  trackMention?: boolean;
}

export interface UseComposerOptions {
  items?: MentionableItem[];
  onSubmit: (payload: ComposerPayload) => void | Promise<void>;
  disabled?: boolean;
  initialMentionedAgents?: string[];
  /**
   * A page path that is always present as a context chip without the user
   * having to @-mention it (e.g. the page currently open in the editor).
   * It survives auto-removal, submit, and reset, and follows the value as
   * it changes. The user can still dismiss it; it reappears when the path
   * changes to a different page.
   */
  pinnedPagePath?: string | null;
  getMentionInsertBehavior?: (item: MentionableItem) => MentionInsertBehavior | void;
  attachments?: UseComposerAttachmentsReturn;
  stagingClientUuid?: string;
}

export interface UseComposerReturn {
  input: string;
  setInput: (value: string) => void;
  mentions: { paths: string[]; agents: string[]; skills: string[] };
  showDropdown: boolean;
  filteredItems: MentionableItem[];
  dropdownIndex: number;
  submitting: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  insertMention: (item: MentionableItem) => void;
  removeMention: (type: "page" | "agent" | "skill", id: string) => void;
  submit: (directMessage?: string) => Promise<void>;
  reset: () => void;
}

export function useComposer({
  items = [],
  onSubmit,
  disabled = false,
  initialMentionedAgents,
  getMentionInsertBehavior,
  attachments,
  stagingClientUuid,
  pinnedPagePath = null,
}: UseComposerOptions): UseComposerReturn {
  const initialAgentsRef = useRef(initialMentionedAgents ?? []);
  const [input, setInput] = useState("");
  const [mentionedPaths, setMentionedPaths] = useState<string[]>([]);
  // Tracks the pinned path the user explicitly dismissed. The chip is hidden
  // only while this equals the active `pinnedPagePath`; navigating to a
  // different page changes the path and the chip returns automatically.
  const [dismissedPinnedPath, setDismissedPinnedPath] = useState<string | null>(null);
  const [mentionedAgents, setMentionedAgents] = useState<string[]>(initialAgentsRef.current);
  const [mentionedSkills, setMentionedSkills] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const filteredItems = useMemo(() => {
    if (!mentionQuery && !showDropdown) return [];
    const q = mentionQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.sublabel.toLowerCase().includes(q)
    );
  }, [items, mentionQuery, showDropdown]);

  const pinnedActive =
    pinnedPagePath && dismissedPinnedPath !== pinnedPagePath
      ? pinnedPagePath
      : null;

  // The pinned page is merged into the reported/submitted paths without
  // living in `mentionedPaths` state, so the @-label auto-removal in
  // handleChange never touches it.
  const effectivePaths = useMemo(
    () =>
      pinnedActive
        ? [pinnedActive, ...mentionedPaths.filter((p) => p !== pinnedActive)]
        : mentionedPaths,
    [pinnedActive, mentionedPaths]
  );

  const findLabelForMention = useCallback(
    (type: "page" | "agent" | "skill", id: string): string => {
      const item = items.find((i) => i.type === type && i.id === id);
      return item?.label || id;
    },
    [items]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const pos = e.target.selectionStart || 0;
      setInput(value);

      // Auto-remove mentions whose @Label no longer appears in the text
      setMentionedPaths((current) =>
        current.filter((path) => {
          const label = findLabelForMention("page", path);
          return value.includes(`@${label}`);
        })
      );
      setMentionedAgents((current) =>
        current.filter((slug) => {
          // Never auto-remove agents that were pre-selected as defaults
          if (initialAgentsRef.current.includes(slug)) return true;
          const label = findLabelForMention("agent", slug);
          return value.includes(`@${label}`);
        })
      );
      setMentionedSkills((current) =>
        current.filter((key) => {
          const label = findLabelForMention("skill", key);
          return value.includes(`@${label}`);
        })
      );

      // Detect @ trigger
      const textBefore = value.slice(0, pos);
      const atIndex = textBefore.lastIndexOf("@");

      if (atIndex !== -1) {
        const charBefore = atIndex > 0 ? textBefore[atIndex - 1] : " ";
        if (charBefore === " " || charBefore === "\n" || atIndex === 0) {
          const query = textBefore.slice(atIndex + 1);
          if (!query.includes(" ") && !query.includes("\n")) {
            setShowDropdown(true);
            setMentionQuery(query);
            setMentionIndex(0);
            setMentionStartPos(atIndex);
            return;
          }
        }
      }
      setShowDropdown(false);
    },
    [findLabelForMention]
  );

  const insertMention = useCallback(
    (item: MentionableItem) => {
      const behavior = getMentionInsertBehavior?.(item);
      const before = input.slice(0, mentionStartPos);
      const cursorPos = textareaRef.current?.selectionStart || input.length;
      const after = input.slice(cursorPos);
      const replacement = behavior?.replaceText ?? `@${item.label} `;
      const newInput = `${before}${replacement}${after}`;
      setInput(newInput);

      if (behavior?.trackMention !== false) {
        if (item.type === "page") {
          setMentionedPaths((prev) =>
            prev.includes(item.id) ? prev : [...prev, item.id]
          );
        } else if (item.type === "skill") {
          setMentionedSkills((prev) =>
            prev.includes(item.id) ? prev : [...prev, item.id]
          );
        } else {
          setMentionedAgents((prev) =>
            prev.includes(item.id) ? prev : [...prev, item.id]
          );
        }
      }

      setShowDropdown(false);
      setMentionQuery("");

      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = before.length + replacement.length;
          textareaRef.current.selectionStart = newPos;
          textareaRef.current.selectionEnd = newPos;
          textareaRef.current.focus();
        }
      }, 0);
    },
    [getMentionInsertBehavior, input, mentionStartPos]
  );

  const removeMention = useCallback(
    (type: "page" | "agent" | "skill", id: string) => {
      if (type === "page") {
        setMentionedPaths((prev) => prev.filter((p) => p !== id));
        if (id === pinnedPagePath) setDismissedPinnedPath(pinnedPagePath);
      } else if (type === "skill") {
        setMentionedSkills((prev) => prev.filter((k) => k !== id));
      } else {
        setMentionedAgents((prev) => prev.filter((a) => a !== id));
      }
    },
    [pinnedPagePath]
  );

  const reset = useCallback(() => {
    setInput("");
    setMentionedPaths([]);
    setMentionedAgents(initialAgentsRef.current);
    setMentionedSkills([]);
    setShowDropdown(false);
    setMentionQuery("");
    setMentionIndex(0);
    setSubmitting(false);
    attachments?.clear();
  }, [attachments]);

  const submit = useCallback(async (directMessage?: string) => {
    const msg = directMessage?.trim() || input.trim();
    if (!msg || disabled || submitting) return;
    if (attachments?.isUploading) return;

    const priorPaths = [...mentionedPaths];
    const paths = [...effectivePaths];
    const agents = [...mentionedAgents];
    const skills = [...mentionedSkills];
    const attachmentPaths = attachments
      ? attachments.ready
          .map((a) => a.virtualPath)
          .filter((p): p is string => typeof p === "string")
      : [];
    const isStagingKickoff =
      !!attachments && attachments.targetDir.includes("/_pending/");
    const kickoffStagingUuid =
      isStagingKickoff && attachmentPaths.length > 0
        ? stagingClientUuid
        : undefined;

    setSubmitting(true);
    try {
      await onSubmit({
        message: msg,
        mentionedPaths: paths,
        mentionedAgents: agents,
        mentionedSkills: skills,
        attachmentPaths,
        stagingClientUuid: kickoffStagingUuid,
      });
      setInput("");
      setMentionedPaths([]);
      setMentionedAgents(initialAgentsRef.current);
      setMentionedSkills([]);
      attachments?.clear();
    } catch {
      // Restore input on failure
      setInput(msg);
      setMentionedPaths(priorPaths);
      setMentionedAgents(agents);
      setMentionedSkills(skills);
    } finally {
      setSubmitting(false);
    }
  }, [input, disabled, submitting, mentionedPaths, effectivePaths, mentionedAgents, mentionedSkills, onSubmit, attachments, stagingClientUuid]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // When mention dropdown is open, handle navigation
      if (showDropdown && filteredItems.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((i) => Math.min(i + 1, filteredItems.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          insertMention(filteredItems[mentionIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowDropdown(false);
          return;
        }
      }

      // Shift+Enter: newline (browser default)
      if (e.key === "Enter" && e.shiftKey) {
        return;
      }

      // Cmd+Enter: insert newline manually (metaKey does not naturally newline)
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart ?? 0;
        const end = textarea.selectionEnd ?? 0;
        const newValue = input.slice(0, start) + "\n" + input.slice(end);
        setInput(newValue);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = start + 1;
            textareaRef.current.selectionEnd = start + 1;
          }
        }, 0);
        return;
      }

      // Enter (no modifier): submit
      if (e.key === "Enter") {
        e.preventDefault();
        void submit();
        return;
      }
    },
    [showDropdown, filteredItems, mentionIndex, insertMention, submit]
  );

  return {
    input,
    setInput,
    mentions: { paths: effectivePaths, agents: mentionedAgents, skills: mentionedSkills },
    showDropdown,
    filteredItems,
    dropdownIndex: mentionIndex,
    submitting,
    textareaRef,
    handleChange,
    handleKeyDown,
    insertMention,
    removeMention,
    submit,
    reset,
  };
}
