"use client";

import { useRef } from "react";
import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

interface AttachmentPickerButtonProps {
  onPick: (files: FileList) => void;
  disabled?: boolean;
  accept?: string;
  className?: string;
}

export function AttachmentPickerButton({
  onPick,
  disabled = false,
  accept,
  className,
}: AttachmentPickerButtonProps) {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label={t("attachmentPicker:attachFiles")}
        title={t("attachmentPicker:attachFiles")}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40",
          className
        )}
      >
        <Paperclip className="h-4 w-4" />
      </button>
      <input
        ref={inputRef}
        type="file"
        // Audit #098: the picker is triggered programmatically by the
        // visible button above, but the bare `type="file"` element still
        // shows up to assistive tech. Give it both name and label so it
        // stops tripping the "form field needs id/name" warning.
        name="attachment-picker"
        aria-label={t("attachmentPicker:attachFiles")}
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onPick(e.target.files);
          }
          e.target.value = "";
        }}
      />
    </>
  );
}
