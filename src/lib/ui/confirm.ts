export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface ConfirmEventDetail extends ConfirmOptions {
  resolve: (accepted: boolean) => void;
}

export const CONFIRM_EVENT = "cabinet:confirm-dialog";

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const detail: ConfirmEventDetail = { ...options, resolve };
    window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, { detail }));
  });
}

export type { ConfirmEventDetail };
