"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCabinetsStore } from "@/stores/cabinets-store";

interface NewRootCabinetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Minimal "create a cabinet" dialog. A root cabinet is a folder under the data
 * folder; the name the user types becomes the folder name (sanitized
 * server-side) and the cabinet's display name. Creating a cabinet does NOT switch
 * to it — that's an explicit, restart-triggering action in the switcher.
 */
export function NewRootCabinetDialog({ open, onOpenChange }: NewRootCabinetDialogProps) {
  const create = useCabinetsStore((s) => s.create);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const created = await create(trimmed);
    setBusy(false);
    if (!created) {
      setError("Could not create that cabinet. Try a different name.");
      return;
    }
    setName("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New cabinet</DialogTitle>
          <DialogDescription>
            A root cabinet is an isolated workspace with its own rooms, agents, and
            chats. Bookmarks are shared across all cabinets.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
          placeholder="Cabinet name"
          disabled={busy}
        />
        {error && <p className="text-[12px] text-red-500">{error}</p>}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
