export type OptaleAgentScope = "company" | "personal" | "system";

export type OptaleProductIdentity = {
  id: "optale-console";
  name: string;
  shortName: string;
  description: string;
  license: "MIT";
};

export const OPTALE_PRODUCT: OptaleProductIdentity = {
  id: "optale-console",
  name: process.env.NEXT_PUBLIC_OPTALE_PRODUCT_NAME || "Optale Console",
  shortName: process.env.NEXT_PUBLIC_OPTALE_PRODUCT_SHORT_NAME || "Console",
  description:
    process.env.NEXT_PUBLIC_OPTALE_PRODUCT_DESCRIPTION ||
    "Shared web and desktop operating surface for Optale OS.",
  license: "MIT",
};

export const OPTALE_SCOPE_LABELS: Record<OptaleAgentScope, string> = {
  company: "Company",
  personal: "Personal",
  system: "System",
};
