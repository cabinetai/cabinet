import type { Metadata } from "next";
import { OptaleCommandUxAlignment } from "@/components/optale/optale-command-ux-alignment";

export const metadata: Metadata = {
  title: "Optale Command UX Alignment",
};

export default function OptaleCommandUxAlignmentPage() {
  return <OptaleCommandUxAlignment />;
}
