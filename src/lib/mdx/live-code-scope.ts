"use client";

/**
 * Scope builder for Cabinet's live JSX code blocks.
 *
 * The evaluator (`live-code-eval.ts`) runs user code inside a sandboxed
 * `new Function()`. This module constructs the scope object — a flat map of
 * identifier names to runtime values — that is injected into that sandbox so
 * the code can reference React, Recharts, and shadcn/ui chart wrappers
 * by their bare names without any imports.
 *
 * @example
 * ```tsx
 * // Inside a live code block the user can simply write:
 * <ChartContainer config={chartConfig}>
 *   <BarChart data={data}>
 *     <XAxis dataKey="name" />
 *     <Bar dataKey="value" />
 *   </BarChart>
 * </ChartContainer>
 * ```
 */

import * as React from "react";
import * as Recharts from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
} from "@/components/ui/chart";

import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/components/ui/card";

import {
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  Activity,
  DollarSign,
  Users,
  ShoppingCart,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Scope constant                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Flat scope object passed to `evaluateLiveCode`.
 *
 * Merging order matters: Recharts is spread first, then shadcn chart
 * components override any same-named keys (there are none today, but this
 * keeps the intent clear — our wrappers take precedence).
 */
export const LIVE_CODE_SCOPE: Record<string, unknown> = {
  /* React — needed for createElement calls emitted by Sucrase */
  React,

  /* Every named export from recharts (BarChart, XAxis, Tooltip, …) */
  ...Recharts,

  /* shadcn/ui chart wrappers */
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,

  /* shadcn/ui Card components (used in many chart examples) */
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,

  /* Common lucide-react icons used in chart dashboards */
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  Activity,
  DollarSign,
  Users,
  ShoppingCart,
};
