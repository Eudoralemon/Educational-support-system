import { AiTaskType, MistakeStatus, Prisma, RegionTag } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseIds(value: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

async function saveImage(file: File | null) {
  if (!file || file.size === 0) {
    return null;
  }

  const uploadsDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const extension = path.extname(file.name) || ".jpg";
  const fileName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const target = path.join(uploadsDir, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());

  await writeFile(target, bytes);

  return {
    imagePath: `uploads/${fileName}`,
    imageMimeType: file.type || "application/octet-stream",
  };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const studentId = asString(formData.get("studentId"));
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { teacher: true },
  });

  if (!student) {
    return NextResponse.json({ error: "学生不存在" }, { status: 404 });
  }

  const file = formData.get("image");
  const image = await saveImage(file instanceof File ? file : null);
  const knowledgePointIds = parseIds(asString(formData.get("knowledgePointIds")));
  const sourceYear = Number.parseInt(asString(formData.get("sourceYear")), 10);

  const mistake = await prisma.mistake.create({
    data: {
      studentId: student.id,
      questionText: asString(formData.get("questionText")) || null,
      answerText: asString(formData.get("answerText")) || null,
      analysisText: asString(formData.get("analysisText")) || null,
      questionType: asString(formData.get("questionType")) || null,
      sourceYear: Number.isFinite(sourceYear) ? sourceYear : null,
      regionTag: RegionTag.JS,
      errorTypeId: asString(formData.get("errorTypeId")) || null,
      status: MistakeStatus.DRAFT,
      imagePath: image?.imagePath,
      imageMimeType: image?.imageMimeType,
      knowledgeLinks: {
        create: knowledgePointIds.map((knowledgePointId) => ({ knowledgePointId })),
      },
    },
  });

  const provider = getAiProvider();
  const aiResult = await provider.createDraft(AiTaskType.OCR, {
    mistakeId: mistake.id,
    imagePath: image?.imagePath,
    questionText: mistake.questionText,
  } satisfies Prisma.InputJsonObject);

  const aiTask = await prisma.aiTask.create({
    data: {
      type: AiTaskType.OCR,
      status: aiResult.status,
      provider: aiResult.provider,
      mistakeId: mistake.id,
      inputJson: {
        imagePath: image?.imagePath,
        questionText: mistake.questionText,
      },
      outputJson: aiResult.outputJson,
      errorMessage: aiResult.errorMessage,
      completedAt: new Date(),
    },
  });

  await prisma.mistake.update({
    where: { id: mistake.id },
    data: {
      aiDraftJson: aiTask.outputJson ?? undefined,
    },
  });

  return NextResponse.json({
    id: mistake.id,
    reviewUrl: `/mistakes/${mistake.id}/review`,
    aiTaskStatus: aiTask.status,
  });
}
