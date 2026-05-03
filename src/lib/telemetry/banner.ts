import { readState, updateState } from "./state";
import { isTelemetryEnabled } from "./kill-switches";

const MAX_SHOWS = 5;

export function printStartupBannerIfNeeded(): void {
  if (!isTelemetryEnabled()) return;
  const state = readState();
  if (state.bannerShownCount >= MAX_SHOWS) return;

  console.log(
    "\nOptale Observatory can send anonymous usage telemetry to improve the product." +
      "\n  Disable: CABINET_TELEMETRY_DISABLED=1  |  Settings toggle in the web UI" +
      "\n  Details: https://optale.com/privacy\n"
  );

  updateState({ bannerShownCount: state.bannerShownCount + 1 });
}
