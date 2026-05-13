import { MistakeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

type KnowledgeSummary = {
  id: string;
  code: string;
  name: string;
  module: string;
  count: number;
  students: number;
  weight: number;
};

type ErrorSummary = {
  id: string;
  code: string;
  name: string;
  count: number;
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toTrend(mistakes: { createdAt: Date }[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 29);

  const map = new Map<string, number>();
  for (let index = 0; index < 30; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    map.set(dayKey(date), 0);
  }

  for (const mistake of mistakes) {
    const key = dayKey(mistake.createdAt);
    if (map.has(key)) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }

  return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
}

function summarizeKnowledge(
  mistakes: Awaited<ReturnType<typeof getMistakesForDiagnostics>>,
) {
  const map = new Map<
    string,
    KnowledgeSummary & {
      studentIds: Set<string>;
    }
  >();

  for (const mistake of mistakes) {
    for (const link of mistake.knowledgeLinks) {
      const point = link.knowledgePoint;
      const existing = map.get(point.id);
      if (existing) {
        existing.count += 1;
        existing.weight += point.examWeight;
        existing.studentIds.add(mistake.studentId);
      } else {
        map.set(point.id, {
          id: point.id,
          code: point.code,
          name: point.name,
          module: point.module,
          count: 1,
          students: 1,
          weight: point.examWeight,
          studentIds: new Set([mistake.studentId]),
        });
      }
    }
  }

  return Array.from(map.values())
    .map(({ studentIds, ...item }) => ({
      ...item,
      students: studentIds.size,
    }))
    .sort((a, b) => b.count * 10 + b.weight - (a.count * 10 + a.weight));
}

function summarizeErrors(
  mistakes: Awaited<ReturnType<typeof getMistakesForDiagnostics>>,
) {
  const map = new Map<string, ErrorSummary>();

  for (const mistake of mistakes) {
    if (!mistake.errorType) continue;
    const existing = map.get(mistake.errorType.id);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(mistake.errorType.id, {
        id: mistake.errorType.id,
        code: mistake.errorType.code,
        name: mistake.errorType.name,
        count: 1,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

async function getMistakesForDiagnostics(where: {
  classId?: string;
  studentId?: string;
}) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  return prisma.mistake.findMany({
    where: {
      ...where,
      status: MistakeStatus.REVIEWED,
    },
    include: {
      student: true,
      errorType: true,
      knowledgeLinks: {
        include: {
          knowledgePoint: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getClassDiagnostics(classId: string) {
  const [classGroup, mistakes] = await Promise.all([
    prisma.classGroup.findUnique({
      where: { id: classId },
      include: { students: true },
    }),
    getMistakesForDiagnostics({ classId }),
  ]);

  const dueMistakes = mistakes
    .filter((mistake) => mistake.reviewDueAt && mistake.reviewDueAt <= new Date())
    .slice(0, 8)
    .map((mistake) => ({
      id: mistake.id,
      studentName: mistake.student.name,
      questionText: mistake.questionText,
      reviewDueAt: mistake.reviewDueAt,
    }));

  return {
    classGroup,
    totals: {
      students: classGroup?.students.length ?? 0,
      mistakes: mistakes.length,
      reviewed: mistakes.length,
    },
    knowledgePoints: summarizeKnowledge(mistakes),
    errorTypes: summarizeErrors(mistakes),
    trend: toTrend(mistakes),
    dueMistakes,
  };
}

export async function getStudentDiagnostics(studentId: string) {
  const [student, mistakes] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: { classGroup: true },
    }),
    getMistakesForDiagnostics({ studentId }),
  ]);

  const repeatedKnowledge = summarizeKnowledge(mistakes).filter(
    (item) => item.count >= 2,
  );
  const dueMistakes = mistakes
    .filter((mistake) => mistake.reviewDueAt && mistake.reviewDueAt <= new Date())
    .slice(0, 8)
    .map((mistake) => ({
      id: mistake.id,
      questionText: mistake.questionText,
      reviewDueAt: mistake.reviewDueAt,
    }));

  return {
    student,
    totals: {
      mistakes: mistakes.length,
      repeated: repeatedKnowledge.length,
    },
    knowledgePoints: summarizeKnowledge(mistakes),
    repeatedKnowledge,
    errorTypes: summarizeErrors(mistakes),
    trend: toTrend(mistakes),
    dueMistakes,
  };
}
