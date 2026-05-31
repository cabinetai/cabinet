export type ToastKind = "info" | "success" | "error";

export function showToast(kind: ToastKind, message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("cabinet:toast", { detail: { kind, message } })
  );
}

export function showError(message: string): void {
  showToast("error", message);
}

export function showSuccess(message: string): void {
  showToast("success", message);
}

export function showInfo(message: string): void {
  showToast("info", message);
}
