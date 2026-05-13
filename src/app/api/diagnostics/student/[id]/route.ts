import { NextResponse } from "next/server";
import { getStudentDiagnostics } from "@/lib/diagnostics";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const diagnostics = await getStudentDiagnostics(id);

  if (!diagnostics.student) {
    return NextResponse.json({ error: "学生不存在" }, { status: 404 });
  }

  return NextResponse.json(diagnostics);
}
