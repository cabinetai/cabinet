"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const ExcalidrawEditor = dynamic(
  () => import("@/components/excalidraw/excalidraw-editor").then((m) => m.ExcalidrawEditor),
  { ssr: false }
);

export default function ExcalidrawEditorPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-neutral-900 text-sm text-neutral-400">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-indigo-500" />
        Loading Excalidraw Editor...
      </div>
    }>
      <ExcalidrawEditor />
    </Suspense>
  );
}
