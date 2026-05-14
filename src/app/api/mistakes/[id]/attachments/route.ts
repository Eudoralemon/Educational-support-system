import { MistakeAttachmentField } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { filesFromFormData, maxImagesPerDraftField, saveUploadImage, uploadUrl } from "@/lib/uploads";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function asField(value: FormDataEntryValue | null) {
  if (
    value === MistakeAttachmentField.QUESTION ||
    value === MistakeAttachmentField.ANSWER ||
    value === MistakeAttachmentField.ANALYSIS ||
    value === MistakeAttachmentField.CORRECTION
  ) {
    return value;
  }

  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return jsonError("请先登录", 401);
  }

  const { id } = await params;
  const mistake = await prisma.mistake.findFirst({
    where: { id, student: { teacherId: teacher.id } },
    select: { id: true },
  });

  if (!mistake) {
    return jsonError("错题不存在", 404);
  }

  const formData = await request.formData();
  const field = asField(formData.get("field"));
  if (!field) {
    return jsonError("图片分区无效", 400);
  }

  const files = filesFromFormData(formData, "images");
  if (files.length === 0) {
    return jsonError("请选择图片", 400);
  }

  const existingCount = await prisma.mistakeAttachment.count({
    where: { mistakeId: mistake.id, field },
  });
  if (existingCount + files.length > maxImagesPerDraftField) {
    return jsonError(`每个草稿区最多 ${maxImagesPerDraftField} 张图片`, 400);
  }

  try {
    const created = [];
    for (const [index, file] of files.entries()) {
      const saved = await saveUploadImage(file);
      const attachment = await prisma.mistakeAttachment.create({
        data: {
          mistakeId: mistake.id,
          field,
          imagePath: saved.imagePath,
          imageMimeType: saved.imageMimeType,
          originalName: saved.originalName,
          order: existingCount + index + 1,
        },
      });
      created.push({
        id: attachment.id,
        field: attachment.field,
        url: uploadUrl(attachment.imagePath),
        originalName: attachment.originalName,
        order: attachment.order,
      });
    }

    return NextResponse.json({ attachments: created });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "图片上传失败", 400);
  }
}
