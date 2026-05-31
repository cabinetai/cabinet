"use client";

import type { DispatchedAction, PendingAction } from "@/types/actions";
import { PendingActionsPanel } from "./pending-actions-panel";

interface ApprovalPanelMeta {
  id: string;
  cabinetPath?: string;
  pendingActions?: PendingAction[];
  dispatchedActions?: DispatchedAction[];
  /** Parent conversation's provider — used to scope the per-row model/effort
   *  picker. Child sub-tasks inherit compatible runtime from the parent. */
  providerId?: string;
  adapterType?: string;
}

/**
 * Shared wrapper around PendingActionsPanel. Kept deliberately thin so both
 * conversation UIs (ConversationResultView / ConversationLiveView in the
 * agents workspace, and TaskConversationPage in the task viewer) mount the
 * same approval UX. When adding features to the dispatch-approval flow,
 * extend this file so both views pick up the change.
 */
export function ConversationApprovalPanel({
  meta,
  onApproved,
}: {
  meta: ApprovalPanelMeta;
  onApproved?: () => Promise<void> | void;
}) {
  if (!meta.pendingActions?.length && !meta.dispatchedActions?.length) {
    return null;
  }
  return (
    <PendingActionsPanel
      conversationId={meta.id}
      cabinetPath={meta.cabinetPath}
      pending={meta.pendingActions || []}
      dispatched={meta.dispatchedActions}
      parentProviderId={meta.providerId}
      parentAdapterType={meta.adapterType}
      onRefresh={onApproved ? () => void onApproved() : undefined}
    />
  );
}
