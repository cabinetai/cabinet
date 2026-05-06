import type { OptaleIdentitySnapshot } from "@/lib/optale/identity-shared";
import { AgentsSurface } from "./agents-surface";
import { ConsoleBrainSurface } from "./brain-surface";
import { CommandSurface } from "./command-surface";
import { ObjectsSurface } from "./objects-surface";
import { ObservatorySurface } from "./observatory-surface";
import type { ConsoleModuleId } from "./types";

export function ConsoleModuleSurface({
  moduleId,
  subpage,
  identity,
}: {
  moduleId: ConsoleModuleId;
  subpage: string;
  identity: OptaleIdentitySnapshot | null;
}) {
  if (moduleId === "command") {
    return <CommandSurface subpage={subpage} identity={identity} />;
  }
  if (moduleId === "objects") {
    return <ObjectsSurface subpage={subpage} />;
  }
  if (moduleId === "agents") {
    return <AgentsSurface subpage={subpage} />;
  }
  if (moduleId === "brain") {
    return <ConsoleBrainSurface subpage={subpage} identity={identity} />;
  }
  if (moduleId === "observatory") {
    return <ObservatorySurface subpage={subpage} />;
  }
  return null;
}
