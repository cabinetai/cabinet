"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CompactOrgChart } from "@/components/cabinets/compact-org-chart";
import type {
  CabinetAgentSummary,
  CabinetJobSummary,
  CabinetOverview,
} from "@/types/cabinets";

export function OrgChartModal({
  open,
  onOpenChange,
  cabinetName,
  agents,
  jobs,
  childCabinets,
  onAgentClick,
  onAgentSend,
  onChildCabinetClick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cabinetName: string;
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  childCabinets: CabinetOverview["children"];
  onAgentClick: (agent: CabinetAgentSummary) => void;
  onAgentSend: (agent: CabinetAgentSummary) => void;
  onChildCabinetClick: (child: CabinetOverview["children"][number]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-h-none w-[96vw] max-w-none overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border/70 px-6 py-4">
          <DialogTitle className="text-[14px] font-semibold tracking-tight">
            {cabinetName} — org chart
          </DialogTitle>
        </DialogHeader>
        <div className="h-[calc(92vh-64px)] overflow-auto px-6 py-8">
          <CompactOrgChart
            cabinetName={cabinetName}
            agents={agents}
            jobs={jobs}
            childCabinets={childCabinets}
            onAgentClick={onAgentClick}
            onAgentSend={onAgentSend}
            onChildCabinetClick={onChildCabinetClick}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
