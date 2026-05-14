import { MistakeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureStudentMastery, ensureTeacherMastery } from "@/lib/review";

type KnowledgeSummary = {
  id: string;
  code: string;
  name: string;
  module: string;
  textbook: string;
  chapter: string;
  count: number;
  students: number;
  weight: number;
  masteryScore?: number;
  nextReviewAt?: Date | null;
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

async function getMistakesForDiagnostics(where: {
  teacherId?: string;
  studentId?: string;
}) {
  return prisma.mistake.findMany({
    where: {
      status: MistakeStatus.REVIEWED,
      studentId: where.studentId,
      student: where.teacherId ? { teacherId: where.teacherId } : undefined,
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

function summarizeKnowledge(
  mistakes: Awaited<ReturnType<typeof getMistakesForDiagnostics>>,
  masteryOverlay = new Map<string, { score: number; nextReviewAt: Date | null }>(),
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
          textbook: point.textbook,
          chapter: point.chapter,
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
      masteryScore: masteryOverlay.get(item.id)?.score,
      nextReviewAt: masteryOverlay.get(item.id)?.nextReviewAt,
    }))
    .sort((a, b) => {
      const scoreDelta = (a.masteryScore ?? 50) - (b.masteryScore ?? 50);
      if (scoreDelta !== 0) return scoreDelta;
      return b.count * 10 + b.weight - (a.count * 10 + a.weight);
    });
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

function dueMistakes(
  mistakes: Awaited<ReturnType<typeof getMistakesForDiagnostics>>,
) {
  return mistakes
    .filter((mistake) => mistake.reviewDueAt && mistake.reviewDueAt <= new Date())
    .slice(0, 8)
    .map((mistake) => ({
      id: mistake.id,
      studentName: mistake.student.name,
      questionText: mistake.questionText,
      reviewDueAt: mistake.reviewDueAt,
    }));
}

export async function getTeacherDiagnostics(teacherId: string) {
  await ensureTeacherMastery(teacherId);

  const [teacher, students, mistakes, masteries] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: teacherId } }),
    prisma.student.findMany({ where: { teacherId } }),
    getMistakesForDiagnostics({ teacherId }),
    prisma.knowledgeMastery.findMany({
      where: { student: { teacherId } },
    }),
  ]);
  const masteryOverlay = summarizeMastery(masteries);

  return {
    teacher,
    totals: {
      students: students.length,
      mistakes: mistakes.length,
      reviewed: mistakes.length,
    },
    knowledgePoints: summarizeKnowledge(mistakes, masteryOverlay),
    errorTypes: summarizeErrors(mistakes),
    trend: toTrend(mistakes),
    dueMistakes: dueMistakes(mistakes),
  };
}

export async function getStudentDiagnostics(studentId: string) {
  await ensureStudentMastery(studentId);

  const [student, mistakes, masteries] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: { teacher: true },
    }),
    getMistakesForDiagnostics({ studentId }),
    prisma.knowledgeMastery.findMany({ where: { studentId } }),
  ]);

  const masteryOverlay = summarizeMastery(masteries);
  const knowledgePoints = summarizeKnowledge(mistakes, masteryOverlay);
  const repeatedKnowledge = knowledgePoints.filter(
    (item) => item.count >= 2,
  );

  return {
    student,
    totals: {
      mistakes: mistakes.length,
      repeated: repeatedKnowledge.length,
    },
    knowledgePoints,
    repeatedKnowledge,
    errorTypes: summarizeErrors(mistakes),
    trend: toTrend(mistakes),
    dueMistakes: dueMistakes(mistakes),
  };
}

function summarizeMastery(
  masteries: {
    knowledgePointId: string;
    score: number;
    nextReviewAt: Date | null;
  }[],
) {
  const map = new Map<
    string,
    {
      scoreTotal: number;
      count: number;
      nextReviewAt: Date | null;
    }
  >();

  for (const mastery of masteries) {
    const existing = map.get(mastery.knowledgePointId);
    if (existing) {
      existing.scoreTotal += mastery.score;
      existing.count += 1;
      if (
        mastery.nextReviewAt &&
        (!existing.nextReviewAt || mastery.nextReviewAt < existing.nextReviewAt)
      ) {
        existing.nextReviewAt = mastery.nextReviewAt;
      }
    } else {
      map.set(mastery.knowledgePointId, {
        scoreTotal: mastery.score,
        count: 1,
        nextReviewAt: mastery.nextReviewAt,
      });
    }
  }

  return new Map(
    Array.from(map.entries()).map(([knowledgePointId, value]) => [
      knowledgePointId,
      {
        score: Math.round(value.scoreTotal / value.count),
        nextReviewAt: value.nextReviewAt,
      },
    ]),
  );
}
