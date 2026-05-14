import { MistakeStatus, RegionTag } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return jsonError("请先登录", 401);
  }

  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const existing = await prisma.mistake.findFirst({
    where: { id, student: { teacherId: teacher.id } },
    select: { id: true, studentId: true },
  });

  if (!existing) {
    return jsonError("错题不存在", 404);
  }

  const knowledgePointIds = Array.isArray(body.knowledgePointIds)
    ? body.knowledgePointIds.filter((item): item is string => typeof item === "string")
    : [];
  const validKnowledgePoints = knowledgePointIds.length
    ? await prisma.knowledgePoint.findMany({
        where: { id: { in: knowledgePointIds } },
        select: { id: true },
      })
    : [];
  const errorTypeId = asString(body.errorTypeId) || null;
  const errorType = errorTypeId
    ? await prisma.errorType.findUnique({ where: { id: errorTypeId }, select: { id: true } })
    : null;
  const sourceYear = Number.parseInt(asString(body.sourceYear), 10);
  const reviewDueAt = asString(body.reviewDueAt);

  if (errorTypeId && !errorType) {
    return jsonError("错误类型不存在", 400);
  }

  const mistake = await prisma.mistake.update({
    where: { id },
    data: {
      questionText: asString(body.questionText) || null,
      answerText: asString(body.answerText) || null,
      analysisText: asString(body.analysisText) || null,
      correctionNote: asString(body.correctionNote) || null,
      questionType: asString(body.questionType) || null,
      sourceYear: Number.isFinite(sourceYear) ? sourceYear : null,
      regionTag: RegionTag.JS,
      errorTypeId,
      status: MistakeStatus.REVIEWED,
      reviewedAt: new Date(),
      reviewDueAt: reviewDueAt ? new Date(reviewDueAt) : null,
      knowledgeLinks: {
        deleteMany: {},
        create: validKnowledgePoints.map((point) => ({ knowledgePointId: point.id })),
      },
    },
  });
  const nextDraft = await prisma.mistake.findFirst({
    where: {
      id: { not: id },
      studentId: existing.studentId,
      status: MistakeStatus.DRAFT,
      student: { teacherId: teacher.id },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  return NextResponse.json({
    id: mistake.id,
    status: mistake.status,
    studentUrl: `/students/${existing.studentId}`,
    nextReviewUrl: nextDraft ? `/mistakes/${nextDraft.id}/review` : null,
  });
}
