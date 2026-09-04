"use client";

import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Suspense } from "react";

function MediaPlayer() {
  const searchParams = useSearchParams();
  const path = searchParams.get("path") || "";
  const type = searchParams.get("type") || "video";
  const title = searchParams.get("title") || "Media";

  const assetUrl = `/api/assets/${path.split("/").map(encodeURIComponent).join("/")}`;

  return (
    <div className="flex flex-col items-center justify-center w-full h-screen bg-neutral-950 p-6 text-white font-sans">
      <div className="w-full max-w-4xl flex flex-col gap-4">
        <h1 className="text-lg font-medium text-neutral-200">{decodeURIComponent(title)}</h1>
        <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900 shadow-2xl flex items-center justify-center">
          {type === "audio" ? (
            <div className="flex flex-col items-center gap-6 w-full max-w-md p-8">
              <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center text-3xl shadow-inner animate-pulse">
                🎵
              </div>
              <audio controls src={assetUrl} className="w-full" autoPlay />
            </div>
          ) : (
            <video controls src={assetUrl} className="w-full h-full object-contain" autoPlay />
          )}
        </div>
      </div>
    </div>
  );
}

export default function MediaPlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center w-full h-screen bg-neutral-950 text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <MediaPlayer />
    </Suspense>
  );
}
