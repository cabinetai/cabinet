"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { UserProfile, WorkspaceFields } from "@/lib/user/profile-io";

interface ProfileBundle {
  profile: UserProfile;
  workspace: WorkspaceFields;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: ProfileBundle }
  | { status: "error"; error: string };

const IDLE_STATE: State = { status: "idle" };

let state: State = IDLE_STATE;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): State {
  return state;
}

function getServerSnapshot(): State {
  return IDLE_STATE;
}

async function doFetch(): Promise<void> {
  state = { status: "loading" };
  emit();
  try {
    const res = await fetch("/api/user/profile", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as ProfileBundle;
    state = { status: "ready", data };
  } catch (err) {
    state = {
      status: "error",
      error: err instanceof Error ? err.message : "Failed to load profile",
    };
  } finally {
    inflight = null;
    emit();
  }
}

export function refreshUserProfile(): Promise<void> {
  if (!inflight) inflight = doFetch();
  return inflight;
}

export function setUserProfileOptimistic(next: {
  profile?: Partial<UserProfile>;
  workspace?: Partial<WorkspaceFields>;
}): void {
  if (state.status !== "ready") return;
  state = {
    status: "ready",
    data: {
      profile: { ...state.data.profile, ...(next.profile || {}) },
      workspace: { ...state.data.workspace, ...(next.workspace || {}) },
    },
  };
  emit();
}

/**
 * Global-cached hook. Every caller shares the same request + state. Mutations
 * via refreshUserProfile / setUserProfileOptimistic propagate to every mount.
 */
export function useUserProfile(): State {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (state.status === "idle") void refreshUserProfile();
  }, []);
  return snap;
}
