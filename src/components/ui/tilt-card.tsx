"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";

interface TiltCardProps {
  children: ReactNode;
  /** Max tilt in degrees on each axis. Default 8. Lower = subtler. */
  maxTiltDeg?: number;
  /** Hover scale. Default 1.02. Sweet spot 1.01–1.04. */
  scale?: number;
  /** Perspective depth in px. Default 1000. */
  perspective?: number;
  style?: CSSProperties;
  className?: string;
  onClick?: () => void;
}

/**
 * 3D tilt-on-hover wrapper. Tracks the cursor's position relative to the
 * card's center, normalizes to -0.5..0.5, and rotates accordingly with a
 * gentle scale. Resets on mouse leave. Honours prefers-reduced-motion.
 */
export function TiltCard({
  children,
  maxTiltDeg = 14,
  scale = 1.06,
  perspective = 800,
  style,
  className,
  onClick,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function reduceMotion(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || reduceMotion()) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
    el.style.transform =
      `perspective(${perspective}px) ` +
      `rotateX(${-y * maxTiltDeg}deg) ` +
      `rotateY(${x * maxTiltDeg}deg) ` +
      `scale(${scale})`;
  }

  function handleMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale(1)`;
  }

  return (
    <div
      ref={ref}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{
        transition: "transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)",
        transformStyle: "preserve-3d",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
