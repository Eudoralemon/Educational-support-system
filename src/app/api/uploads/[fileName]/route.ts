import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const { fileName } = await params;
  const cleanName = path.basename(fileName);
  const relativePath = `uploads/${cleanName}`;
  const mistake = await prisma.mistake.findFirst({
    where: { imagePath: relativePath },
    select: { imageMimeType: true },
  });

  if (!mistake) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const file = await readFile(path.join(process.cwd(), relativePath));

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": mistake.imageMimeType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
