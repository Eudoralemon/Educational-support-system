import { PracticePackStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStatus(value: unknown): PracticePackStatus {
  return value === "CONFIRMED" ? PracticePackStatus.CONFIRMED : PracticePackStatus.DRAFT;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const items = Array.isArray(body.items) ? body.items : [];

  await prisma.$transaction([
    prisma.practicePack.update({
      where: { id },
      data: {
        title: asString(body.title) || "未命名练习包",
        status: asStatus(body.status),
      },
    }),
    ...items
      .filter(
        (item): item is { id: string; prompt?: unknown; answerText?: unknown; analysisText?: unknown } =>
          Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string",
      )
      .map((item, index) =>
        prisma.practiceItem.update({
          where: { id: item.id },
          data: {
            order: index + 1,
            prompt: asString(item.prompt),
            answerText: asString(item.answerText),
            analysisText: asString(item.analysisText),
          },
        }),
      ),
  ]);

  const pack = await prisma.practicePack.findUnique({
    where: { id },
    include: { items: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json(pack);
}
