import { PracticePackStatus, RegionTag } from "@prisma/client";
import { NextResponse } from "next/server";
import { getClassDiagnostics, getStudentDiagnostics } from "@/lib/diagnostics";
import { prisma } from "@/lib/db";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const classId = asString(body.classId) || undefined;
  const studentId = asString(body.studentId) || undefined;
  const explicitPointIds = asStringArray(body.knowledgePointIds);

  if (!classId && !studentId) {
    return NextResponse.json({ error: "需要 classId 或 studentId" }, { status: 400 });
  }

  const owner = studentId
    ? await prisma.student.findUnique({
        where: { id: studentId },
        include: { classGroup: { include: { teacher: true } } },
      })
    : null;
  const classGroup = classId
    ? await prisma.classGroup.findUnique({
        where: { id: classId },
        include: { teacher: true },
      })
    : owner?.classGroup;

  if (!classGroup) {
    return NextResponse.json({ error: "班级不存在" }, { status: 404 });
  }

  const diagnostics = studentId
    ? await getStudentDiagnostics(studentId)
    : await getClassDiagnostics(classGroup.id);
  const diagnosticPoints = diagnostics.knowledgePoints.slice(0, 5).map((item) => item.id);
  const knowledgePointIds = explicitPointIds.length > 0 ? explicitPointIds : diagnosticPoints;
  const points = await prisma.knowledgePoint.findMany({
    where: { id: { in: knowledgePointIds } },
  });

  if (points.length === 0) {
    return NextResponse.json({ error: "暂无可生成练习的知识点" }, { status: 400 });
  }

  const mistakes = await prisma.mistake.findMany({
    where: {
      classId: classGroup.id,
      studentId: studentId,
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

  const title =
    asString(body.title) ||
    `${studentId && owner ? owner.name : classGroup.name} 专项练习 ${new Date().toLocaleDateString("zh-CN")}`;

  const pack = await prisma.practicePack.create({
    data: {
      title,
      teacherId: classGroup.teacherId,
      classId: classGroup.id,
      studentId: studentId ?? null,
      regionTag: (owner?.region ?? classGroup.region ?? "COMMON") as RegionTag,
      status: PracticePackStatus.DRAFT,
      items: {
        create: points.map((point, index) => {
          const source = mistakes.find((mistake) =>
            mistake.knowledgeLinks.some((link) => link.knowledgePointId === point.id),
          );

          return {
            order: index + 1,
            knowledgePointId: point.id,
            sourceMistakeId: source?.id,
            prompt: source?.questionText
              ? `【${point.name} 变式】请围绕原错题重新完成：${source.questionText}`
              : `【${point.name} 专项】请补充一道覆盖“${point.module}”模块的针对性练习题。`,
            answerText: source?.answerText ?? "",
            analysisText: source?.analysisText
              ? `参考原错因：${source.analysisText}`
              : "待老师补充解析。",
            isAiDraft: false,
          };
        }),
      },
    },
  });

  return NextResponse.json({ id: pack.id });
}
