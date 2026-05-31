"use client";

import { cn } from "@/lib/utils";

// Integration brand colors for the icon backgrounds
const integrationMeta: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  // Google ecosystem
  "google-sheets":    { label: "Google Sheets",    color: "#0F9D58", bg: "bg-[#0F9D58]/10", icon: "📊" },
  "google-analytics": { label: "Google Analytics",  color: "#E37400", bg: "bg-[#E37400]/10", icon: "📈" },
  "gmail":            { label: "Gmail",             color: "#EA4335", bg: "bg-[#EA4335]/10", icon: "✉️" },
  "gcp":              { label: "Google Cloud",      color: "#4285F4", bg: "bg-[#4285F4]/10", icon: "☁️" },
  "gemini":           { label: "Gemini",            color: "#886FBF", bg: "bg-[#886FBF]/10", icon: "✨" },
  "google-workspace": { label: "Google Workspace",  color: "#4285F4", bg: "bg-[#4285F4]/10", icon: "🗂" },

  // Chat platforms
  "discord":  { label: "Discord",  color: "#5865F2", bg: "bg-[#5865F2]/10", icon: "🎮" },

  // Social platforms
  "linkedin":   { label: "LinkedIn",    color: "#0A66C2", bg: "bg-[#0A66C2]/10", icon: "in" },
  "twitter":    { label: "X / Twitter", color: "#1DA1F2", bg: "bg-[#1DA1F2]/10", icon: "𝕏" },
  "reddit":     { label: "Reddit",      color: "#FF4500", bg: "bg-[#FF4500]/10", icon: "🔴" },
  "instagram":  { label: "Instagram",   color: "#E4405F", bg: "bg-[#E4405F]/10", icon: "📷" },
  "tiktok":     { label: "TikTok",      color: "#000000", bg: "bg-[#010101]/10", icon: "🎵" },
  "youtube":    { label: "YouTube",     color: "#FF0000", bg: "bg-[#FF0000]/10", icon: "▶️" },

  // Dev tools
  "github":   { label: "GitHub",   color: "#333333", bg: "bg-[#333333]/10", icon: "🐙" },
  "linear":   { label: "Linear",   color: "#5E6AD2", bg: "bg-[#5E6AD2]/10", icon: "◆" },
  "jira":     { label: "Jira",     color: "#0052CC", bg: "bg-[#0052CC]/10", icon: "🔷" },
  "vercel":   { label: "Vercel",   color: "#000000", bg: "bg-[#010101]/10", icon: "▲" },
  "notion":   { label: "Notion",   color: "#000000", bg: "bg-[#010101]/10", icon: "📝" },
  "figma":    { label: "Figma",    color: "#F24E1E", bg: "bg-[#F24E1E]/10", icon: "🎨" },

  // CRM & Sales
  "hubspot":    { label: "HubSpot",    color: "#FF7A59", bg: "bg-[#FF7A59]/10", icon: "🟠" },
  "salesforce": { label: "Salesforce",  color: "#00A1E0", bg: "bg-[#00A1E0]/10", icon: "☁️" },
  "stripe":     { label: "Stripe",      color: "#635BFF", bg: "bg-[#635BFF]/10", icon: "💳" },

  // Monitoring & Security
  "sentry":    { label: "Sentry",    color: "#362D59", bg: "bg-[#362D59]/10", icon: "🛡" },
  "datadog":   { label: "Datadog",   color: "#632CA6", bg: "bg-[#632CA6]/10", icon: "🐕" },
  "grafana":   { label: "Grafana",   color: "#F46800", bg: "bg-[#F46800]/10", icon: "📉" },
  "pagerduty": { label: "PagerDuty", color: "#06AC38", bg: "bg-[#06AC38]/10", icon: "🚨" },
  "semgrep":   { label: "Semgrep",   color: "#2B2B2B", bg: "bg-[#2B2B2B]/10", icon: "🔍" },
  "snyk":      { label: "Snyk",      color: "#4C4A73", bg: "bg-[#4C4A73]/10", icon: "🔐" },

  // Support & CS
  "intercom": { label: "Intercom", color: "#1F8DED", bg: "bg-[#1F8DED]/10", icon: "💬" },
  "zendesk":  { label: "Zendesk",  color: "#03363D", bg: "bg-[#03363D]/10", icon: "🎫" },

  // Analytics
  "mixpanel":  { label: "Mixpanel",  color: "#7856FF", bg: "bg-[#7856FF]/10", icon: "📊" },
  "amplitude": { label: "Amplitude", color: "#1C1C1C", bg: "bg-[#1C1C1C]/10", icon: "📈" },
  "segment":   { label: "Segment",   color: "#52BD95", bg: "bg-[#52BD95]/10", icon: "🔗" },

  // Email
  "sendgrid":  { label: "SendGrid",  color: "#1A82E2", bg: "bg-[#1A82E2]/10", icon: "📧" },
  "mailchimp": { label: "Mailchimp", color: "#FFE01B", bg: "bg-[#FFE01B]/15", icon: "🐵" },

  // AI & Media
  "elevenlabs": { label: "ElevenLabs", color: "#000000", bg: "bg-[#010101]/10", icon: "🔊" },
  "openai":     { label: "OpenAI",     color: "#10A37F", bg: "bg-[#10A37F]/10", icon: "🤖" },
  "flux":       { label: "FLUX",       color: "#7C3AED", bg: "bg-[#7C3AED]/10", icon: "🖼" },

  // Infrastructure
  "aws":      { label: "AWS",        color: "#FF9900", bg: "bg-[#FF9900]/10", icon: "☁️" },
  "postgres": { label: "PostgreSQL", color: "#336791", bg: "bg-[#336791]/10", icon: "🐘" },
  "slack":    { label: "Slack",      color: "#4A154B", bg: "bg-[#4A154B]/10", icon: "💬" },

  // Local / generic
  "csv":      { label: "CSV",      color: "#2E7D32", bg: "bg-emerald-500/10", icon: "📋" },
  "markdown": { label: "Markdown", color: "#333333", bg: "bg-[#333333]/10",   icon: "📄" },
};

interface IntegrationIconProps {
  slug: string;
  required?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function IntegrationIcon({ slug, required, size = "sm", showLabel = true, className }: IntegrationIconProps) {
  const meta = integrationMeta[slug];
  const label = meta?.label || slug;
  const icon = meta?.icon || "⚡";
  const bgColor = meta?.bg || "bg-muted";

  const sizeClasses = {
    sm: "h-5 text-[9px]",
    md: "h-6 text-[10px]",
    lg: "h-7 text-[11px]",
  };

  const iconSizeClasses = {
    sm: "w-4 h-4 text-[10px]",
    md: "w-5 h-5 text-[12px]",
    lg: "w-6 h-6 text-[14px]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium transition-colors",
        sizeClasses[size],
        showLabel ? "px-1.5" : "px-1 justify-center",
        required ? bgColor : "bg-muted/60",
        required ? "" : "opacity-70",
        className
      )}
      title={`${label}${required ? " (required)" : " (optional)"}`}
      style={required ? { color: meta?.color || "inherit" } : undefined}
    >
      <span className={cn("flex items-center justify-center shrink-0 leading-none", iconSizeClasses[size])}>
        {icon}
      </span>
      {showLabel && (
        <span className={cn(!required && "text-muted-foreground/60")}>
          {label}
        </span>
      )}
    </span>
  );
}

interface IntegrationBadgesProps {
  integrations: { name: string; slug: string; required: boolean }[];
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  maxVisible?: number;
  className?: string;
}

export function IntegrationBadges({ integrations, size = "sm", showLabel = true, maxVisible, className }: IntegrationBadgesProps) {
  if (!integrations || integrations.length === 0) return null;

  // Sort: required first, then alphabetical
  const sorted = [...integrations].sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const visible = maxVisible ? sorted.slice(0, maxVisible) : sorted;
  const overflow = maxVisible ? sorted.length - maxVisible : 0;

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {visible.map((intg) => (
        <IntegrationIcon
          key={intg.slug}
          slug={intg.slug}
          required={intg.required}
          size={size}
          showLabel={showLabel}
        />
      ))}
      {overflow > 0 && (
        <span className={cn(
          "text-muted-foreground/40 font-medium",
          size === "sm" ? "text-[9px]" : size === "md" ? "text-[10px]" : "text-[11px]"
        )}>
          +{overflow} more
        </span>
      )}
    </div>
  );
}

export { integrationMeta };
