import { NextRequest, NextResponse } from "next/server";
import yaml from "js-yaml";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { getRegistryTemplates } from "@/lib/registry/registry-manifest";

function stripWikiLinks(markdown: string): string {
  // [[path/to/page]] → last segment as plain text
  return markdown.replace(/\[\[([^\]]+)\]\]/g, (_, inner: string) => {
    const segments = inner.split("/");
    return segments[segments.length - 1];
  });
}

async function markdownToHtml(markdown: string): Promise<string> {
  const cleaned = stripWikiLinks(markdown);
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(cleaned);
  return String(result);
}

const REPO_OWNER = "hilash";
const REPO_NAME = "cabinets";
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

interface GitHubEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

async function ghFetch(url: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Cabinet-App",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { headers, next: { revalidate: 300 } });
}

async function fetchFile(downloadUrl: string): Promise<string> {
  const res = await fetch(downloadUrl, { next: { revalidate: 300 } });
  if (!res.ok) return "";
  return res.text();
}

async function listDir(repoPath: string): Promise<GitHubEntry[]> {
  const res = await ghFetch(`${API_BASE}/${repoPath}`);
  if (!res.ok) return [];
  return res.json();
}

interface AgentInfo {
  name: string;
  slug: string;
  emoji: string;
  type: string;
  department: string;
  role: string;
  heartbeat: string;
}

interface JobInfo {
  id: string;
  name: string;
  description: string;
  ownerAgent: string;
  enabled: boolean;
  schedule: string;
}

interface ChildInfo {
  path: string;
  name: string;
  agents: AgentInfo[];
  jobs: JobInfo[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAgent(raw: string, fallbackSlug: string): AgentInfo | null {
  try {
    const { data } = matter(raw);
    return {
      name: data.name || fallbackSlug,
      slug: data.slug || fallbackSlug,
      emoji: data.emoji || "",
      type: data.type || "specialist",
      department: data.department || "",
      role: data.role || "",
      heartbeat: data.heartbeat || "",
    };
  } catch {
    return null;
  }
}

function parseJob(raw: string): JobInfo | null {
  try {
    const data = yaml.load(raw) as Record<string, unknown>;
    if (!data?.id) return null;
    return {
      id: data.id as string,
      name: (data.name as string) || "",
      description: (data.description as string) || "",
      ownerAgent: (data.ownerAgent as string) || "",
      enabled: data.enabled !== false,
      schedule: (data.schedule as string) || "",
    };
  } catch {
    return null;
  }
}

async function fetchAgents(basePath: string): Promise<AgentInfo[]> {
  const entries = await listDir(`${basePath}/.agents`);
  const agents: AgentInfo[] = [];
  for (const entry of entries) {
    if (entry.type !== "dir") continue;
    const files = await listDir(entry.path);
    const persona = files.find((f) => f.name === "persona.md");
    if (!persona?.download_url) continue;
    const raw = await fetchFile(persona.download_url);
    const agent = parseAgent(raw, entry.name);
    if (agent) agents.push(agent);
  }
  return agents;
}

async function fetchJobs(basePath: string): Promise<JobInfo[]> {
  const entries = await listDir(`${basePath}/.jobs`);
  const jobs: JobInfo[] = [];
  for (const entry of entries) {
    if (entry.type !== "file" || (!entry.name.endsWith(".yaml") && !entry.name.endsWith(".yml"))) continue;
    if (!entry.download_url) continue;
    const raw = await fetchFile(entry.download_url);
    const job = parseJob(raw);
    if (job) jobs.push(job);
  }
  return jobs;
}

async function findChildCabinets(basePath: string, rootPath: string): Promise<ChildInfo[]> {
  const children: ChildInfo[] = [];
  const entries = await listDir(basePath);
  for (const entry of entries) {
    if (entry.type !== "dir" || entry.name.startsWith(".")) continue;
    const childFiles = await listDir(entry.path);
    const hasCabinet = childFiles.some((f) => f.name === ".cabinet");
    if (hasCabinet) {
      const cabinetFile = childFiles.find((f) => f.name === ".cabinet");
      let childName = entry.name;
      if (cabinetFile?.download_url) {
        const raw = await fetchFile(cabinetFile.download_url);
        try {
          const meta = yaml.load(raw) as Record<string, unknown>;
          if (meta?.name) childName = meta.name as string;
        } catch { /* use dir name */ }
      }
      const agents = await fetchAgents(entry.path);
      const jobs = await fetchJobs(entry.path);
      const relPath = entry.path.replace(`${rootPath}/`, "");
      children.push({ path: relPath, name: childName, agents, jobs });
      // Recurse
      const deeper = await findChildCabinets(entry.path, rootPath);
      children.push(...deeper);
    } else {
      const deeper = await findChildCabinets(entry.path, rootPath);
      children.push(...deeper);
    }
  }
  return children;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const templates = await getRegistryTemplates();
  const template = templates.find((t) => t.slug === slug);
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const basePath = slug;

    // Fetch cabinet manifest
    const cabinetEntries = await listDir(basePath);
    const cabinetFile = cabinetEntries.find((f) => f.name === ".cabinet");
    let meta = { name: template.name, description: template.description, version: "0.1.0" };
    if (cabinetFile?.download_url) {
      const raw = await fetchFile(cabinetFile.download_url);
      try {
        const parsed = yaml.load(raw) as Record<string, unknown>;
        meta = {
          name: (parsed.name as string) || template.name,
          description: (parsed.description as string) || template.description,
          version: (parsed.version as string) || "0.1.0",
        };
      } catch { /* fallback */ }
    }

    // Fetch readme
    const indexFile = cabinetEntries.find((f) => f.name === "index.md");
    let readme = "";
    let readmeHtml = "";
    let tags: string[] = [];
    if (indexFile?.download_url) {
      const raw = await fetchFile(indexFile.download_url);
      const { data, content } = matter(raw);
      readme = content.trim();
      tags = (data.tags as string[]) || [];
      if (readme) readmeHtml = await markdownToHtml(readme);
    }

    // Fetch agents, jobs, children
    const [agents, jobs, children] = await Promise.all([
      fetchAgents(basePath),
      fetchJobs(basePath),
      findChildCabinets(basePath, basePath),
    ]);

    const totalAgents = agents.length + children.reduce((s, c) => s + c.agents.length, 0);
    const totalJobs = jobs.length + children.reduce((s, c) => s + c.jobs.length, 0);

    return NextResponse.json({
      slug,
      meta,
      agents,
      jobs,
      children,
      readme,
      readmeHtml,
      tags,
      domain: template.domain,
      coverUrl: template.coverUrl,
      stats: {
        totalAgents,
        totalJobs,
        totalCabinets: 1 + children.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
