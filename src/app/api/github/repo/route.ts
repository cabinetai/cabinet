import { NextResponse } from "next/server";

const GITHUB_API_URL = "https://api.github.com/repos/hilash/cabinet";
const GITHUB_REPO_URL = "https://github.com/hilash/cabinet";

export async function GET() {
  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "cabinet-app",
      },
      next: { revalidate: 1800 },
    });

    if (!res.ok) {
      throw new Error(`GitHub API returned ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json({
      // Returning null (instead of a fake fallback) lets the client render
      // the no-number "Star" placeholder rather than briefly displaying a
      // stale count that doesn't reflect reality.
      stars:
        typeof data.stargazers_count === "number"
          ? data.stargazers_count
          : null,
      url: typeof data.html_url === "string" ? data.html_url : GITHUB_REPO_URL,
    });
  } catch {
    return NextResponse.json({
      stars: null,
      url: GITHUB_REPO_URL,
    });
  }
}
