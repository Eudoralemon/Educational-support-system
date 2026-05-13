import { NextResponse } from "next/server";
import { getClassDiagnostics } from "@/lib/diagnostics";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const diagnostics = await getClassDiagnostics(id);

  if (!diagnostics.classGroup) {
    return NextResponse.json({ error: "班级不存在" }, { status: 404 });
  }

  return NextResponse.json(diagnostics);
}
