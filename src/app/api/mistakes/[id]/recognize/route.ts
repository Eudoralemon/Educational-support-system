import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/lib/auth";
import { acceptMistakeTextbookMatch, recognizeMistakeTextbook } from "@/lib/textbook-recognition";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return jsonError("请先登录", 401);
  }

  const { id } = await params;
  const result = await recognizeMistakeTextbook({ teacherId: teacher.id, mistakeId: id });
  if (!result) {
    return jsonError("错题不存在", 404);
  }

  return NextResponse.json({
    textPatch: result.textPatch,
    matches: result.matches.map((match) => ({
      id: match.id,
      score: match.score,
      status: match.status,
      reason: match.reason,
      textbook: match.textbook,
      chapter: match.chapter,
      section: match.section,
      sourcePage: match.sourcePage,
      sourceLabel: match.sourceLabel,
      knowledgePoint: match.knowledgePoint
        ? {
            id: match.knowledgePoint.id,
            name: match.knowledgePoint.name,
            module: match.knowledgePoint.module,
          }
        : null,
      prompt: match.textbookExercise?.prompt ?? "",
    })),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return jsonError("请先登录", 401);
  }

  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const matchId = typeof body.matchId === "string" ? body.matchId : "";
  if (!matchId) {
    return jsonError("请选择教材候选", 400);
  }

  const match = await acceptMistakeTextbookMatch({
    teacherId: teacher.id,
    mistakeId: id,
    matchId,
  });

  if (!match) {
    return jsonError("教材候选不存在", 404);
  }

  return NextResponse.json({ ok: true });
}
