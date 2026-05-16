import { AiTaskType, MistakeAttachmentField, MistakeStatus, Prisma, RegionTag, StudentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { getCurrentTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { filesFromFormData, maxImagesPerDraftField, saveUploadImage } from "@/lib/uploads";

export const runtime = "nodejs";

const draftImageFields = [
  { field: MistakeAttachmentField.QUESTION, key: "questionImages" },
  { field: MistakeAttachmentField.ANSWER, key: "answerImages" },
  { field: MistakeAttachmentField.ANALYSIS, key: "analysisImages" },
  { field: MistakeAttachmentField.CORRECTION, key: "correctionImages" },
];

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

export async function POST(request: Request) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return jsonError("请先登录", 401);
  }

  const formData = await request.formData();
  const studentId = asString(formData.get("studentId"));
  const student = await prisma.student.findFirst({
    where: { id: studentId, teacherId: teacher.id, status: StudentStatus.ACTIVE },
  });

  if (!student) {
    return jsonError("学生不存在", 404);
  }

  const legacyImage = formData.get("image");
  const filesByField = new Map<MistakeAttachmentField, File[]>();
  for (const draftField of draftImageFields) {
    filesByField.set(draftField.field, filesFromFormData(formData, draftField.key));
  }
  if (legacyImage instanceof File && legacyImage.size > 0) {
    filesByField.set(MistakeAttachmentField.QUESTION, [
      legacyImage,
      ...(filesByField.get(MistakeAttachmentField.QUESTION) ?? []),
    ]);
  }

  for (const [field, files] of filesByField) {
    if (files.length > maxImagesPerDraftField) {
      return jsonError(`${field} 图片最多上传 ${maxImagesPerDraftField} 张`, 400);
    }
  }

  const savedAttachments: Array<{
    field: MistakeAttachmentField;
    imagePath: string;
    imageMimeType: string;
    originalName?: string;
    order: number;
  }> = [];
  try {
    for (const [field, files] of filesByField) {
      for (const [index, file] of files.entries()) {
        const saved = await saveUploadImage(file);
        savedAttachments.push({
          field,
          imagePath: saved.imagePath,
          imageMimeType: saved.imageMimeType,
          originalName: saved.originalName,
          order: index + 1,
        });
      }
    }
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
  const answerText = asString(formData.get("answerText"));
  const analysisText = asString(formData.get("analysisText"));
  const correctionNote = asString(formData.get("correctionNote"));

  if (savedAttachments.length === 0 && !questionText && !answerText && !analysisText && !correctionNote) {
    return jsonError("请至少上传图片或填写一段草稿文字", 400);
  }

  if (errorTypeId && !errorType) {
    return jsonError("错误类型不存在", 400);
  }

  const legacyQuestionImage = savedAttachments.find(
    (attachment) => attachment.field === MistakeAttachmentField.QUESTION,
  );
  const mistake = await prisma.mistake.create({
    data: {
      studentId: student.id,
      questionText: questionText || null,
      answerText: answerText || null,
      analysisText: analysisText || null,
      correctionNote: correctionNote || null,
      questionType: asString(formData.get("questionType")) || null,
      sourceYear: Number.isFinite(sourceYear) ? sourceYear : null,
      regionTag: RegionTag.JS,
      errorTypeId,
      status: MistakeStatus.DRAFT,
      imagePath: legacyQuestionImage?.imagePath,
      imageMimeType: legacyQuestionImage?.imageMimeType,
      knowledgeLinks: {
        create: validKnowledgePoints.map((point) => ({ knowledgePointId: point.id })),
      },
      attachments: {
        create: savedAttachments,
      },
    },
  });

  const provider = getAiProvider();
  const aiResult = await provider.createDraft(AiTaskType.OCR, {
      mistakeId: mistake.id,
      imagePath: legacyQuestionImage?.imagePath,
      attachmentCount: savedAttachments.length,
      questionText: mistake.questionText,
    } satisfies Prisma.InputJsonObject);

  const aiTask = await prisma.aiTask.create({
    data: {
      type: AiTaskType.OCR,
      status: aiResult.status,
      provider: aiResult.provider,
      mistakeId: mistake.id,
      inputJson: {
        imagePath: legacyQuestionImage?.imagePath,
        attachmentCount: savedAttachments.length,
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
