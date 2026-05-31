"use client";

import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A Switch that shows its configured state but cannot be toggled. Used when
 * the parent that gates the Switch's effect is itself off — the user needs
 * to fix the parent first.
 *
 * In unlocked mode, behaves exactly like a regular `<Switch>`. In locked
 * mode, the Switch renders gray and disabled but still captures clicks via
 * a wrapping span (the inner Switch is `pointer-events-none` so clicks fall
 * through to the span). A Tooltip explains the state. `onLockedClick` is an
 * optional callback fired on click — useful for nudging the user toward the
 * parent control with a visual pulse.
 */
export function LockedSwitch({
  checked,
  locked,
  onCheckedChange,
  onLockedClick,
  tooltip,
  ariaLabel,
}: {
  checked: boolean;
  locked: boolean;
  onCheckedChange: (next: boolean) => void;
  onLockedClick?: () => void;
  tooltip: string;
  ariaLabel: string;
}) {
  if (!locked) {
    return (
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={ariaLabel}
      />
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="inline-flex cursor-not-allowed"
            onClick={() => onLockedClick?.()}
            role="presentation"
          >
            <Switch
              checked={checked}
              disabled
              aria-label={ariaLabel}
              className="pointer-events-none"
            />
          </span>
        }
      />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
