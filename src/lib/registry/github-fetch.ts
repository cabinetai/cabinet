import fs from "fs/promises";
import path from "path";

const REPO_OWNER = "hilash";
const REPO_NAME = "cabinets";
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/HEAD`;

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

interface TreeResponse {
  tree: TreeEntry[];
  truncated: boolean;
}

// In-process tree cache. The full tree is heavy (one API call costs one
// request out of the 60/hour unauthenticated budget). We reuse it across
// imports within a short window so a user importing multiple cabinets
// back-to-back doesn't burn through rate limit.
const TREE_TTL_MS = 10 * 60 * 1000;
let cachedTree: { data: TreeResponse; expires: number } | null = null;

async function ghFetch(url: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Cabinet-App",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { headers });
}

async function fetchRepoTree(): Promise<TreeResponse> {
  if (cachedTree && cachedTree.expires > Date.now()) {
    return cachedTree.data;
  }

  const res = await ghFetch(`${API_BASE}/git/trees/HEAD?recursive=1`);
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      const tokenHint = process.env.GITHUB_TOKEN
        ? ""
        : " Set a GITHUB_TOKEN env var to raise the limit from 60/hr to 5000/hr.";
      throw new Error(
        `GitHub rate limit hit (HTTP ${res.status}). Try again in a few minutes.${tokenHint}`
      );
    }
    throw new Error(`GitHub API error ${res.status}: failed to fetch repo tree`);
  }

  const data = (await res.json()) as TreeResponse;
  cachedTree = { data, expires: Date.now() + TREE_TTL_MS };
  return data;
}

/**
 * Fetch the full recursive tree for the repo in a single API call,
 * then filter to the requested slug prefix.
 * Downloads files via raw.githubusercontent.com (no API rate limit).
 */
export async function downloadRegistryTemplate(
  slug: string,
  targetDir: string
): Promise<void> {
  // 1. Get the full repo tree (cached across calls)
  const treeData = await fetchRepoTree();

  const prefix = `${slug}/`;
  const files = treeData.tree.filter(
    (e) => e.type === "blob" && e.path.startsWith(prefix)
  );

  if (files.length === 0) {
    throw new Error(`Template "${slug}" not found in registry`);
  }

  // 2. For each file, download from raw.githubusercontent.com and write locally.
  //    On any failure, tear down the target directory so callers can retry
  //    without hitting the "already exists" guard in the import route.
  await fs.mkdir(targetDir, { recursive: true });

  try {
    for (const entry of files) {
      // Relative path within the template (strip the slug/ prefix)
      const relPath = entry.path.slice(prefix.length);
      const localPath = path.join(targetDir, relPath);

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(localPath), { recursive: true });

      const rawUrl = `${RAW_BASE}/${encodeURIComponent(slug)}/${relPath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;

      const fileRes = await fetch(rawUrl);
      if (!fileRes.ok) {
        throw new Error(`Download failed (${fileRes.status}): ${entry.path}`);
      }

      // Write as buffer to handle binary files (images, etc.)
      const buf = Buffer.from(await fileRes.arrayBuffer());
      await fs.writeFile(localPath, buf);
    }
  } catch (err) {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}
