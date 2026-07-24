import type { Page } from "@playwright/test";

import type { BrowserIssue } from "./contracts";
import { classifyHttpIssue } from "./recorder";

type HealthIssue = Pick<
  BrowserIssue,
  "severity" | "summary" | "path" | "expectedUnavailableProjection"
>;

export function classifyHermesHealthProjection(
  status: number,
  bodyText: string,
): HealthIssue | null {
  if (status !== 200) return null;

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return {
      path: "/api/hermes/health",
      severity: "error",
      summary: "Hermes health returned an unreadable projection.",
      expectedUnavailableProjection: false,
    };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      path: "/api/hermes/health",
      severity: "error",
      summary: "Hermes health returned an unreadable projection.",
      expectedUnavailableProjection: false,
    };
  }

  const projection = body as Record<string, unknown>;
  const state = typeof projection.sourceState === "string"
    ? projection.sourceState
    : typeof projection.status === "string"
      ? projection.status
      : undefined;
  if (
    state &&
    ["unavailable", "not_configured", "timeout", "stale", "authentication_failed"]
      .includes(state)
  ) {
    return classifyHttpIssue({
      path: "/api/hermes/health",
      status,
      typedProjection: true,
      projectionState: state,
    });
  }

  return null;
}

export async function sampleHermesHealthProjection(
  page: Page,
  appUrl: string,
): Promise<HealthIssue | null> {
  const result = await page.evaluate(async (healthUrl) => {
    const response = await fetch(healthUrl, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    return {
      status: response.status,
      bodyText: await response.text(),
    };
  }, new URL("/api/hermes/health", appUrl).toString());

  return classifyHermesHealthProjection(result.status, result.bodyText);
}
