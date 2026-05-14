import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/lib/auth";
import { saveExercisePreference } from "@/lib/exercise-library";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown) {
  return value === true;
}

function asDifficulty(value: unknown) {
  const parsed = Number.parseInt(asString(value), 10);
  return Number.isFinite(parsed) ? Math.min(5, Math.max(1, parsed)) : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  try {
    const preference = await saveExercisePreference({
      teacherId: teacher.id,
      textbookExerciseId: id,
      isFavorite: asBoolean(body.isFavorite),
      note: asString(body.note) || null,
      difficultyOverride: body.difficultyOverride === null ? null : asDifficulty(body.difficultyOverride),
      isDisabled: asBoolean(body.isDisabled),
    });

    return NextResponse.json(preference);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "题源偏好保存失败" },
      { status: 404 },
    );
  }
}
