"use client";

import { useEffect, useState } from "react";
import { Send, Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MentionDropdown } from "./mention-dropdown";
import { MentionChips } from "./mention-chips";
import { AttachmentChips } from "./attachment-chips";
import { AttachmentPickerButton } from "./attachment-picker-button";
import type { UseComposerAttachmentsReturn } from "./use-composer-attachments";
import type { UseComposerReturn, MentionableItem } from "@/hooks/use-composer";

export interface ComposerInputProps {
  composer: UseComposerReturn;
  placeholder?: string;
  submitLabel?: string;
  showKeyHint?: boolean;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  header?: React.ReactNode;
  actionsStart?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: "card" | "inline";
  items?: MentionableItem[];
  secondaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  mentionDropdownPlacement?: "above" | "below";
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /**
   * Appended to the default textarea classes via `cn`. Use this to override
   * padding, text size, or line-height when a specific surface needs a
   * different feel (e.g. the larger 14px textarea on the agent detail page).
   */
  textareaClassName?: string;
  /**
   * When set, the card turns on `transition-all` and adopts the given
   * `borderColor` + 3px outer ring in the supplied `ringColor` while the
   * textarea (or anything else in the card) holds focus. Used on the agent
   * detail page to tint the composer with the agent's brand color.
   */
  focusTint?: { borderColor: string; ringColor: string };
  /**
   * Content absolutely positioned in the top-right corner of the card
   * (e.g. the WhenChip for scheduling). The textarea automatically gains
   * `pr-28` so wrapped text can't collide with the overlay. Prefer this over
   * the `header` slot when you don't want the control to steal vertical
   * space from the textarea.
   */
  topRightOverlay?: React.ReactNode;
  /**
   * When provided, renders paperclip button + drag/drop + paste handlers
   * and displays attachment chips alongside mentions. Omit to disable
   * attachments entirely on a surface.
   */
  attachments?: UseComposerAttachmentsReturn;
}

export function ComposerInput({
  composer,
  placeholder = "Type something...",
  submitLabel = "Send",
  showKeyHint = true,
  className,
  minHeight = "80px",
  maxHeight = "260px",
  autoFocus = false,
  disabled = false,
  header,
  actionsStart,
  footer,
  variant = "card",
  items = [],
  secondaryAction,
  mentionDropdownPlacement = "above",
  onKeyDown,
  textareaClassName,
  focusTint,
  topRightOverlay,
  attachments,
}: ComposerInputProps) {
  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => composer.textareaRef.current?.focus(), 100);
    }
  }, [autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  const [cardFocused, setCardFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isUploading = attachments?.isUploading ?? false;
  const isDisabled = disabled || composer.submitting;
  const sendDisabled =
    isDisabled || !composer.input.trim() || isUploading;
  const attachmentsEnabled = !!attachments && attachments.enabled;

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!attachmentsEnabled) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!attachmentsEnabled) return;
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!attachmentsEnabled) return;
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
      setIsDragging(false);
      return;
    }
    e.preventDefault();
    attachments?.addFiles(e.dataTransfer.files);
    setIsDragging(false);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!attachmentsEnabled) return;
    const files = e.clipboardData?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    attachments?.addFiles(files);
  };

  const hasChips =
    composer.mentions.paths.length > 0 ||
    composer.mentions.agents.length > 0 ||
    composer.mentions.skills.length > 0 ||
    (attachments?.attachments.length ?? 0) > 0;

  return (
    <div className={cn("relative flex flex-col", className)}>
      <div
        className={cn(
          "relative flex flex-col",
          variant === "card" && "rounded-2xl border border-border bg-card",
          focusTint && "transition-all",
          focusTint && cardFocused && "shadow-sm",
          isDragging && "ring-2 ring-primary/60 ring-offset-0"
        )}
        style={
          focusTint && cardFocused
            ? {
                borderColor: focusTint.borderColor,
                boxShadow: `0 0 0 3px ${focusTint.ringColor}`,
              }
            : undefined
        }
        onFocus={focusTint ? () => setCardFocused(true) : undefined}
        onBlur={
          focusTint
            ? (e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setCardFocused(false);
                }
              }
            : undefined
        }
        onDragOver={attachmentsEnabled ? handleDragOver : undefined}
        onDragLeave={attachmentsEnabled ? handleDragLeave : undefined}
        onDrop={attachmentsEnabled ? handleDrop : undefined}
      >
        {topRightOverlay ? (
          <div className="absolute right-3 top-3 z-10">
            {topRightOverlay}
          </div>
        ) : null}
        {header}
        <div className="relative flex flex-col">
          {composer.showDropdown && composer.filteredItems.length > 0 && (
            <MentionDropdown
              items={composer.filteredItems}
              activeIndex={composer.dropdownIndex}
              onSelect={composer.insertMention}
              placement={mentionDropdownPlacement}
            />
          )}
          <textarea
            ref={composer.textareaRef}
            // Audit #098 / browser issue: a textarea with neither id nor
            // name nor aria-label trips a "form field needs id/name" alert
            // and is invisible to assistive tech. The placeholder is
            // dynamic ("I want to create…" on home, "Ask Editor something…"
            // on agent pages, etc.) so it doubles as the accessible label.
            aria-label={typeof placeholder === "string" ? placeholder : "Compose"}
            name="composer-input"
            value={composer.input}
            onChange={composer.handleChange}
            onPaste={attachmentsEnabled ? handlePaste : undefined}
            onKeyDown={(e) => {
              if (onKeyDown) {
                onKeyDown(e);
                if (e.defaultPrevented) return;
              }
              composer.handleKeyDown(e);
            }}
            placeholder={placeholder}
            disabled={isDisabled}
            style={{ minHeight, maxHeight }}
            className={cn(
              "w-full resize-none overflow-y-auto bg-transparent px-4 pt-4 pb-2 text-[13px] text-foreground caret-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50 disabled:cursor-not-allowed",
              topRightOverlay && "pr-28",
              textareaClassName
            )}
          />
        </div>

        {hasChips ? (
          <div className="flex flex-wrap gap-2 px-4 pb-2">
            <MentionChips
              mentionedPaths={composer.mentions.paths}
              mentionedAgents={composer.mentions.agents}
              mentionedSkills={composer.mentions.skills}
              items={items}
              onRemove={composer.removeMention}
              inline
            />
            {attachments ? (
              <AttachmentChips
                attachments={attachments.attachments}
                onRemove={attachments.remove}
              />
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            "flex items-center gap-2 px-4 pb-3",
            actionsStart || attachmentsEnabled ? "justify-between" : "justify-end"
          )}
        >
          {(actionsStart || attachmentsEnabled) ? (
            <div className="flex items-center gap-2 flex-wrap">
              {attachmentsEnabled ? (
                <AttachmentPickerButton
                  onPick={(files) => attachments?.addFiles(files)}
                  disabled={isDisabled}
                />
              ) : null}
              {actionsStart}
            </div>
          ) : null}
          <div className="flex items-center gap-3 ml-auto">
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground/35 select-none">
              <kbd className="rounded border border-border/40 bg-muted/40 px-1 py-0.5 font-mono text-[10px]">⌘</kbd>
              <kbd className="rounded border border-border/40 bg-muted/40 px-1 py-0.5 font-mono text-[10px]">↵</kbd>
              <span>newline</span>
            </div>
            {secondaryAction && (
              <Button
                variant="outline"
                className="h-8 gap-2 text-xs"
                onClick={secondaryAction.onClick}
                disabled={isDisabled || !composer.input.trim() || secondaryAction.disabled || isUploading}
              >
                {secondaryAction.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {secondaryAction.label}
              </Button>
            )}
            <span
              onClick={!isDisabled && !composer.input.trim() ? () => composer.textareaRef.current?.focus() : undefined}
              className={!isDisabled && !composer.input.trim() ? "cursor-text" : undefined}
            >
              <Button
                className="h-8 gap-2 text-xs"
                onClick={() => void composer.submit()}
                disabled={sendDisabled}
                title={isUploading ? "Uploading attachments…" : !composer.input.trim() ? "Type a prompt to send" : undefined}
              >
                {composer.submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {submitLabel}
              </Button>
            </span>
          </div>
        </div>

        {isDragging ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-primary/5">
            <span className="rounded-full border border-primary/40 bg-background px-3 py-1 text-xs text-primary shadow-sm">
              Drop to attach
            </span>
          </div>
        ) : null}

        {footer}
      </div>

      {showKeyHint && (
        <div className="flex items-center justify-end px-2 pt-2">
          <span className="text-[11px] text-muted-foreground/50">
            use <kbd className="rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono text-[10px]">@</kbd> to mention agents, skills &amp; pages
          </span>
        </div>
      )}
    </div>
  );
}
