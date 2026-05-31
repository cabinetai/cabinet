import Image from "next/image";
import { Bot, Sparkles, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

const PROVIDER_IMAGE_BY_ICON: Record<string, string> = {
  sparkles: "/providers/claude.svg",
  bot: "/providers/openai.png",
  gemini: "/providers/gemini.svg",
  cursor: "/providers/cursor.svg",
  opencode: "/providers/opencode.svg",
  pi: "/providers/pi.svg",
  grok: "/providers/grok.svg",
  copilot: "/providers/copilot.svg",
};

export function ProviderGlyph({
  icon,
  asset,
  className,
}: {
  icon?: string;
  asset?: string;
  className?: string;
}) {
  const imageSrc = asset || (icon ? PROVIDER_IMAGE_BY_ICON[icon] : undefined);
  if (imageSrc) {
    return (
      <Image
        src={imageSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
        width={32}
        height={32}
        className={cn("shrink-0 object-contain", className)}
      />
    );
  }

  if (icon === "terminal") {
    return <Terminal className={className} />;
  }

  if (icon === "sparkles") {
    return <Sparkles className={className} />;
  }

  return <Bot className={className} />;
}
