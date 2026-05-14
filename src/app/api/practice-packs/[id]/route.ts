import { PracticePackStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStatus(value: unknown): PracticePackStatus {
  return value === "CONFIRMED" ? PracticePackStatus.CONFIRMED : PracticePackStatus.DRAFT;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type ItemInput = {
  id?: string;
  prompt?: unknown;
  answerText?: unknown;
  analysisText?: unknown;
};

function asItemInput(value: unknown): ItemInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as { id?: unknown; prompt?: unknown; answerText?: unknown; analysisText?: unknown };
  return {
    id: typeof item.id === "string" && item.id.trim() ? item.id : undefined,
    prompt: item.prompt,
    answerText: item.answerText,
    analysisText: item.analysisText,
  };
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
  const pack = await prisma.practicePack.findFirst({
    where: { id, teacherId: teacher.id },
    include: { items: { select: { id: true } } },
  });

  if (!pack) {
    return jsonError("练习包不存在", 404);
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .map(asItemInput)
    .filter((item): item is ItemInput => Boolean(item))
    .filter((item) => asString(item.prompt));
  const existingIds = new Set(pack.items.map((item) => item.id));
  const retainedExistingIds = items.flatMap((item) => (item.id ? [item.id] : []));
  const hasForeignItem = retainedExistingIds.some((itemId) => !existingIds.has(itemId));

  if (hasForeignItem) {
    return jsonError("题目不属于该练习包", 403);
  }

  await prisma.$transaction([
    prisma.practicePack.update({
      where: { id },
      data: {
        title: asString(body.title) || "未命名练习包",
        status: asStatus(body.status),
      },
    }),
    prisma.practiceItem.deleteMany({
      where: {
        packId: id,
        id: retainedExistingIds.length ? { notIn: retainedExistingIds } : undefined,
      },
    }),
    ...items.map((item, index) =>
      item.id
        ? prisma.practiceItem.update({
            where: { id: item.id },
            data: {
              order: index + 1,
              prompt: asString(item.prompt),
              answerText: asString(item.answerText),
              analysisText: asString(item.analysisText),
            },
          })
        : prisma.practiceItem.create({
            data: {
              packId: id,
              order: index + 1,
              prompt: asString(item.prompt),
              answerText: asString(item.answerText),
              analysisText: asString(item.analysisText),
              isAiDraft: false,
            },
          }),
    ),
  ]);

  const updatedPack = await prisma.practicePack.findUnique({
    where: { id },
    include: { items: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(updatedPack);
}
