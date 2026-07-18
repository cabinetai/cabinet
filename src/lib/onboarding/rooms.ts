import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Brain,
  FlaskConical,
  Home,
  Asterisk,
  TrendingUp,
  Users,
  Package,
  Lightbulb,
} from "lucide-react";

export type RoomType =
  | "office"
  | "sales"
  | "hr"
  | "product"
  | "rnd"
  | "study"
  | "lab"
  | "family-room"
  | "blank";

export interface RoomConfig {
  id: RoomType;
  label: string;
  tagline: string;
  icon: LucideIcon;
  workspaceLabel: string;
  workspacePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  askTeamSize: boolean;
  teamSizeLabel?: string;
  // Lead + editor-equivalent. Length 0 means "no mandatory agents" (blank room).
  mandatoryAgents: readonly string[];
  suggestedAgents: string[];
  keywordMap: [RegExp, string[]][];
  departmentNoun: string;
  exampleAgents: string[];
  greetingTemplate: (homeName: string, workspaceName: string) => string;
}

export const ROOM_TYPES: RoomType[] = [
  "office",
  "sales",
  "hr",
  "product",
  "rnd",
  "study",
  "lab",
  "family-room",
  "blank",
];

export const ROOMS: Record<RoomType, RoomConfig> = {
  office: {
    id: "office",
    label: "The Office",
    tagline: "Run a business, startup, or side project.",
    icon: Briefcase,
    workspaceLabel: "Company or project name",
    workspacePlaceholder: "Acme Corp",
    descriptionLabel: "What do you do?",
    descriptionPlaceholder: "We make a podcast about AI startups",
    askTeamSize: true,
    mandatoryAgents: ["ceo", "editor"],
    suggestedAgents: ["content-marketer", "copywriter"],
    exampleAgents: ["CEO", "Editor"],
    departmentNoun: "Department",
    keywordMap: [
      [/content|blog|social|market|brand|newsletter/, ["content-marketer", "social-media", "copywriter"]],
      [/seo|search|rank|keyword|organic|google/, ["seo"]],
      [/sales|lead|outreach|revenue|pipeline|deal/, ["sales", "customer-success"]],
      [/quality|review|proofread|test|audit/, ["qa"]],
      [/tech|code|engineer|dev|infra|deploy/, ["cto", "devops"]],
      [/product|feature|roadmap|user research/, ["product-manager"]],
      [/design|ux|wireframe|prototype/, ["ux-designer"]],
      [/data|analytics|metrics|dashboard/, ["data-analyst"]],
      [/finance|budget|runway|fundraise/, ["cfo"]],
      [/growth|funnel|acquisition|conversion/, ["growth-marketer"]],
      [/research|competitive|market analysis/, ["researcher"]],
      [/legal|compliance|contract|privacy/, ["legal"]],
      [/hiring|culture|hr|onboarding|team health/, ["people-ops"]],
      [/operations|process|efficiency/, ["coo"]],
    ],
    greetingTemplate: (_home, workspace) =>
      `Good morning team! Welcome to ${workspace || "the company"}. Let's hit the ground running.`,
  },

  sales: {
    id: "sales",
    label: "Sales",
    tagline: "Pipeline, outreach, and closing deals.",
    icon: TrendingUp,
    workspaceLabel: "Team or territory name",
    workspacePlaceholder: "EMEA Sales",
    descriptionLabel: "What are you selling, and to whom?",
    descriptionPlaceholder: "B2B SaaS to mid-market operations teams",
    askTeamSize: true,
    teamSizeLabel: "Team size",
    mandatoryAgents: ["sales", "customer-success"],
    suggestedAgents: ["sales", "researcher"],
    exampleAgents: ["Account Executive", "SDR"],
    departmentNoun: "Team",
    keywordMap: [
      [/lead|prospect|outreach|cold|sdr|sequence/, ["sales"]],
      [/deal|close|negotiat|pipeline|crm|quota/, ["sales"]],
      [/research|account|company|icp|territory/, ["researcher"]],
      [/success|onboard|renew|churn|expansion/, ["customer-success"]],
      [/email|copy|pitch|template/, ["copywriter"]],
    ],
    greetingTemplate: (_home, workspace) =>
      `Sales floor is open${workspace ? ` for ${workspace}` : ""}. Let's fill the pipeline.`,
  },

  hr: {
    id: "hr",
    label: "People & HR",
    tagline: "Hiring, onboarding, and team health.",
    icon: Users,
    workspaceLabel: "Team or org name",
    workspacePlaceholder: "Acme People Team",
    descriptionLabel: "What do you handle?",
    descriptionPlaceholder: "Hiring, onboarding, policies, and culture for 40 people",
    askTeamSize: true,
    teamSizeLabel: "Org size",
    mandatoryAgents: ["people-ops", "researcher"],
    suggestedAgents: ["people-ops", "researcher"],
    exampleAgents: ["Recruiter", "People Ops"],
    departmentNoun: "Area",
    keywordMap: [
      [/hir|recruit|candidate|interview|sourc|jd/, ["recruiter"]],
      [/onboard|culture|engagement|team health|review/, ["people-ops"]],
      [/policy|handbook|complian|legal/, ["legal"]],
      [/payroll|benefit|comp|salary/, ["people-ops"]],
    ],
    greetingTemplate: (_home, workspace) =>
      `People team online${workspace ? ` for ${workspace}` : ""}. Let's take care of the humans.`,
  },

  product: {
    id: "product",
    label: "Product",
    tagline: "Roadmap, specs, and user research.",
    icon: Package,
    workspaceLabel: "Product or team name",
    workspacePlaceholder: "Mobile App",
    descriptionLabel: "What are you building?",
    descriptionPlaceholder: "A B2C mobile app for habit tracking",
    askTeamSize: true,
    teamSizeLabel: "Team size",
    mandatoryAgents: ["product-manager", "ux-designer"],
    suggestedAgents: ["product-manager", "ux-designer", "researcher", "data-analyst"],
    exampleAgents: ["Product Manager", "UX Designer"],
    departmentNoun: "Area",
    keywordMap: [
      [/roadmap|spec|prd|feature|backlog|story/, ["product-manager"]],
      [/design|ux|ui|wireframe|prototype|figma/, ["ux-designer"]],
      [/research|user|interview|usability|persona/, ["researcher"]],
      [/data|metric|analytics|funnel|retention/, ["data-analyst"]],
    ],
    greetingTemplate: (_home, workspace) =>
      `Product desk ready${workspace ? ` for ${workspace}` : ""}. What are we shipping?`,
  },

  rnd: {
    id: "rnd",
    label: "R&D",
    tagline: "Experiments, prototypes, and technical research.",
    icon: Lightbulb,
    workspaceLabel: "Project or lab name",
    workspacePlaceholder: "Applied AI",
    descriptionLabel: "What are you exploring?",
    descriptionPlaceholder: "On-device inference and new model architectures",
    askTeamSize: false,
    mandatoryAgents: ["researcher", "cto"],
    suggestedAgents: ["researcher", "cto", "data-analyst"],
    exampleAgents: ["Research Lead", "Engineer"],
    departmentNoun: "Area",
    keywordMap: [
      [/experiment|prototype|poc|spike|trial/, ["researcher"]],
      [/paper|literature|sota|benchmark|survey/, ["lit-reviewer"]],
      [/engineer|code|build|infra|deploy/, ["cto"]],
      [/data|analysis|metric|eval|result/, ["data-analyst"]],
    ],
    greetingTemplate: (_home, workspace) =>
      `Lab bench ready${workspace ? ` for ${workspace}` : ""}. Let's run some experiments.`,
  },

  study: {
    id: "study",
    label: "Study",
    tagline: "Your second brain: writing, notes, personal assistant.",
    icon: Brain,
    workspaceLabel: "Name your cabinet",
    workspacePlaceholder: "My Study",
    descriptionLabel: "What areas of life do you want help with?",
    descriptionPlaceholder: "Writing, email triage, calendar, habit tracking",
    askTeamSize: false,
    mandatoryAgents: ["assistant", "librarian"],
    suggestedAgents: ["writing-coach", "calendar-keeper"],
    exampleAgents: ["Assistant", "Librarian"],
    departmentNoun: "Area",
    keywordMap: [
      [/writ|draft|blog|essay|copyedit|brainstorm/, ["writing-coach"]],
      [/email|inbox|reply|mail/, ["inbox-triage"]],
      [/calendar|schedul|reminder|meeting|babysit/, ["calendar-keeper"]],
      [/habit|track|streak|dashboard|log/, ["habit-tracker"]],
      [/research|learn|read|paper|topic/, ["researcher"]],
      [/plugin|script|dnd|tool|automat|tinker/, ["tinkerer"]],
      [/note|wiki|link|synthes|second brain|pkm/, ["note-synthesizer"]],
    ],
    greetingTemplate: (home, workspace) =>
      `Morning. Your second brain is online${home ? `, welcome back to ${home}` : ""}.`,
  },

  lab: {
    id: "lab",
    label: "Research Lab",
    tagline: "Academic work, literature, teaching, thesis.",
    icon: FlaskConical,
    workspaceLabel: "Workspace name",
    workspacePlaceholder: "Philosophy of Mind",
    descriptionLabel: "What's your field or what are you researching?",
    descriptionPlaceholder: "Phenomenology, consciousness, teaching Intro to Philosophy",
    askTeamSize: false,
    mandatoryAgents: ["research-lead", "librarian"],
    suggestedAgents: ["lit-reviewer", "writing-coach"],
    exampleAgents: ["Research Lead", "Librarian"],
    departmentNoun: "Area",
    keywordMap: [
      [/paper|literature|review|journal|article/, ["lit-reviewer"]],
      [/note|synthes|wiki|zettel|pkm/, ["note-synthesizer"]],
      [/teach|lecture|course|syllabus|slide|student/, ["teaching-assistant"]],
      [/writ|essay|thesis|dissertation|draft/, ["writing-coach"]],
      [/citation|bibtex|reference|bibliography/, ["citation-keeper"]],
      [/research|topic|question|hypothesis/, ["researcher"]],
    ],
    greetingTemplate: (_home, workspace) =>
      `Research desk ready${workspace ? `: "${workspace}"` : ""}. What are we digging into today?`,
  },

  "family-room": {
    id: "family-room",
    label: "Family Room",
    tagline: "Household, family calendar, meals, kids.",
    icon: Home,
    workspaceLabel: "Household name",
    workspacePlaceholder: "The Nguyen Family",
    descriptionLabel: "Who lives here and what do you juggle?",
    descriptionPlaceholder: "Two parents, three kids, two schools, one dog",
    askTeamSize: true,
    teamSizeLabel: "Household size",
    mandatoryAgents: ["home-manager", "planner"],
    suggestedAgents: ["meal-planner", "kid-coordinator"],
    exampleAgents: ["Home Manager", "Planner"],
    departmentNoun: "Area",
    keywordMap: [
      [/meal|dinner|cook|recipe|menu/, ["meal-planner"]],
      [/grocer|shop|order|instacart|amazon/, ["grocery-buyer"]],
      [/kid|child|school|homework|activit|dnd/, ["kid-coordinator"]],
      [/calendar|schedul|reminder|babysit|appoint/, ["planner"]],
      [/budget|bill|expense|money|finance/, ["budget-keeper"]],
      [/plugin|script|tool|automat|dashboard|tinker/, ["tinkerer"]],
    ],
    greetingTemplate: (home, _workspace) =>
      `Home HQ booting up${home ? `, ${home}` : ""}. Let's get everyone where they need to be.`,
  },

  blank: {
    id: "blank",
    label: "Blank Room",
    tagline: "Nothing yet. Bring your own agents, your own shape.",
    icon: Asterisk,
    workspaceLabel: "Name your cabinet",
    workspacePlaceholder: "My Cabinet",
    descriptionLabel: "What's it for?",
    descriptionPlaceholder: "Anything, or leave blank if you're not sure yet",
    askTeamSize: false,
    mandatoryAgents: ["editor"],
    suggestedAgents: [],
    exampleAgents: ["Your call"],
    departmentNoun: "Group",
    keywordMap: [],
    greetingTemplate: (home, workspace) =>
      `Blank slate${workspace ? `: "${workspace}"` : ""}. What do you want to build${home ? ` here, ${home}` : ""}?`,
  },
};

export function getRoomConfig(roomType: RoomType | string | undefined): RoomConfig {
  if (roomType && (ROOM_TYPES as string[]).includes(roomType)) {
    return ROOMS[roomType as RoomType];
  }
  return ROOMS.office;
}

export function getMandatoryAgentsForRoom(roomType: RoomType | string | undefined): readonly string[] {
  return getRoomConfig(roomType).mandatoryAgents;
}

export interface StarterTeam {
  name: string;
  description: string;
  agents: number;
  domain: string;
  rooms: RoomType[];
}

export const STARTER_TEAMS: StarterTeam[] = [
  // Office (keep existing 12)
  { name: "Content Engine", description: "Blog posts, newsletters & social media on autopilot", agents: 5, domain: "Marketing", rooms: ["office"] },
  { name: "Cold Email Agency", description: "ICP research, list building, copy & sending", agents: 7, domain: "Sales", rooms: ["office"] },
  { name: "Carousel Factory", description: "Design Instagram, LinkedIn & TikTok carousels", agents: 4, domain: "Marketing", rooms: ["office"] },
  { name: "SEO War Room", description: "Keyword research, write, optimize & rank", agents: 6, domain: "Marketing", rooms: ["office"] },
  { name: "LinkedIn Lead Gen Shop", description: "Profile optimization, connections & DM sequences", agents: 5, domain: "Sales", rooms: ["office"] },
  { name: "Podcast Booking Agency", description: "Research shows, pitch, schedule & prep talking points", agents: 6, domain: "Media", rooms: ["office"] },
  { name: "TikTok Shop Operator", description: "Product listings, affiliate outreach & live stream", agents: 8, domain: "E-commerce", rooms: ["office"] },
  { name: "Ghostwriting Studio", description: "LinkedIn posts, Twitter threads & newsletters", agents: 5, domain: "Content", rooms: ["office"] },
  { name: "PR Pitching Machine", description: "Media list, write pitches, send & track", agents: 5, domain: "Marketing", rooms: ["office"] },
  { name: "App Store Optimization", description: "Keyword research, screenshots & A/B test", agents: 5, domain: "Marketing", rooms: ["office"] },
  { name: "Shopify Store Setup", description: "Theme, products, payments & launch checklist", agents: 5, domain: "E-commerce", rooms: ["office"] },
  { name: "Proposal & RFP Factory", description: "Parse RFPs, draft responses, format & submit", agents: 6, domain: "Services", rooms: ["office"] },

  // Study
  { name: "Karpathy Wiki", description: "Personal knowledge base with AI-assisted note synthesis", agents: 4, domain: "PKM", rooms: ["study"] },
  { name: "Writing Studio", description: "Drafting, copyediting & research for writers", agents: 3, domain: "Writing", rooms: ["study"] },
  { name: "Life Admin", description: "Email triage, calendar, habits & household logistics", agents: 4, domain: "Admin", rooms: ["study"] },

  // Lab
  { name: "Literature Review Lab", description: "Read, summarize, synthesize & cite papers", agents: 4, domain: "Research", rooms: ["lab"] },
  { name: "Course Prep", description: "Syllabus, lectures, slides & problem sets", agents: 3, domain: "Teaching", rooms: ["lab"] },
  { name: "Thesis Workshop", description: "Drafting, literature, references & revisions", agents: 4, domain: "Writing", rooms: ["lab"] },

  // Family room
  { name: "Family HQ", description: "Family calendar, kids, bills & household coordination", agents: 4, domain: "Household", rooms: ["family-room"] },
  { name: "Meal & Grocery Ops", description: "Weekly menu, grocery lists & orders", agents: 3, domain: "Household", rooms: ["family-room"] },
  { name: "Kids Coordinator", description: "Schedules, activities, DnD & homework support", agents: 4, domain: "Kids", rooms: ["family-room"] },
];
