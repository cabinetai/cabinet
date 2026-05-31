import fs from "fs";
import os from "os";
import path from "path";
import { agentAdapterRegistry } from "./registry";
import type { AgentExecutionAdapter } from "./types";

interface AdapterPluginEntry {
  package?: string;
  path?: string;
  enabled?: boolean;
  type?: string;
}

interface AdapterPluginConfig {
  plugins?: AdapterPluginEntry[];
}

interface LoadedPlugin {
  id: string;
  adapter: AgentExecutionAdapter;
}

const PLUGIN_CONFIG_PATH = path.join(
  os.homedir() || process.env.HOME || "/tmp",
  ".cabinet",
  "adapter-plugins.json"
);

let loadedPlugins: LoadedPlugin[] = [];
let loadPromise: Promise<LoadedPlugin[]> | null = null;

function readConfig(): AdapterPluginConfig {
  try {
    if (!fs.existsSync(PLUGIN_CONFIG_PATH)) return {};
    const raw = fs.readFileSync(PLUGIN_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as AdapterPluginConfig;
  } catch (err) {
    console.warn(
      `[cabinet] Failed to read adapter plugin config at ${PLUGIN_CONFIG_PATH}:`,
      err instanceof Error ? err.message : err
    );
    return {};
  }
}

async function importPluginModule(entry: AdapterPluginEntry): Promise<unknown | null> {
  const specifier = entry.path || entry.package;
  if (!specifier) return null;

  const resolved = entry.path
    ? path.isAbsolute(entry.path)
      ? entry.path
      : path.resolve(process.cwd(), entry.path)
    : specifier;

  try {
    return await import(resolved);
  } catch (err) {
    console.warn(
      `[cabinet] Failed to import adapter plugin "${specifier}":`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function extractAdapter(module: unknown): AgentExecutionAdapter | null {
  if (!module || typeof module !== "object") return null;
  const mod = module as Record<string, unknown>;

  const factory = mod.createAgentAdapter || mod.createServerAdapter;
  if (typeof factory === "function") {
    try {
      const adapter = (factory as () => unknown)();
      if (adapter && typeof adapter === "object" && typeof (adapter as AgentExecutionAdapter).type === "string") {
        return adapter as AgentExecutionAdapter;
      }
    } catch (err) {
      console.warn(
        "[cabinet] adapter plugin factory threw:",
        err instanceof Error ? err.message : err
      );
    }
  }

  const direct = mod.default || mod.adapter;
  if (direct && typeof direct === "object" && typeof (direct as AgentExecutionAdapter).type === "string") {
    return direct as AgentExecutionAdapter;
  }

  return null;
}

export async function loadExternalAdapters(): Promise<LoadedPlugin[]> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const config = readConfig();
    const entries = Array.isArray(config.plugins) ? config.plugins : [];
    const loaded: LoadedPlugin[] = [];

    for (const entry of entries) {
      if (!entry || entry.enabled === false) continue;

      const module = await importPluginModule(entry);
      const adapter = extractAdapter(module);
      if (!adapter) {
        console.warn(
          `[cabinet] Adapter plugin "${entry.package || entry.path}" did not export a valid adapter.`
        );
        continue;
      }
      if (entry.type && adapter.type !== entry.type) {
        console.warn(
          `[cabinet] Adapter plugin "${entry.package || entry.path}" type mismatch: expected ${entry.type}, got ${adapter.type}`
        );
      }
      agentAdapterRegistry.registerExternal(adapter);
      loaded.push({ id: entry.package || entry.path || adapter.type, adapter });
      console.log(
        `[cabinet] Registered adapter plugin "${adapter.type}" from ${entry.package || entry.path}`
      );
    }

    loadedPlugins = loaded;
    return loaded;
  })();
  return loadPromise;
}

export async function waitForExternalAdapters(): Promise<LoadedPlugin[]> {
  return loadExternalAdapters();
}

export function getLoadedPlugins(): LoadedPlugin[] {
  return [...loadedPlugins];
}

export function unloadExternalAdapters(): void {
  for (const plugin of loadedPlugins) {
    agentAdapterRegistry.unregisterExternal(plugin.adapter.type);
  }
  loadedPlugins = [];
  loadPromise = null;
}

export { PLUGIN_CONFIG_PATH };
