import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/lib/auth";
import { getExerciseLibrary } from "@/lib/exercise-library";

function valueOf(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() || undefined;
}

export async function GET(request: Request) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const take = Number.parseInt(valueOf(searchParams, "take") ?? "", 10);
  const exercises = await getExerciseLibrary({
    teacherId: teacher.id,
    studentId: valueOf(searchParams, "studentId"),
    view: valueOf(searchParams, "view"),
    query: valueOf(searchParams, "q"),
    textbook: valueOf(searchParams, "textbook"),
    module: valueOf(searchParams, "module"),
    chapter: valueOf(searchParams, "chapter"),
    knowledgePointId: valueOf(searchParams, "knowledgePointId"),
    take: Number.isFinite(take) ? take : undefined,
  });

  if (!exercises) {
    return NextResponse.json({ error: "学生不存在" }, { status: 404 });
  }

  return NextResponse.json({ exercises });
}
