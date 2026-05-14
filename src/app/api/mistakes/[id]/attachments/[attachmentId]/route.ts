import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return jsonError("请先登录", 401);
  }

  const { id, attachmentId } = await params;
  const attachment = await prisma.mistakeAttachment.findFirst({
    where: {
      id: attachmentId,
      mistakeId: id,
      mistake: { student: { teacherId: teacher.id } },
    },
    select: { id: true },
  });

  if (!attachment) {
    return jsonError("图片不存在", 404);
  }

  await prisma.mistakeAttachment.delete({
    where: { id: attachment.id },
  });

  return NextResponse.json({ ok: true });
}
