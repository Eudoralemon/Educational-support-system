import { MistakeStatus, RegionTag } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRegion(value: unknown): RegionTag {
  if (value === "JS" || value === "GD" || value === "COMMON") {
    return value;
  }

  return "COMMON";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const knowledgePointIds = Array.isArray(body.knowledgePointIds)
    ? body.knowledgePointIds.filter((item): item is string => typeof item === "string")
    : [];
  const sourceYear = Number.parseInt(asString(body.sourceYear), 10);
  const reviewDueAt = asString(body.reviewDueAt);

  const mistake = await prisma.mistake.update({
    where: { id },
    data: {
      questionText: asString(body.questionText) || null,
      answerText: asString(body.answerText) || null,
      analysisText: asString(body.analysisText) || null,
      correctionNote: asString(body.correctionNote) || null,
      questionType: asString(body.questionType) || null,
      sourceYear: Number.isFinite(sourceYear) ? sourceYear : null,
      regionTag: asRegion(body.regionTag),
      errorTypeId: asString(body.errorTypeId) || null,
      status: MistakeStatus.REVIEWED,
      reviewedAt: new Date(),
      reviewDueAt: reviewDueAt ? new Date(reviewDueAt) : null,
      knowledgeLinks: {
        deleteMany: {},
        create: knowledgePointIds.map((knowledgePointId) => ({ knowledgePointId })),
      },
    },
  });

  return NextResponse.json({
    id: mistake.id,
    status: mistake.status,
  });
}
