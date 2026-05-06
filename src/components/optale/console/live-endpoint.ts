"use client";

import { useEffect, useState } from "react";

type EndpointResult<T> = {
  requestKey: string;
  data: T | null;
  error: string | null;
};

export type EndpointState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

export function useConsoleEndpoint<T>(
  url: string | null,
  refreshKey: number,
): EndpointState<T> {
  const requestKey = url ? `${url}::${refreshKey}` : "";
  const [state, setState] = useState<EndpointResult<T>>({
    requestKey: "",
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const currentRequestKey = requestKey;

    void fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as T | null;
        const error = response.ok ? null : errorFromPayload(payload, response.status);
        setState({ requestKey: currentRequestKey, data: payload, error });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          requestKey: currentRequestKey,
          data: null,
          error: error instanceof Error ? error.message : "Console request failed",
        });
      });

    return () => controller.abort();
  }, [requestKey, url]);

  if (!url) return { data: null, error: null, loading: false };
  const settled = state.requestKey === requestKey;
  return {
    data: settled ? state.data : null,
    error: settled ? state.error : null,
    loading: !settled,
  };
}

function errorFromPayload(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const error = (payload as Record<string, unknown>).error;
    const message = (payload as Record<string, unknown>).message;
    if (typeof error === "string" && error.trim()) return error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `Console request failed: ${status}`;
}
