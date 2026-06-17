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
import { useVaultsStore } from "@/stores/vaults-store";

interface NewVaultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Minimal "create a vault" dialog. A vault is a root folder under the data
 * folder; the name the user types becomes the folder name (sanitized
 * server-side) and the vault's display name. Creating a vault does NOT switch
 * to it — that's an explicit, restart-triggering action in the switcher.
 */
export function NewVaultDialog({ open, onOpenChange }: NewVaultDialogProps) {
  const create = useVaultsStore((s) => s.create);
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
      setError("Could not create that vault. Try a different name.");
      return;
    }
    setName("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New vault</DialogTitle>
          <DialogDescription>
            A vault is an isolated workspace with its own cabinets, agents, and
            chats. Bookmarks are shared across all vaults.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
          placeholder="Vault name"
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
