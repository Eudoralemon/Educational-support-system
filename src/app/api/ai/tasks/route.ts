import { AiTaskStatus, AiTaskType, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { getCurrentTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";

function asAiTaskType(value: unknown): AiTaskType {
  if (
    value === "OCR" ||
    value === "LOCAL_OCR" ||
    value === "TEXTBOOK_RECOGNITION" ||
    value === "EXPLANATION_REWRITE" ||
    value === "VARIANT_GENERATION"
  ) {
    return value;
  }

  return AiTaskType.OCR;
}

export async function POST(request: Request) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const type = asAiTaskType(body.type);
  const provider = getAiProvider();
  const inputJson = (body.input ?? {}) as Prisma.InputJsonValue;
  const mistakeId = typeof body.mistakeId === "string" ? body.mistakeId : null;

  if (mistakeId) {
    const mistake = await prisma.mistake.findFirst({
      where: { id: mistakeId, student: { teacherId: teacher.id } },
      select: { id: true },
    });

    if (!mistake) {
      return NextResponse.json({ error: "错题不存在" }, { status: 404 });
    }
  }

  try {
    const result = await provider.createDraft(type, inputJson);
    const task = await prisma.aiTask.create({
      data: {
        type,
        status: result.status,
        provider: result.provider,
        mistakeId,
        inputJson,
        outputJson: result.outputJson,
        errorMessage: result.errorMessage,
        completedAt: new Date(),
      },
    });

    return NextResponse.json(task);
  } catch (error) {
    const task = await prisma.aiTask.create({
      data: {
        type,
        status: AiTaskStatus.FAILED,
        provider: provider.id,
        mistakeId,
        inputJson,
        errorMessage: error instanceof Error ? error.message : "AI 任务失败",
        completedAt: new Date(),
      },
    });

    return NextResponse.json(task, { status: 500 });
  }
}
