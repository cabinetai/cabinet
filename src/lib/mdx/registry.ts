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
  ModelViewer: {
    name: "ModelViewer",
    description: "A 3D model viewer rendering GLTF/GLB assets.",
    selfClosing: true,
    props: [
      { name: "src", description: "URL or relative path of the GLTF/GLB asset.", required: true },
      { name: "alt", description: "Alternative text description for accessibility." },
      { name: "autoRotate", description: "Enable automatic rotation of the model (true|false)." },
      { name: "cameraControls", description: "Enable user camera controls (true|false)." },
      { name: "shadowIntensity", description: "Intensity of shadows (number from 0 to 1)." },
    ],
  },
  NotebookCell: {
    name: "NotebookCell",
    description:
      "A Jupyter notebook code cell with optional outputs. Wraps a fenced code block and output components.",
    props: [
      { name: "language", description: "Programming language of the cell (e.g. python)." },
      { name: "executionCount", description: "Jupyter execution count number." },
    ],
  },
  CodeOutput: {
    name: "CodeOutput",
    description: "A text or HTML output from a notebook cell execution.",
    selfClosing: true,
    props: [
      {
        name: "type",
        description: "Output type.",
        enum: ["stream", "text", "html", "unknown"],
      },
      { name: "name", description: "Stream name (stdout/stderr) when type=stream." },
      { name: "text", description: "Plain-text output content." },
      { name: "html", description: "HTML output content (rendered in a sandboxed iframe)." },
      { name: "outputType", description: "Raw nbformat output_type when type=unknown." },
    ],
  },
  DataFrame: {
    name: "DataFrame",
    description: "A pandas DataFrame rendered as an HTML table.",
    selfClosing: true,
    props: [
      { name: "html", description: "HTML table string from pandas to_html().", required: true },
    ],
  },
  PlotlyChart: {
    name: "PlotlyChart",
    description: "A Plotly figure rendered from serialized JSON.",
    selfClosing: true,
    props: [
      { name: "data", description: "JSON string of the Plotly figure spec.", required: true },
    ],
  },
  ImageOutput: {
    name: "ImageOutput",
    description: "An image output (PNG, JPEG, or SVG) from a notebook cell.",
    selfClosing: true,
    props: [
      { name: "mime", description: "MIME type of the image.", enum: ["image/png", "image/jpeg", "image/svg+xml"] },
      { name: "src", description: "Base64-encoded image data (for PNG/JPEG)." },
      { name: "data", description: "Raw SVG string (for image/svg+xml)." },
    ],
  },
  ErrorOutput: {
    name: "ErrorOutput",
    description: "An error output from a notebook cell execution.",
    selfClosing: true,
    props: [
      { name: "ename", description: "Exception name.", required: true },
      { name: "evalue", description: "Exception value." },
      { name: "traceback", description: "Traceback string (newline-separated)." },
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

  // Append live code block instructions for charts / dashboards.
  lines.push(
    "",
    "## Live Code Blocks (Charts & Dashboards)",
    "",
    "Use fenced code blocks with ` ```jsx live ` for interactive charts.",
    "The following components are available (no imports needed):",
    "",
    "**shadcn/ui chart wrappers:** ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent",
    "**Recharts primitives:** BarChart, LineChart, AreaChart, PieChart, RadarChart, RadialBarChart, ScatterChart, " +
      "XAxis, YAxis, CartesianGrid, Line, Bar, Area, Pie, Scatter, Radar, ResponsiveContainer, Tooltip, Legend, Cell",
    "",
    "Example:",
    "```jsx live",
    '<ChartContainer config={{ sales: { label: "Sales", color: "var(--chart-1)" } }} className="h-75">',
    "  <BarChart data={data}>",
    '    <XAxis dataKey="month" />',
    '    <Bar dataKey="sales" fill="var(--chart-1)" radius={4} />',
    "  </BarChart>",
    "</ChartContainer>",
    "```",
    "",
    "Use CSS variables var(--chart-1) through var(--chart-5) for themed colors.",
  );

  return lines.join("\n");
}
