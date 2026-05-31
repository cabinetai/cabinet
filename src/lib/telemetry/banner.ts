import { readState, updateState } from "./state";
import { isTelemetryEnabled } from "./kill-switches";

const MAX_SHOWS = 5;

export function printStartupBannerIfNeeded(): void {
  if (!isTelemetryEnabled()) return;
  const state = readState();
  if (state.bannerShownCount >= MAX_SHOWS) return;

  console.log(
    "\nCabinet sends anonymous usage telemetry to improve the product." +
      "\n  Disable: CABINET_TELEMETRY_DISABLED=1  |  Settings toggle in the web UI" +
      "\n  Details: https://github.com/hilash/cabinet/blob/main/TELEMETRY.md\n"
  );

  updateState({ bannerShownCount: state.bannerShownCount + 1 });
}
