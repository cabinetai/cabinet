/**
 * MDX component registry.
 *
 * Cabinet supports a *limited, verified* set of MDX (Markdown + JSX) components
 * alongside standard Markdown. The registry is the single source of truth for:
 *
 *  - which JSX tags are treated as first-class MDX components (vs. raw HTML),
 *  - how each component previews inside the Tiptap editor,
 *  - what the AI agents are allowed to emit (see `mdxRegistryPromptText`).
 *
 * Keep this list small and intentional. Adding a component here is the only
 * supported way to teach Cabinet (and its agents) a new MDX tag.
 */

export interface MdxPropSpec {
  name: string;
  /** Human-readable description used in the agent prompt + property editor. */
  description?: string;
  required?: boolean;
  /** Allowed string values, if the prop is an enum. */
  enum?: string[];
}

export interface MdxComponentSpec {
  name: string;
  description: string;
  /** True when the component never carries children (e.g. `<VideoPlayer />`). */
  selfClosing?: boolean;
  props: MdxPropSpec[];
}

export const MDX_COMPONENT_REGISTRY: Record<string, MdxComponentSpec> = {
  Callout: {
    name: "Callout",
    description: "A highlighted info/warning/error/success banner.",
    props: [
      {
        name: "type",
        description: "Severity / colour of the banner.",
        enum: ["info", "warning", "error", "success"],
      },
      { name: "title", description: "Optional bold heading shown above the body." },
    ],
  },
  VideoPlayer: {
    name: "VideoPlayer",
    description: "An embedded video player.",
    selfClosing: true,
    props: [
      { name: "url", description: "URL of the video to play.", required: true },
    ],
  },
};

/** True if `name` is a registered (verified) MDX component. */
export function isAllowedMdxComponent(name: string | null | undefined): boolean {
  return !!name && Object.prototype.hasOwnProperty.call(MDX_COMPONENT_REGISTRY, name);
}

/** Spec for `name`, or undefined if it is not registered. */
export function getMdxComponentSpec(name: string | null | undefined): MdxComponentSpec | undefined {
  return name ? MDX_COMPONENT_REGISTRY[name] : undefined;
}

/**
 * Render the registry as a Markdown bullet list for injection into an agent
 * system prompt. Keeps the model's allowed output schema in lock-step with the
 * components the editor can actually render.
 */
export function mdxRegistryPromptText(): string {
  const lines = Object.values(MDX_COMPONENT_REGISTRY).map((spec) => {
    const props = spec.props
      .map((p) => {
        const value = p.enum ? p.enum.join("|") : "string";
        const key = p.required ? p.name : `${p.name}?`;
        return `${key}="${value}"`;
      })
      .join(" ");
    const tag = spec.selfClosing
      ? `<${spec.name}${props ? " " + props : ""} />`
      : `<${spec.name}${props ? " " + props : ""}>children</${spec.name}>`;
    return `- \`${tag}\` — ${spec.description}`;
  });
  return lines.join("\n");
}
