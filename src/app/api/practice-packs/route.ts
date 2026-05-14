import { PracticePackStatus, RegionTag } from "@prisma/client";
import { NextResponse } from "next/server";
import { getStudentDiagnostics } from "@/lib/diagnostics";
import { getCurrentTeacher } from "@/lib/auth";
import { prisma } from "@/lib/db";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const teacher = await getCurrentTeacher();
  if (!teacher) {
    return jsonError("请先登录", 401);
  }

  const body = (await request.json()) as Record<string, unknown>;
  const studentId = asString(body.studentId);
  const explicitPointIds = asStringArray(body.knowledgePointIds);

  if (!studentId) {
    return jsonError("需要 studentId", 400);
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, teacherId: teacher.id },
  });

  if (!student) {
    return jsonError("学生不存在", 404);
  }

  const diagnostics = await getStudentDiagnostics(studentId);
  const diagnosticPoints = diagnostics.knowledgePoints.slice(0, 5).map((item) => item.id);
  const knowledgePointIds = explicitPointIds.length > 0 ? explicitPointIds : diagnosticPoints;
  const unorderedPoints = await prisma.knowledgePoint.findMany({
    where: { id: { in: knowledgePointIds } },
  });
  const pointMap = new Map(unorderedPoints.map((point) => [point.id, point]));
  const points = knowledgePointIds.flatMap((id) => {
    const point = pointMap.get(id);
    return point ? [point] : [];
  });

  if (points.length === 0) {
    return jsonError("暂无可生成练习的知识点", 400);
  }

  const mistakes = await prisma.mistake.findMany({
    where: {
      studentId,
      knowledgeLinks: {
        some: {
          knowledgePointId: { in: points.map((point) => point.id) },
        },
      },
    },
    include: {
      knowledgeLinks: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const textbookExercises = await prisma.textbookExercise.findMany({
    where: {
      knowledgePointId: { in: points.map((point) => point.id) },
    },
    orderBy: [{ difficulty: "asc" }, { sourceLabel: "asc" }],
  });
  const exercisesByPoint = new Map<string, typeof textbookExercises>();

  for (const exercise of textbookExercises) {
    const existing = exercisesByPoint.get(exercise.knowledgePointId) ?? [];
    existing.push(exercise);
    exercisesByPoint.set(exercise.knowledgePointId, existing);
  }

  const title =
    asString(body.title) ||
    `${student.name} 专项练习 ${new Date().toLocaleDateString("zh-CN")}`;
  let order = 1;
  const itemCreates = points.flatMap((point) => {
    const source = mistakes.find((mistake) =>
      mistake.knowledgeLinks.some((link) => link.knowledgePointId === point.id),
    );
    const exercises = exercisesByPoint.get(point.id)?.slice(0, 2);

    if (!exercises || exercises.length === 0) {
      return [
        {
          order: order++,
          knowledgePointId: point.id,
          sourceMistakeId: source?.id,
          prompt: `【教材题源】请打开《${point.textbook}》${point.chapter}${point.section ? `“${point.section}”` : ""}，选做本节“练习”或“习题”中与“${point.name}”对应的一题，并完整作答。`,
          answerText: "",
          analysisText: "教材 PDF 暂未抽取到具体题目；请运行 npm.cmd run db:seed 重新生成本地教材题源。",
          isAiDraft: false,
        },
      ];
    }

    return exercises.map((exercise) => ({
      order: order++,
      knowledgePointId: point.id,
      textbookExerciseId: exercise.id,
      sourceMistakeId: source?.id,
      prompt: `【${point.name} · ${exercise.sourceLabel}】\n${exercise.prompt}`,
      answerText: exercise.answerText ?? "",
      analysisText: [
        exercise.analysisText,
        source?.analysisText ? `关联错因：${source.analysisText}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      isAiDraft: false,
    }));
  });

  const pack = await prisma.practicePack.create({
    data: {
      title,
      teacherId: student.teacherId,
      studentId: student.id,
      regionTag: RegionTag.JS,
      status: PracticePackStatus.DRAFT,
      items: {
        create: itemCreates,
      },
    },
  });

  return NextResponse.json({ id: pack.id });
}
