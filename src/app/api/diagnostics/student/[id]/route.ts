import { NextResponse } from "next/server";
import { getStudentDiagnostics } from "@/lib/diagnostics";
import { getCurrentTeacher } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await params;
  const diagnostics = await getStudentDiagnostics(id);

  if (!diagnostics.student) {
    return NextResponse.json({ error: "学生不存在" }, { status: 404 });
  }

  if (diagnostics.student.teacherId !== teacher.id) {
    return NextResponse.json({ error: "无权访问该学生" }, { status: 403 });
  }

  return NextResponse.json(diagnostics);
}
