"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Blocks, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { useLocale } from "@/i18n/use-locale";
import { showError } from "@/lib/ui/toast";

interface Extension {
  id: string;
  name: string;
  version: string;
  path: string;
  description: string;
  enabled?: boolean;
  iconDataUrl?: string | null;
  popupHtml?: string | null;
}

export function ExtensionsSection() {
  const { t } = useLocale();
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [extensionUrlOrId, setExtensionUrlOrId] = useState("");

  const loadExtensions = async () => {
    try {
      if (typeof window !== "undefined" && (window as any).CabinetDesktop) {
        const desktop = (window as any).CabinetDesktop;
        if (desktop.getExtensions) {
          const list = await desktop.getExtensions();
          setExtensions(list || []);
        }
      }
    } catch (e) {
      console.error("Failed to load extensions", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExtensions();

    if (typeof window !== "undefined" && (window as any).CabinetDesktop) {
      const desktop = (window as any).CabinetDesktop;
      if (desktop.onExtensionInstalled) {
        const unsub = desktop.onExtensionInstalled((ext: Extension) => {
          setExtensions((prev) => {
            const index = prev.findIndex((e) => e.id === ext.id);
            if (index >= 0) {
              const next = [...prev];
              next[index] = ext;
              return next;
            }
            return [...prev, ext];
          });
          window.dispatchEvent(
            new CustomEvent("cabinet:toast", {
              detail: {
                kind: "success",
                message: `Extension installed: ${ext.name}`,
              },
            })
          );
        });
        return unsub;
      }
    }
  }, []);

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = extensionUrlOrId.trim();
    if (!val) return;

    setInstalling(true);
    try {
      if (typeof window !== "undefined" && (window as any).CabinetDesktop) {
        const desktop = (window as any).CabinetDesktop;
        const res = await desktop.installExtension(val);
        if (res.ok) {
          setExtensionUrlOrId("");
          await loadExtensions();
          window.dispatchEvent(
            new CustomEvent("cabinet:toast", {
              detail: {
                kind: "success",
                message: `Extension installed: ${res.extension.name}`,
              },
            })
          );
        } else {
          showError("Failed to install extension: " + res.error);
        }
      }
    } catch (e: any) {
      showError(e.message || "Failed to install extension");
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async (id: string) => {
    try {
      if (typeof window !== "undefined" && (window as any).CabinetDesktop) {
        const desktop = (window as any).CabinetDesktop;
        const res = await desktop.uninstallExtension(id);
        if (res.ok) {
          setExtensions((prev) => prev.filter((ext) => ext.id !== id));
        } else {
          showError("Failed to uninstall extension: " + res.error);
        }
      }
    } catch (e: any) {
      showError(e.message || "Failed to uninstall extension");
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      if (typeof window !== "undefined" && (window as any).CabinetDesktop) {
        const desktop = (window as any).CabinetDesktop;
        const res = await desktop.toggleExtension(id, enabled);
        if (res.ok) {
          setExtensions((prev) =>
            prev.map((ext) => (ext.id === id ? { ...ext, enabled } : ext))
          );
        } else {
          showError("Failed to toggle extension: " + res.error);
        }
      }
    } catch (e: any) {
      showError(e.message || "Failed to toggle extension");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border p-5 shadow-sm">
        <h3 className="text-[13px] font-semibold mb-1 flex items-center gap-2">
          <Blocks className="w-4 h-4" />
          Add Chrome Extension
        </h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Install an extension from the Chrome Web Store. Paste the extension URL or ID below. You can also install directly by browsing the Chrome Web Store in Cabinet.
        </p>
        <form onSubmit={handleInstall} className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="e.g. https://chromewebstore.google.com/detail/... or Extension ID"
            value={extensionUrlOrId}
            onChange={(e) => setExtensionUrlOrId(e.target.value)}
            disabled={installing}
          />
          <Button type="submit" disabled={installing || !extensionUrlOrId.trim()}>
            {installing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Install
          </Button>
        </form>
      </div>

      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">Installed Extensions</h3>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : extensions.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-muted-foreground">
              No extensions installed.
            </div>
          ) : (
            extensions.map((ext) => (
              <div key={ext.id} className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 bg-muted rounded flex items-center justify-center shrink-0 overflow-hidden">
                  {ext.iconDataUrl ? (
                    <img src={ext.iconDataUrl} alt="" className="w-8 h-8 object-contain" />
                  ) : (
                    <Blocks className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-semibold flex items-center gap-2">
                    {ext.name}
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      v{ext.version}
                    </span>
                  </h4>
                  <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">
                    {ext.description || "No description provided."}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                    ID: {ext.id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={ext.enabled !== false}
                    onCheckedChange={(checked) => handleToggle(ext.id, checked)}
                    title={ext.enabled !== false ? "Disable extension" : "Enable extension"}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleUninstall(ext.id)}
                    title="Remove extension"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
