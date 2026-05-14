import { AiTaskType, MistakeStatus, Prisma, RegionTag } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { getCurrentTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const maxImageBytes = 10 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function saveImage(file: File | null) {
  if (!file || file.size === 0) {
    return null;
  }

  if (!allowedImageTypes.has(file.type)) {
    throw new Error("仅支持 JPG、PNG、WebP 或 GIF 图片");
  }

  if (file.size > maxImageBytes) {
    throw new Error("图片不能超过 10MB");
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
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return jsonError("请先登录", 401);
  }

  const formData = await request.formData();
  const studentId = asString(formData.get("studentId"));
  const student = await prisma.student.findFirst({
    where: { id: studentId, teacherId: teacher.id },
  });

  if (!student) {
    return jsonError("学生不存在", 404);
  }

  const file = formData.get("image");
  let image: Awaited<ReturnType<typeof saveImage>>;
  try {
    image = await saveImage(file instanceof File ? file : null);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "图片上传失败", 400);
  }

  const knowledgePointIds = parseIds(asString(formData.get("knowledgePointIds")));
  const validKnowledgePoints = knowledgePointIds.length
    ? await prisma.knowledgePoint.findMany({
        where: { id: { in: knowledgePointIds } },
        select: { id: true },
      })
    : [];
  const errorTypeId = asString(formData.get("errorTypeId")) || null;
  const errorType = errorTypeId
    ? await prisma.errorType.findUnique({ where: { id: errorTypeId }, select: { id: true } })
    : null;
  const sourceYear = Number.parseInt(asString(formData.get("sourceYear")), 10);
  const questionText = asString(formData.get("questionText"));

  if (!image && !questionText) {
    return jsonError("请至少上传题图或填写题干", 400);
  }

  if (errorTypeId && !errorType) {
    return jsonError("错误类型不存在", 400);
  }

  const mistake = await prisma.mistake.create({
    data: {
      studentId: student.id,
      questionText: questionText || null,
      answerText: asString(formData.get("answerText")) || null,
      analysisText: asString(formData.get("analysisText")) || null,
      questionType: asString(formData.get("questionType")) || null,
      sourceYear: Number.isFinite(sourceYear) ? sourceYear : null,
      regionTag: RegionTag.JS,
      errorTypeId,
      status: MistakeStatus.DRAFT,
      imagePath: image?.imagePath,
      imageMimeType: image?.imageMimeType,
      knowledgeLinks: {
        create: validKnowledgePoints.map((point) => ({ knowledgePointId: point.id })),
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
