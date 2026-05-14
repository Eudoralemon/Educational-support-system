import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/lib/auth";
import { appendExerciseToPack } from "@/lib/exercise-library";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const textbookExerciseId = asString(body.textbookExerciseId);

  if (!textbookExerciseId) {
    return NextResponse.json({ error: "需要 textbookExerciseId" }, { status: 400 });
  }

  try {
    const item = await appendExerciseToPack({
      teacherId: teacher.id,
      packId: id,
      textbookExerciseId,
    });

    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "题源加入失败" },
      { status: error instanceof Error && error.message.includes("停用") ? 400 : 404 },
    );
  }
}
