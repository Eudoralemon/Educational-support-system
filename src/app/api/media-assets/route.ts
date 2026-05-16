import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveUploadImage } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const formData = await request.formData();
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "请选择图片" }, { status: 400 });
  }

  try {
    const saved = await saveUploadImage(image);
    const asset = await prisma.mediaAsset.create({
      data: {
        teacherId: teacher.id,
        imagePath: saved.imagePath,
        imageMimeType: saved.imageMimeType,
        originalName: saved.originalName,
      },
    });

    return NextResponse.json({
      id: asset.id,
      url: `/api/uploads/${encodeURIComponent(saved.imagePath.replace("uploads/", ""))}`,
      imagePath: saved.imagePath,
      originalName: saved.originalName,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "图片上传失败" },
      { status: 400 },
    );
  }
}
