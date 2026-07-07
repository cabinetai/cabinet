import fs from "fs";
import path from "path";
import os from "os";

export interface JupyterServerInfo {
  url: string;
  token: string;
  port: number;
}

export function getJupyterRuntimeDir(): string {
  const home = os.homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "jupyter", "runtime");
  } else if (process.platform === "darwin") {
    return path.join(home, "Library", "Jupyter", "runtime");
  } else {
    // Linux/other
    const xdgData = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
    return path.join(xdgData, "jupyter", "runtime");
  }
}

export async function findActiveJupyterServer(): Promise<JupyterServerInfo | null> {
  try {
    const runtimeDir = getJupyterRuntimeDir();
    if (!fs.existsSync(runtimeDir)) return null;

    const files = fs.readdirSync(runtimeDir);
    const serverFiles = files.filter(
      (f) =>
        (f.startsWith("jpserver-") || f.startsWith("nbserver-")) &&
        f.endsWith(".json")
    );

    if (serverFiles.length === 0) return null;

    // Sort by mtime descending to check the most recently modified server first
    const sortedFiles = serverFiles
      .map((f) => {
        const fullPath = path.join(runtimeDir, f);
        const stat = fs.statSync(fullPath);
        return { name: f, fullPath, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const fileObj of sortedFiles) {
      try {
        const content = fs.readFileSync(fileObj.fullPath, "utf8");
        const data = JSON.parse(content);
        if (data.url && data.token !== undefined) {
          // Verify server is actually alive by hitting /api/status
          const checkUrl = `${data.url}api/status?token=${data.token}`;
          const res = await fetch(checkUrl, { signal: AbortSignal.timeout(1000) });
          if (res.ok) {
            return {
              url: data.url,
              token: data.token,
              port: Number(data.port),
            };
          }
        }
      } catch {
        // Skip invalid/unreachable files
      }
    }
  } catch (e) {
    console.error("Error finding Jupyter server:", e);
  }
  return null;
}
