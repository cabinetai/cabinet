import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import yaml from "js-yaml";
import matter from "gray-matter";
import { DATA_DIR, sanitizeFilename } from "@/lib/storage/path-utils";
import { scaffoldCabinet } from "@/lib/storage/cabinet-scaffold";
import { updateRoomMeta } from "@/lib/cabinets/rooms";
import {
  getMandatoryAgentSlugs,
  resolveAgentLibraryDir,
} from "@/lib/agents/library-manager";
import { ensureAgentScaffold } from "@/lib/agents/scaffold";
import { getRoomConfig, type RoomType } from "@/lib/onboarding/rooms";

// Global, app-level config stays at the data-dir root (the "home" container) so
// onboarding detection (/api/agents/config) and provider/user config survive
// regardless of which room you're in. Per-room things (cabinet, agents, chat)
// live INSIDE the room (Rooms v3 — every room is an isolated sibling cabinet).
const CONFIG_DIR = path.join(DATA_DIR, ".agents", ".config");

// Map an onboarding room type to a switcher icon key + accent color so the
// first room gets a real avatar (mirrors ROOM_ICON_KEYS / ROOM_COLORS).
const ROOM_TYPE_ICON: Record<string, string> = {
  office: "briefcase",
  sales: "rocket",
  hr: "family",
  product: "building",
  rnd: "studio",
  study: "study",
  lab: "lab",
  "family-room": "family",
  blank: "sparkles",
};
const ROOM_TYPE_COLOR: Record<string, string> = {
  office: "rgb(99, 102, 241)",
  sales: "rgb(236, 72, 153)",
  hr: "rgb(34, 197, 94)",
  product: "rgb(14, 165, 233)",
  rnd: "rgb(168, 85, 247)",
  study: "rgb(245, 158, 11)",
  lab: "rgb(20, 184, 166)",
  "family-room": "rgb(249, 115, 22)",
  blank: "rgb(99, 102, 241)",
};

interface OnboardingRequest {
  homeName?: string;
  roomType?: RoomType;
  answers: {
    name?: string;
    email?: string;
    // New field; falls back to legacy companyName if absent.
    workspaceName?: string;
    companyName?: string;
    description: string;
    goals?: string;
    teamSize: string;
    priority?: string;
  };
  selectedAgents: string[];
  /** The single agent the user configured from scratch in the team step. */
  firstAgent?: {
    name?: string;
    role?: string;
    instructions?: string;
    provider?: string;
    /** Cron expression for the agent's heartbeat (empty/omitted = none). */
    heartbeat?: string;
    /** Whether the heartbeat is active (defaults to false). */
    heartbeatEnabled?: boolean;
  };
  locale?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as OnboardingRequest;
    const { answers } = body;
    const roomType: RoomType = body.roomType || "office";
    const roomConfig = getRoomConfig(roomType);
    const workspaceName =
      answers.workspaceName?.trim() || answers.companyName?.trim() || "My Cabinet";
    const homeName =
      body.homeName?.trim() || (answers.name ? `${answers.name}'s Home` : "Home");

    // The first room is a real, isolated top-level cabinet: data/<roomSlug>/.
    const roomSlug =
      sanitizeFilename(workspaceName) ||
      sanitizeFilename(roomConfig.label) ||
      "home";
    const roomDir = path.join(DATA_DIR, roomSlug);
    const ROOM_AGENTS_DIR = path.join(roomDir, ".agents");
    const ROOM_CHAT_DIR = path.join(roomDir, ".chat");

    // No pre-made team: create exactly the agents the user chose (which is
    // none during onboarding now — the user configures their first agent in the
    // wizard, created separately via /api/agents/personas). We no longer force
    // the room's mandatory agents.
    const selectedAgents = Array.isArray(body.selectedAgents)
      ? body.selectedAgents
      : [];
    const mandatorySlugs = getMandatoryAgentSlugs(roomType);
    const libraryDir = await resolveAgentLibraryDir();

    if (!libraryDir) {
      return NextResponse.json(
        { error: "Agent library is unavailable" },
        { status: 500 }
      );
    }

    // 1. Save workspace config (v2 shape, forward-compatible with multi-room).
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const workspaceConfig = {
      exists: true,
      version: 2,
      home: { name: homeName },
      room: {
        id: `${roomType}-01`,
        type: roomType,
        name: roomConfig.label,
        slug: roomSlug,
      },
      cabinet: {
        name: workspaceName,
        description: answers.description,
        size: answers.teamSize || "",
      },
      setupDate: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(CONFIG_DIR, "workspace.json"),
      JSON.stringify(workspaceConfig, null, 2)
    );

    // Persist the user's profile name so the greeting and the starter-task
    // placeholder use what they typed in onboarding. Without this, an early
    // profile read during the wizard seeds user.json from the OS username
    // (os.userInfo().username) and that stale value sticks afterwards.
    const profileName = answers.name?.trim() || "";
    const profileEmail = answers.email?.trim() || "";
    if (profileName || profileEmail) {
      await fs.writeFile(
        path.join(CONFIG_DIR, "user.json"),
        JSON.stringify(
          {
            name: profileName,
            email: profileEmail,
            displayName: "",
            role: "",
            avatar: "",
          },
          null,
          2
        )
      );
    }

    // Legacy company.json — keeps old code paths working (config route fallback, etc.)
    await fs.writeFile(
      path.join(CONFIG_DIR, "company.json"),
      JSON.stringify(
        {
          exists: true,
          company: {
            name: workspaceName,
            description: answers.description,
            goals: answers.goals || "",
            teamSize: answers.teamSize,
            priority: answers.priority || "",
          },
          setupDate: workspaceConfig.setupDate,
        },
        null,
        2
      )
    );

    // 2. Scaffold the first ROOM as an isolated top-level cabinet (data/<slug>/),
    //    not the data-dir root. The root stays a neutral "home" container.
    await scaffoldCabinet(roomDir, {
      name: workspaceName,
      kind: "room",
      description: answers.description,
      body: answers.description,
      tags: [roomType],
      skipExisting: true,
      locale: body.locale,
    });
    // Give the room an avatar (icon + accent color) so the switcher tile reads.
    await updateRoomMeta(roomSlug, {
      icon: ROOM_TYPE_ICON[roomType] ?? "briefcase",
      color: ROOM_TYPE_COLOR[roomType] ?? "rgb(99, 102, 241)",
    }).catch(() => {});

    // Mark data/ as the neutral home container: a thin kind:home manifest keeps
    // "." a valid (empty) scope, and home.json records the default room so the
    // app lands inside it on launch.
    await fs.writeFile(
      path.join(DATA_DIR, ".cabinet"),
      yaml.dump(
        {
          schemaVersion: 1,
          id: "home",
          name: homeName,
          kind: "home",
          version: "0.1.0",
          description: "Cabinet home (room container).",
          entry: "index.md",
          room: { icon: "home" },
        },
        { lineWidth: -1 }
      ),
      "utf-8"
    ).catch(() => {});
    await fs.mkdir(path.join(DATA_DIR, ".home"), { recursive: true });
    await fs.writeFile(
      path.join(DATA_DIR, ".home", "home.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          kind: "home",
          defaultRoom: roomSlug,
          lastActiveRoom: roomSlug,
        },
        null,
        2
      )
    );

    // 3. Mark onboarding as complete
    await fs.writeFile(
      path.join(CONFIG_DIR, "onboarding-complete.json"),
      JSON.stringify({ completed: true, date: new Date().toISOString() })
    );

    // Also write the old-format config so existing config check works
    await fs.writeFile(
      path.join(CONFIG_DIR, "../.config.json"),
      JSON.stringify({ exists: true })
    ).catch(() => {});

    // 4. Instantiate selected agents from library templates. Always include
    //    "editor": it's the canonical doer that the composer / task board
    //    default to. Without it, a fresh room (which otherwise only gets the
    //    user's first agent) dispatches tasks to a non-existent "editor" and
    //    they fail. The first agent (step 4b) is created separately.
    const agentsToInstall = Array.from(new Set([...selectedAgents, "editor"]));
    for (const slug of agentsToInstall) {
      const templateDir = path.join(libraryDir, slug);
      const targetDir = path.join(ROOM_AGENTS_DIR, slug);

      try {
        await fs.access(templateDir);
      } catch {
        if (mandatorySlugs.includes(slug)) {
          return NextResponse.json(
            { error: `Required agent template "${slug}" is unavailable` },
            { status: 500 }
          );
        }
        continue; // Template doesn't exist, skip
      }

      // Skip if agent already exists
      try {
        await fs.access(targetDir);
        continue;
      } catch {
        // Good, doesn't exist
      }

      // Copy template
      await copyDir(templateDir, targetDir);
      await ensureAgentScaffold(targetDir);

      // Inject context into persona.md. Substitutes both variable families so
      // new personas (using workspace_*) and legacy ones (using company_*) both work.
      const personaPath = path.join(targetDir, "persona.md");
      try {
        const raw = await fs.readFile(personaPath, "utf-8");
        const injected = raw
          .replace(/\{\{company_name\}\}/g, workspaceName)
          .replace(/\{\{workspace_name\}\}/g, workspaceName)
          .replace(/\{\{company_description\}\}/g, answers.description || "")
          .replace(/\{\{workspace_description\}\}/g, answers.description || "")
          .replace(/\{\{home_name\}\}/g, homeName)
          .replace(/\{\{goals\}\}/g, answers.goals || answers.priority || "");
        await fs.writeFile(personaPath, injected);
      } catch {
        // Ignore injection errors
      }
    }

    // 4b. Create the user's first agent (configured from scratch in the team
    // step). We write persona.md directly — like the library templates above —
    // so it doesn't depend on a configured provider (the user may skip provider
    // setup). The agent simply won't run until a provider is connected.
    let firstAgentSlug = "";
    const firstAgent = body.firstAgent;
    if (firstAgent && typeof firstAgent.name === "string" && firstAgent.name.trim()) {
      const agentName = firstAgent.name.trim();
      const slug =
        agentName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") ||
        "agent";
      const agentDir = path.join(ROOM_AGENTS_DIR, slug);
      let exists = false;
      try {
        await fs.access(agentDir);
        exists = true;
      } catch {
        // Doesn't exist yet — good.
      }
      if (!exists) {
        await fs.mkdir(agentDir, { recursive: true });
        const personaBody =
          (firstAgent.instructions || "").trim() || `You are ${agentName}.`;
        const personaMd = matter.stringify(`\n${personaBody}\n`, {
          name: agentName,
          slug,
          emoji: "🤖",
          type: "specialist",
          role: (firstAgent.role || "").trim(),
          provider: firstAgent.provider?.trim() || "claude-code",
          heartbeat: firstAgent.heartbeat?.trim() || "",
          heartbeatEnabled: firstAgent.heartbeatEnabled === true,
          budget: 100,
          active: true,
          workdir: "/data",
          workspace: "/",
          channels: ["general"],
          focus: [],
        });
        await fs.writeFile(path.join(agentDir, "persona.md"), personaMd);
        await ensureAgentScaffold(agentDir);
        firstAgentSlug = slug;
      }
    }

    // 5. Create chat channels from all agent channel references (inside the room)
    await fs.mkdir(ROOM_CHAT_DIR, { recursive: true });

    // Collect all channels referenced by agents + map members
    const channelMembers = new Map<string, Set<string>>();
    // Always create #general with the created agents.
    channelMembers.set(
      "general",
      new Set(firstAgentSlug ? [...selectedAgents, firstAgentSlug] : selectedAgents)
    );

    for (const slug of selectedAgents) {
      try {
        const personaPath = path.join(ROOM_AGENTS_DIR, slug, "persona.md");
        const raw = await fs.readFile(personaPath, "utf-8");
        const { data } = matter(raw);
        const agentChannels = (data.channels as string[]) || [];
        for (const ch of agentChannels) {
          if (!channelMembers.has(ch)) {
            channelMembers.set(ch, new Set());
          }
          channelMembers.get(ch)!.add(slug);
        }
        // Also add leadership agents to all channels
        if (data.type === "lead") {
          for (const [, members] of channelMembers) {
            members.add(slug);
          }
        }
      } catch {
        // Skip
      }
    }

    const channelDescriptions: Record<string, string> = {
      general: "Shared space for announcements and discussion",
      leadership: "Strategic planning and goal setting",
      marketing: "Marketing campaigns, content, and SEO",
      content: "Content creation, editing, and review",
      sales: "Lead generation, outreach, and deals",
      engineering: "Technical work and code quality",
      notes: "PKM curation, links, and indexes",
      writing: "Drafting, editing, and review",
      inbox: "Email triage and drafts",
      calendar: "Scheduling and reminders",
      habits: "Habit tracking and reflection",
      tools: "Small scripts, dashboards, and plugins",
      research: "Research agenda and paper reviews",
      teaching: "Lecture prep, slides, problem sets",
      schedule: "Family calendar and logistics",
      meals: "Meal planning and grocery lists",
      kids: "Kids' schedules, activities, and projects",
      household: "Household coordination and admin",
    };

    const channels = Array.from(channelMembers.entries()).map(
      ([slug, members]) => ({
        slug,
        name: slug.charAt(0).toUpperCase() + slug.slice(1),
        members: Array.from(members),
        description:
          channelDescriptions[slug] || `${slug} channel`,
      })
    );

    await fs.writeFile(
      path.join(ROOM_CHAT_DIR, "channels.json"),
      JSON.stringify(channels, null, 2)
    );

    // Create channel directories
    for (const ch of channels) {
      const chDir = path.join(ROOM_CHAT_DIR, ch.slug);
      await fs.mkdir(chDir, { recursive: true });
      // Only create files if they don't exist (don't wipe existing messages)
      const msgPath = path.join(chDir, "messages.md");
      const pinPath = path.join(chDir, "pins.json");
      await fs.writeFile(msgPath, "", { flag: "wx" }).catch(() => {});
      await fs.writeFile(pinPath, JSON.stringify([]), { flag: "wx" }).catch(() => {});
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
