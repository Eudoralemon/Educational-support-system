import {
  AiTaskStatus,
  AiTaskType,
  MistakeStatus,
  PracticePackStatus,
  RegionTag,
} from "@prisma/client";

export const regionLabels: Record<RegionTag, string> = {
  COMMON: "通用",
  JS: "江苏",
  GD: "广东",
};

export const mistakeStatusLabels: Record<MistakeStatus, string> = {
  DRAFT: "待校对",
  REVIEWED: "已入库",
};

export const practicePackStatusLabels: Record<PracticePackStatus, string> = {
  DRAFT: "草稿",
  CONFIRMED: "已确认",
};

export const aiTaskTypeLabels: Record<AiTaskType, string> = {
  OCR: "题图识别",
  EXPLANATION_REWRITE: "讲解改写",
  VARIANT_GENERATION: "变式题草稿",
};

export const aiTaskStatusLabels: Record<AiTaskStatus, string> = {
  PENDING: "等待中",
  COMPLETED: "已完成",
  FAILED: "失败",
  SKIPPED: "已跳过",
};

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDay(value: Date | string | null | undefined) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
