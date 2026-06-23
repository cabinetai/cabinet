"use client";

/**
 * Notebook MDX component library.
 *
 * These components are the rendering layer for notebook cells and outputs
 * when MDX generated from an .ipynb is rendered. They are looked up via
 * the MDX component registry / provider.
 *
 * Components:
 *  - NotebookCell  — wraps a code cell (fenced code block + outputs)
 *  - CodeOutput    — stream / text / html output
 *  - DataFrame     — pandas HTML table in a sandboxed iframe
 *  - PlotlyChart   — Plotly figure from serialized JSON
 *  - ImageOutput   — PNG / JPEG / SVG image
 *  - ErrorOutput   — exception traceback
 */

import { useMemo, useState, useEffect, useId, type ReactNode } from "react";

const MAX_VIEWPORT_FRACTION = 0.85;

/**
 * Iframe that auto-sizes to its content height when the content fits within
 * 85% of the viewport. If the content is taller, it caps at 85vh and lets the
 * iframe's internal scrollbar handle overflow.
 */
function AutoHeightIframe({
  srcDoc,
  sandbox,
  className,
  defaultHeight = 360,
}: {
  srcDoc: string;
  sandbox?: string;
  className?: string;
  defaultHeight?: number;
}) {
  const reactId = useId();
  const iframeId = `nb-${reactId.replace(/:/g, "")}`;
  const [height, setHeight] = useState(defaultHeight);
  const [capped, setCapped] = useState(false);

  // Inject into the srcDoc:
  // 1. CSS that hides overflow by default (no flash of scrollbar at initial render)
  // 2. A script that posts the content height to the parent window, with retries
  //    for async renders (e.g. Plotly populating the chart after script load).
  const enhancedSrcDoc = useMemo(() => {
    const id = iframeId;
    const injected = `<style>html,body{overflow:hidden!important;margin:0}</style>` +
      `<script>(function(){` +
      `var id='${id}';` +
      `function r(){` +
      `  var h=document.documentElement.scrollHeight||document.body.scrollHeight;` +
      `  window.parent.postMessage({type:'nb-h',id:id,h:h},'*');` +
      `}` +
      `r();` +
      `new MutationObserver(r).observe(document.body,{childList:true,subtree:true,attributes:true});` +
      `window.addEventListener('resize',r);` +
      `[100,300,600,1200].forEach(function(t){setTimeout(r,t);});` +
      `})()\u003c/script>`;
    return srcDoc.includes("</body>")
      ? srcDoc.replace("</body>", injected + "</body>")
      : srcDoc + injected;
  }, [srcDoc, iframeId]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "nb-h" || e.data?.id !== iframeId) return;
      const contentH = Number(e.data.h);
      if (!contentH || contentH <= 0) return;
      const maxH = window.innerHeight * MAX_VIEWPORT_FRACTION;
      if (contentH >= maxH) {
        setHeight(maxH);
        setCapped(true);
      } else {
        setHeight(contentH + 2);
        setCapped(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [iframeId]);

  return (
    <iframe
      srcDoc={enhancedSrcDoc}
      sandbox={sandbox}
      className={className}
      style={{ height, overflow: capped ? "auto" : "hidden" }}
    />
  );
}

export interface NotebookCellProps {
  language?: string;
  executionCount?: string | number;
  children?: ReactNode;
}

export function NotebookCell({
  executionCount,
  children,
}: NotebookCellProps) {
  const count = executionCount ?? " ";
  return (
    <div className="mb-5">
      <div className="grid grid-cols-[60px_1fr] gap-3">
        <div className="text-right pt-3 select-none font-mono text-[11px] text-[#8B5E3C]">
          In&nbsp;[{count}]:
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

export interface CodeOutputProps {
  type?: "stream" | "text" | "html" | "unknown";
  name?: string;
  text?: string;
  html?: string;
  outputType?: string;
}

export function CodeOutput({
  type = "text",
  name,
  text,
  html,
  outputType,
}: CodeOutputProps) {
  if (type === "stream") {
    const isErr = name === "stderr";
    return (
      <pre
        className={`whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed px-4 py-3 rounded-md max-h-[85vh] overflow-y-auto ${
          isErr
            ? "bg-[rgba(139,46,62,0.06)] text-[#8B2E3E]"
            : "bg-[#F5EEDC] text-[#2A221B]"
        }`}
      >
        {text}
      </pre>
    );
  }

  if (type === "html" && html) {
    return (
      <AutoHeightIframe
        srcDoc={`<!doctype html><html><head><base target="_blank"><style>body{margin:0;padding:8px;font-family:-apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif;background:transparent;color:#2A221B;font-size:13px}table{border-collapse:collapse}th,td{border:1px solid #D4C4B0;padding:4px 8px;text-align:left}thead{background:#EFE5CC}.vega-embed{background:transparent!important}rect.background{fill:transparent!important}rect.bg{fill:transparent!important}</style><script>(function(){var _v=undefined;var w=function(el,spec,opt){if(spec){spec.background="transparent";if(spec.config){spec.config.background="transparent";if(spec.config.view){spec.config.view.fill="transparent";spec.config.view.stroke="transparent"}}}if(_v)return _v(el,spec,opt)};Object.defineProperty(window,"vegaEmbed",{get:function(){return w},set:function(val){_v=val;if(val){Object.assign(w,val);w.vega=val.vega;w.vegaLite=val.vegaLite}},configurable:true})})()</script></head><body>${html}</body></html>`}
        sandbox="allow-scripts"
        className="w-full bg-transparent rounded-md border border-[#E8DDC5]"
        defaultHeight={360}
      />
    );
  }

  if (type === "unknown") {
    return (
      <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed px-4 py-3 rounded-md bg-[#F5EEDC] text-[#7A6B5D]">
        [Unknown output type: {outputType}]
      </pre>
    );
  }

  // type === "text"
  return (
    <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed px-4 py-3 rounded-md bg-[#F5EEDC] text-[#2A221B] max-h-[85vh] overflow-y-auto">
      {text}
    </pre>
  );
}

export interface DataFrameProps {
  html: string;
}

export function DataFrame({ html }: DataFrameProps) {
  return (
    <AutoHeightIframe
      srcDoc={`<!doctype html><html><head><base target="_blank"><style>body{margin:0;padding:8px;font-family:-apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif;background:transparent;color:#2A221B;font-size:13px}table{border-collapse:collapse}th,td{border:1px solid #D4C4B0;padding:4px 8px;text-align:left}thead{background:#EFE5CC}</style></head><body>${html}</body></html>`}
      sandbox="allow-scripts"
      className="w-full bg-transparent rounded-md border border-[#E8DDC5]"
      defaultHeight={360}
    />
  );
}

export interface PlotlyChartProps {
  data: string;
}

export function PlotlyChart({ data }: PlotlyChartProps) {
  const html = useMemo(() => {
    let spec: unknown;
    try {
      spec = JSON.parse(data);
      if (spec && typeof spec === "object") {
        const layout = (spec as any).layout || {};
        layout.paper_bgcolor = "transparent";
        layout.plot_bgcolor = "transparent";
        (spec as any).layout = layout;
      }
    } catch {
      return `<p style="color:#8B2E3E;font-family:monospace;padding:8px">Invalid Plotly JSON</p>`;
    }
    return `<div id="plotly-chart" style="width:100%;height:100%"></div>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<script>
try {
  var spec = ${JSON.stringify(spec)};
  Plotly.newPlot('plotly-chart', spec.data || [], spec.layout || {}, {responsive: true});
} catch(e) {
  document.getElementById('plotly-chart').innerHTML = '<p style="color:#8B2E3E;font-family:monospace">Plotly error: ' + e.message + '</p>';
}
</script>`;
  }, [data]);

  return (
    <AutoHeightIframe
      srcDoc={`<!doctype html><html><head><base target="_blank"><style>body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif;background:transparent;color:#2A221B}rect.background{fill:transparent!important}rect.bg{fill:transparent!important}</style></head><body>${html}</body></html>`}
      sandbox="allow-scripts"
      className="w-full bg-transparent rounded-md border border-[#E8DDC5]"
      defaultHeight={420}
    />
  );
}

export interface ImageOutputProps {
  mime?: "image/png" | "image/jpeg" | "image/svg+xml";
  src?: string;
  data?: string;
}

export function ImageOutput({ mime = "image/png", src, data }: ImageOutputProps) {
  if (mime === "image/svg+xml" && data) {
    return (
      <div
        className="max-w-full rounded-md bg-transparent p-2 overflow-auto"
        dangerouslySetInnerHTML={{ __html: data }}
      />
    );
  }
  const imgSrc =
    mime === "image/jpeg"
      ? `data:image/jpeg;base64,${(src ?? "").replace(/\s/g, "")}`
      : `data:image/png;base64,${(src ?? "").replace(/\s/g, "")}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      alt="notebook output"
      className="max-w-full rounded-md bg-transparent p-2"
    />
  );
}

export interface ErrorOutputProps {
  ename: string;
  evalue?: string;
  traceback?: string;
}

export function ErrorOutput({ ename, evalue, traceback }: ErrorOutputProps) {
  return (
    <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed px-4 py-3 rounded-md bg-[rgba(139,46,62,0.08)] text-[#8B2E3E] border border-[rgba(139,46,62,0.18)] max-h-[85vh] overflow-y-auto">
      <span className="font-semibold">
        {ename}
        {evalue ? `: ${evalue}` : ""}
      </span>
      {traceback ? `\n\n${traceback}` : ""}
    </pre>
  );
}

/**
 * Component registry for use with an MDX provider.
 *
 * ```tsx
 * <MDXProvider components={notebookMdxComponents}>
 *   <MDXContent />
 * </MDXProvider>
 * ```
 */
export const notebookMdxComponents = {
  NotebookCell,
  CodeOutput,
  DataFrame,
  PlotlyChart,
  ImageOutput,
  ErrorOutput,
};
