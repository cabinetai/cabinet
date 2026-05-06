import type { Metadata } from "next";
import { OptaleConsole } from "@/components/optale/console/optale-console";

export const metadata: Metadata = {
  title: "Optale Console",
};

export default function OptaleConsolePage() {
  return <OptaleConsole />;
}
