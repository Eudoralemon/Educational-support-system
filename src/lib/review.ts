import {
  MistakeStatus,
  ReviewCadence,
  ReviewResult,
  ReviewTermMode,
  StudentStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";

const defaultMasteryScore = 50;

type ScheduleInput = {
  mode: ReviewTermMode;
  cadence: ReviewCadence;
  result: ReviewResult;
  masteredStreak: number;
  from?: Date;
};

type ReviewTask = {
  id: string;
  studentId: string;
  studentName: string;
  questionText: string | null;
  reviewDueAt: Date | null;
  masteryScore: number;
  cadence: ReviewCadence;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function addDays(value: Date, days: number) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + days);
  return date;
}

function maxDate(left: Date, right: Date) {
  return left > right ? left : right;
}

function isWeekend(value = new Date()) {
  const day = value.getDay();
  return day === 0 || day === 6;
}

function nextWeekendOnOrAfter(value: Date) {
  const date = startOfDay(value);
  const day = date.getDay();

  if (day === 0 || day === 6) {
    return date;
  }

  date.setDate(date.getDate() + (6 - day));
  return date;
}

function intervalDays(result: ReviewResult, masteredStreak: number) {
  if (result === ReviewResult.FORGOT) return 1;
  if (result === ReviewResult.PARTIAL) return 3;

  const nextStreak = masteredStreak + 1;
  if (nextStreak <= 1) return 7;
  if (nextStreak === 2) return 14;
  return 30;
}

function nextReviewWindow({ mode, cadence, result, masteredStreak, from = new Date() }: ScheduleInput) {
  const direct = addDays(from, intervalDays(result, masteredStreak));

  if (mode === ReviewTermMode.HOLIDAY) {
    return direct;
  }

  if (cadence === ReviewCadence.HOLIDAY_ONLY) {
    return null;
  }

  if (cadence === ReviewCadence.BIWEEKLY_WEEKEND) {
    return nextWeekendOnOrAfter(maxDate(direct, addDays(from, 14)));
  }

  if (cadence === ReviewCadence.MONTHLY_WEEKEND) {
    return nextWeekendOnOrAfter(maxDate(direct, addDays(from, 28)));
  }

  return nextWeekendOnOrAfter(direct);
}

function isWindowOpen(mode: ReviewTermMode, today = new Date()) {
  return mode === ReviewTermMode.HOLIDAY || isWeekend(today);
}

function isVisibleInCurrentWindow({
  mode,
  cadence,
  reviewDueAt,
  today = new Date(),
}: {
  mode: ReviewTermMode;
  cadence: ReviewCadence;
  reviewDueAt: Date | null;
  today?: Date;
}) {
  if (mode === ReviewTermMode.HOLIDAY) {
    return !reviewDueAt || reviewDueAt <= endOfDay(today);
  }

  if (cadence === ReviewCadence.HOLIDAY_ONLY || !isWeekend(today)) {
    return false;
  }

  return Boolean(reviewDueAt && reviewDueAt <= endOfDay(today));
}

function nextWindowHint(mode: ReviewTermMode, cadence: ReviewCadence, today = new Date()) {
  if (mode === ReviewTermMode.HOLIDAY) return "寒暑假模式：按短间隔释放";
  if (cadence === ReviewCadence.HOLIDAY_ONLY) return "上学期积累，寒暑假集中释放";
  return `下一个可登录窗口：${nextWeekendOnOrAfter(today).toLocaleDateString("zh-CN")}`;
}

function scoreForResult(score: number, result: ReviewResult) {
  if (result === ReviewResult.FORGOT) return clamp(score - 20, 0, 100);
  if (result === ReviewResult.PARTIAL) return clamp(score + 5, 0, 100);
  return clamp(score + 15, 0, 100);
}

function streakForResult(streak: number, result: ReviewResult) {
  return result === ReviewResult.MASTERED ? streak + 1 : 0;
}

async function reviewedMistakesForStudent(studentId: string) {
  return prisma.mistake.findMany({
    where: { studentId, status: MistakeStatus.REVIEWED },
    include: { knowledgeLinks: true, student: { include: { teacher: true } } },
  });
}

export async function ensureStudentMastery(studentId: string) {
  const mistakes = await reviewedMistakesForStudent(studentId);

  for (const mistake of mistakes) {
    const reviewedAt = mistake.reviewedAt ?? mistake.createdAt;
    const nextReviewAt =
      mistake.reviewDueAt ??
      nextReviewWindow({
        mode: mistake.student.teacher.reviewTermMode,
        cadence: mistake.student.reviewCadence,
        result: ReviewResult.PARTIAL,
        masteredStreak: 0,
        from: reviewedAt,
      });

    for (const link of mistake.knowledgeLinks) {
      await prisma.knowledgeMastery.upsert({
        where: {
          studentId_knowledgePointId: {
            studentId,
            knowledgePointId: link.knowledgePointId,
          },
        },
        update: {},
        create: {
          studentId,
          knowledgePointId: link.knowledgePointId,
          score: defaultMasteryScore,
          nextReviewAt,
        },
      });
    }
  }
}

export async function ensureTeacherMastery(teacherId: string) {
  const students = await prisma.student.findMany({
    where: { teacherId, status: StudentStatus.ACTIVE },
    select: { id: true },
  });

  for (const student of students) {
    await ensureStudentMastery(student.id);
  }
}

export async function recordMistakeReview({
  teacherId,
  mistakeId,
  result,
  note,
}: {
  teacherId: string;
  mistakeId: string;
  result: ReviewResult;
  note?: string;
}) {
  const mistake = await prisma.mistake.findFirst({
    where: { id: mistakeId, status: MistakeStatus.REVIEWED, student: { teacherId } },
    include: {
      knowledgeLinks: true,
      student: { include: { teacher: true } },
    },
  });

  if (!mistake) {
    throw new Error("错题不存在或尚未入库");
  }

  await ensureStudentMastery(mistake.studentId);

  const pointIds = mistake.knowledgeLinks.map((link) => link.knowledgePointId);
  const currentMasteries = await prisma.knowledgeMastery.findMany({
    where: {
      studentId: mistake.studentId,
      knowledgePointId: { in: pointIds },
    },
  });
  const masteryMap = new Map(currentMasteries.map((item) => [item.knowledgePointId, item]));
  const reviewedAt = new Date();
  const updates = pointIds.map((knowledgePointId) => {
    const current = masteryMap.get(knowledgePointId);
    const score = scoreForResult(current?.score ?? defaultMasteryScore, result);
    const masteredStreak = streakForResult(current?.masteredStreak ?? 0, result);
    const forgotCount = (current?.forgotCount ?? 0) + (result === ReviewResult.FORGOT ? 1 : 0);
    const nextReviewAt = nextReviewWindow({
      mode: mistake.student.teacher.reviewTermMode,
      cadence: mistake.student.reviewCadence,
      result,
      masteredStreak: current?.masteredStreak ?? 0,
      from: reviewedAt,
    });

    return {
      knowledgePointId,
      score,
      masteredStreak,
      forgotCount,
      nextReviewAt,
    };
  });
  const nextReviewAt = updates
    .map((item) => item.nextReviewAt)
    .filter((item): item is Date => Boolean(item))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const scoreAfter = updates.length
    ? Math.round(updates.reduce((sum, item) => sum + item.score, 0) / updates.length)
    : defaultMasteryScore;

  await prisma.$transaction([
    ...updates.map((item) =>
      prisma.knowledgeMastery.upsert({
        where: {
          studentId_knowledgePointId: {
            studentId: mistake.studentId,
            knowledgePointId: item.knowledgePointId,
          },
        },
        update: {
          score: item.score,
          masteredStreak: item.masteredStreak,
          forgotCount: item.forgotCount,
          reviewedAt,
          nextReviewAt: item.nextReviewAt,
        },
        create: {
          studentId: mistake.studentId,
          knowledgePointId: item.knowledgePointId,
          score: item.score,
          masteredStreak: item.masteredStreak,
          forgotCount: item.forgotCount,
          reviewedAt,
          nextReviewAt: item.nextReviewAt,
        },
      }),
    ),
    prisma.reviewRecord.create({
      data: {
        studentId: mistake.studentId,
        mistakeId: mistake.id,
        result,
        note: note || null,
        scoreAfter,
        reviewedAt,
        nextReviewAt,
      },
    }),
    prisma.mistake.update({
      where: { id: mistake.id },
      data: { reviewDueAt: nextReviewAt },
    }),
  ]);

  return {
    studentId: mistake.studentId,
    nextReviewAt,
    scoreAfter,
  };
}

function sortTasks(tasks: ReviewTask[]) {
  return tasks.sort((a, b) => {
    if (a.masteryScore !== b.masteryScore) return a.masteryScore - b.masteryScore;
    const left = a.reviewDueAt?.getTime() ?? 0;
    const right = b.reviewDueAt?.getTime() ?? 0;
    return left - right;
  });
}

async function buildTasksForStudents(teacherId: string) {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) {
    return {
      teacher: null,
      windowOpen: false,
      tasks: [] as ReviewTask[],
      lowMasteries: [],
      recentRecords: [],
    };
  }

  await ensureTeacherMastery(teacherId);

  const [mistakes, masteries, recentRecords] = await Promise.all([
    prisma.mistake.findMany({
      where: { status: MistakeStatus.REVIEWED, student: { teacherId, status: StudentStatus.ACTIVE } },
      include: {
        student: true,
        knowledgeLinks: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.knowledgeMastery.findMany({
      where: { student: { teacherId, status: StudentStatus.ACTIVE } },
      include: { student: true, knowledgePoint: true },
      orderBy: [{ score: "asc" }, { nextReviewAt: "asc" }],
    }),
    prisma.reviewRecord.findMany({
      where: { student: { teacherId, status: StudentStatus.ACTIVE } },
      include: { student: true, mistake: true },
      orderBy: { reviewedAt: "desc" },
      take: 10,
    }),
  ]);
  const masteryByStudentPoint = new Map(
    masteries.map((item) => [`${item.studentId}:${item.knowledgePointId}`, item]),
  );
  const grouped = new Map<string, ReviewTask[]>();

  for (const mistake of mistakes) {
    const linkedMasteries = mistake.knowledgeLinks.flatMap((link) => {
      const mastery = masteryByStudentPoint.get(`${mistake.studentId}:${link.knowledgePointId}`);
      return mastery ? [mastery] : [];
    });
    const masteryScore = linkedMasteries.length
      ? Math.min(...linkedMasteries.map((item) => item.score))
      : defaultMasteryScore;
    const reviewDueAt =
      mistake.reviewDueAt ??
      linkedMasteries
        .map((item) => item.nextReviewAt)
        .filter((item): item is Date => Boolean(item))
        .sort((a, b) => a.getTime() - b.getTime())[0] ??
      null;

    if (
      !isVisibleInCurrentWindow({
        mode: teacher.reviewTermMode,
        cadence: mistake.student.reviewCadence,
        reviewDueAt,
      })
    ) {
      continue;
    }

    const existing = grouped.get(mistake.studentId) ?? [];
    existing.push({
      id: mistake.id,
      studentId: mistake.studentId,
      studentName: mistake.student.name,
      questionText: mistake.questionText,
      reviewDueAt,
      masteryScore,
      cadence: mistake.student.reviewCadence,
    });
    grouped.set(mistake.studentId, existing);
  }

  const students = await prisma.student.findMany({ where: { teacherId, status: StudentStatus.ACTIVE } });
  const batchSizeMap = new Map(students.map((student) => [student.id, student.reviewBatchSize]));
  const tasks = Array.from(grouped.entries()).flatMap(([studentId, items]) =>
    sortTasks(items).slice(0, batchSizeMap.get(studentId) ?? 8),
  );

  return {
    teacher,
    windowOpen: isWindowOpen(teacher.reviewTermMode),
    tasks: sortTasks(tasks),
    lowMasteries: masteries.slice(0, 12),
    recentRecords,
  };
}

export async function getTeacherReviewOverview(teacherId: string) {
  return buildTasksForStudents(teacherId);
}

export async function getStudentReviewOverview(studentId: string, teacherId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, teacherId },
    include: { teacher: true },
  });

  if (!student) return null;

  await ensureStudentMastery(studentId);

  const [mistakes, masteries, records] = await Promise.all([
    prisma.mistake.findMany({
      where: { studentId, status: MistakeStatus.REVIEWED },
      include: { knowledgeLinks: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.knowledgeMastery.findMany({
      where: { studentId },
      include: { knowledgePoint: true },
      orderBy: [{ score: "asc" }, { nextReviewAt: "asc" }],
    }),
    prisma.reviewRecord.findMany({
      where: { studentId },
      include: { mistake: true },
      orderBy: { reviewedAt: "desc" },
      take: 12,
    }),
  ]);
  const masteryByPoint = new Map(masteries.map((item) => [item.knowledgePointId, item]));
  const isArchived = student.status === StudentStatus.ARCHIVED;
  const pool = sortTasks(
    mistakes.flatMap((mistake) => {
      const linkedMasteries = mistake.knowledgeLinks.flatMap((link) => {
        const mastery = masteryByPoint.get(link.knowledgePointId);
        return mastery ? [mastery] : [];
      });
      const reviewDueAt =
        mistake.reviewDueAt ??
        linkedMasteries
          .map((item) => item.nextReviewAt)
          .filter((item): item is Date => Boolean(item))
          .sort((a, b) => a.getTime() - b.getTime())[0] ??
        null;
      const isDue =
        student.teacher.reviewTermMode === ReviewTermMode.HOLIDAY
          ? !reviewDueAt || reviewDueAt <= endOfDay(new Date())
          : Boolean(reviewDueAt && reviewDueAt <= endOfDay(new Date()));

      if (!isDue) return [];

      return [
        {
          id: mistake.id,
          studentId: student.id,
          studentName: student.name,
          questionText: mistake.questionText,
          reviewDueAt,
          masteryScore: linkedMasteries.length
            ? Math.min(...linkedMasteries.map((item) => item.score))
            : defaultMasteryScore,
          cadence: student.reviewCadence,
        },
      ];
    }),
  );
  const windowTasks = pool
    .filter(() => !isArchived)
    .filter((task) =>
      isVisibleInCurrentWindow({
        mode: student.teacher.reviewTermMode,
        cadence: student.reviewCadence,
        reviewDueAt: task.reviewDueAt,
      }),
    )
    .slice(0, student.reviewBatchSize);

  return {
    student,
    windowOpen: !isArchived && isWindowOpen(student.teacher.reviewTermMode),
    windowHint: nextWindowHint(student.teacher.reviewTermMode, student.reviewCadence),
    windowTasks,
    pool: isArchived ? [] : pool,
    masteries,
    records,
  };
}
