import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { fileName } = await params;
  const cleanName = path.basename(fileName);
  const relativePath = `uploads/${cleanName}`;
  const mistake = await prisma.mistake.findFirst({
    where: { imagePath: relativePath, student: { teacherId: teacher.id } },
    select: { imageMimeType: true },
  });

  if (!mistake) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  let file: Buffer;
  try {
    file = await readFile(path.join(process.cwd(), relativePath));
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": mistake.imageMimeType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
