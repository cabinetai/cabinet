export type OptaleSlackResponseMode = "reply" | "observe";

export type OptaleSlackAgentPolicy = {
  version: 1;
  enabled: boolean;
  responseMode: OptaleSlackResponseMode;
  context: {
    currentThread: boolean;
    linkedThreads: boolean;
    timeReferences: boolean;
    maxThreadMessages: number;
    maxReferencedThreads: number;
  };
  tools: {
    postReplies: boolean;
    inspectThreads: boolean;
    runCommand: boolean;
    readObjects: boolean;
    useAgents: boolean;
    promoteBrain: boolean;
  };
  memory: {
    personalBrain: boolean;
    companyBrain: boolean;
    clientBrain: boolean;
  };
  updatedAt: string;
};

export type OptaleSlackAgentPolicyPayload = {
  generatedAt: string;
  policy: OptaleSlackAgentPolicy;
  canManage: boolean;
};
