"use client";

import { createContext, useContext } from "react";
import { useTaskRailData, type TaskRailData } from "./use-task-rail-data";

const TaskRailContext = createContext<TaskRailData | null>(null);

/**
 * Mounts the rail data hook exactly once and shares it with both the rail
 * itself and the status-bar toggle button. Without this they'd each open
 * their own conversation SSE connection.
 */
export function TaskRailProvider({ children }: { children: React.ReactNode }) {
  const data = useTaskRailData();
  return (
    <TaskRailContext.Provider value={data}>
      {children}
    </TaskRailContext.Provider>
  );
}

export function useTaskRail(): TaskRailData {
  const ctx = useContext(TaskRailContext);
  if (!ctx) {
    throw new Error("useTaskRail must be used within <TaskRailProvider>");
  }
  return ctx;
}
