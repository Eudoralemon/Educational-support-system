import { AiTaskStatus, AiTaskType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recognizeTextbooks } from "@/lib/textbook-recognition";

export const runtime = "nodejs";

export async function POST() {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const summary = await recognizeTextbooks();
    const task = await prisma.aiTask.create({
      data: {
        type: AiTaskType.TEXTBOOK_RECOGNITION,
        status: AiTaskStatus.COMPLETED,
        provider: "pdfjs",
        inputJson: { source: "local-pdf-text-layer" },
        outputJson: { summary },
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ summary, taskId: task.id });
  } catch (error) {
    const task = await prisma.aiTask.create({
      data: {
        type: AiTaskType.TEXTBOOK_RECOGNITION,
        status: AiTaskStatus.FAILED,
        provider: "pdfjs",
        inputJson: { source: "local-pdf-text-layer" },
        errorMessage: error instanceof Error ? error.message : "教材识别失败",
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ error: task.errorMessage, taskId: task.id }, { status: 500 });
  }
}
