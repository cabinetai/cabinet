"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  detectEmbed,
  providerLabel,
  type EmbedProvider,
} from "@/lib/embeds/detect";
import { Youtube, Video as VideoIcon, Film, Globe, Twitter, Facebook, Instagram, Music, Music2 } from "lucide-react";
import { useEffect, useState } from "react";

interface EmbedAttrs {
  provider: EmbedProvider;
  src: string;
  originalUrl?: string | null;
  aspectRatio?: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embed: {
      setEmbed: (options: { url: string }) => ReturnType;
    };
  }
}

function ProviderIcon({ provider, className }: { provider: EmbedProvider; className?: string }) {
  switch (provider) {
    case "youtube": return <Youtube className={className} />;
    case "vimeo": return <Film className={className} />;
    case "loom": return <Film className={className} />;
    case "twitter": return <Twitter className={className} />;
    case "facebook": return <Facebook className={className} />;
    case "instagram": return <Instagram className={className} />;
    case "tiktok": return <Music2 className={className} />;
    case "spotify": return <Music className={className} />;
    case "video": return <VideoIcon className={className} />;
    case "iframe": return <Globe className={className} />;
  }
}

function TweetEmbed({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://platform.twitter.com/widgets.js"]'
    );
    const init = () => {
      // @ts-expect-error twttr is injected
      if (window.twttr?.widgets) window.twttr.widgets.load();
      setLoaded(true);
    };
    if (existing) {
      init();
    } else {
      const s = document.createElement("script");
      s.src = "https://platform.twitter.com/widgets.js";
      s.async = true;
      s.onload = init;
      document.head.appendChild(s);
    }
  }, [url]);

  return (
    <blockquote className="twitter-tweet" data-theme="auto">
      <a href={url}>{loaded ? "" : "Loading tweet…"}</a>
    </blockquote>
  );
}

function EmbedComponent(props: NodeViewProps) {
  const attrs = props.node.attrs as EmbedAttrs;
  const ratio = attrs.aspectRatio ? parseFloat(attrs.aspectRatio) : undefined;

  const renderBody = () => {
    if (attrs.provider === "video") {
      return (
        <video
          src={attrs.src}
          controls
          className="w-full rounded-md bg-black"
        />
      );
    }
    if (attrs.provider === "twitter") {
      return <TweetEmbed url={attrs.originalUrl ?? attrs.src} />;
    }
    const frame = (
      <iframe
        src={attrs.src}
        className="w-full h-full rounded-md border border-border"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        loading="lazy"
      />
    );
    if (ratio) {
      return (
        <div
          className="relative w-full"
          style={{ paddingTop: `${(1 / ratio) * 100}%` }}
        >
          <div className="absolute inset-0">{frame}</div>
        </div>
      );
    }
    return <div className="w-full h-[480px]">{frame}</div>;
  };

  return (
    <NodeViewWrapper
      as="div"
      className="my-3"
      data-embed="true"
      data-provider={attrs.provider}
    >
      <div className={`group relative rounded-md ${props.selected ? "ring-2 ring-primary" : ""}`} contentEditable={false}>
        {renderBody()}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <ProviderIcon provider={attrs.provider} className="w-3 h-3" /> {providerLabel(attrs.provider)}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const EmbedExtension = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: { default: "iframe" },
      src: { default: "" },
      originalUrl: { default: null },
      aspectRatio: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-embed="true"]',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          return {
            provider: element.getAttribute("data-provider") ?? "iframe",
            src: element.getAttribute("data-src") ?? element.querySelector("iframe, video")?.getAttribute("src") ?? "",
            originalUrl: element.getAttribute("data-original-url"),
            aspectRatio: element.getAttribute("data-aspect-ratio"),
          };
        },
      },
      {
        tag: "iframe[data-embed-provider]",
        getAttrs: (el) => {
          const element = el as HTMLElement;
          return {
            provider: element.getAttribute("data-embed-provider") ?? "iframe",
            src: element.getAttribute("src") ?? "",
            originalUrl: element.getAttribute("data-original-url"),
            aspectRatio: element.getAttribute("data-aspect-ratio"),
          };
        },
      },
      {
        tag: "blockquote.twitter-tweet",
        getAttrs: (el) => {
          const a = (el as HTMLElement).querySelector("a");
          const url = a?.getAttribute("href") ?? "";
          return { provider: "twitter", src: url, originalUrl: url };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const provider = HTMLAttributes.provider as EmbedProvider;
    const src = HTMLAttributes.src as string;
    const aspect = HTMLAttributes.aspectRatio as string | null;
    const originalUrl = HTMLAttributes.originalUrl as string | null;

    if (provider === "twitter") {
      return [
        "blockquote",
        mergeAttributes({ class: "twitter-tweet", "data-theme": "auto" }),
        ["a", { href: originalUrl ?? src }, originalUrl ?? src],
      ];
    }

    if (provider === "video") {
      return [
        "div",
        mergeAttributes({
          "data-embed": "true",
          "data-provider": provider,
          "data-src": src,
          "data-original-url": originalUrl ?? src,
        }),
        ["video", { src, controls: "true" }],
      ];
    }

    return [
      "div",
      mergeAttributes({
        "data-embed": "true",
        "data-provider": provider,
        "data-src": src,
        "data-original-url": originalUrl ?? "",
        "data-aspect-ratio": aspect ?? "",
      }),
      [
        "iframe",
        {
          src,
          "data-embed-provider": provider,
          allow:
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen",
          allowfullscreen: "true",
          loading: "lazy",
          frameborder: "0",
        },
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedComponent);
  },

  addCommands() {
    return {
      setEmbed:
        ({ url }) =>
        ({ commands }) => {
          const detected = detectEmbed(url);
          if (!detected) return false;
          return commands.insertContent({
            type: this.name,
            attrs: {
              provider: detected.provider,
              src: detected.embedUrl,
              originalUrl: detected.originalUrl,
              aspectRatio: detected.aspectRatio ? String(detected.aspectRatio) : null,
            },
          });
        },
    };
  },
});
