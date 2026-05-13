import { AiTaskStatus, AiTaskType, Prisma } from "@prisma/client";

type AiDraftResult = {
  status: AiTaskStatus;
  provider: string;
  outputJson?: Prisma.InputJsonValue;
  errorMessage?: string;
};

export type AiProvider = {
  id: string;
  enabled: boolean;
  createDraft: (
    type: AiTaskType,
    input: Prisma.InputJsonValue,
  ) => Promise<AiDraftResult>;
};

const nullProvider: AiProvider = {
  id: "none",
  enabled: false,
  async createDraft(type) {
    return {
      status: AiTaskStatus.SKIPPED,
      provider: "none",
      outputJson: {
        message: "未配置 AI Provider，已保留人工校对流程。",
        type,
      },
    };
  },
};

export function getAiProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  const apiKey = process.env.AI_API_KEY?.trim();

  if (!provider || provider === "none" || !apiKey) {
    return nullProvider;
  }

  return {
    id: provider,
    enabled: false,
    async createDraft(type) {
      return {
        status: AiTaskStatus.SKIPPED,
        provider,
        outputJson: {
          message: `${provider} 适配器尚未实现，任务已安全跳过。`,
          type,
        },
      };
    },
  };
}
