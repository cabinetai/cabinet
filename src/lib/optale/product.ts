export type OptaleAgentScope = "company" | "personal" | "system";

export type OptaleProductIdentity = {
  id: "optale-observatory";
  name: string;
  shortName: string;
  description: string;
  license: "MIT";
};

export const OPTALE_PRODUCT: OptaleProductIdentity = {
  id: "optale-observatory",
  name: process.env.NEXT_PUBLIC_OPTALE_PRODUCT_NAME || "Optale Observatory",
  shortName: process.env.NEXT_PUBLIC_OPTALE_PRODUCT_SHORT_NAME || "Observatory",
  description:
    process.env.NEXT_PUBLIC_OPTALE_PRODUCT_DESCRIPTION ||
    "Governance, traces, evals, and observability for Optale's agent system.",
  license: "MIT",
};

export const OPTALE_SCOPE_LABELS: Record<OptaleAgentScope, string> = {
  company: "Company",
  personal: "Personal",
  system: "System",
};
