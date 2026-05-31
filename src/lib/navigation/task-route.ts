import { isRootCabinetPath, normalizeCabinetPath } from "@/lib/cabinets/paths";

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function buildTasksHash(cabinetPath?: string | null): string {
  const normalized = normalizeCabinetPath(cabinetPath, true);
  if (isRootCabinetPath(normalized)) {
    return "#/tasks";
  }
  return `#/cabinet/${encodeSegment(normalized || ".")}/tasks`;
}

export function buildTaskHash(taskId: string, cabinetPath?: string | null): string {
  return `${buildTasksHash(cabinetPath)}/${encodeSegment(taskId)}`;
}

export function buildTaskHref(taskId: string, cabinetPath?: string | null): string {
  return `/${buildTaskHash(taskId, cabinetPath)}`;
}
