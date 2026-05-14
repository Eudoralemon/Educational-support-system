import { PracticePackStatus, RegionTag } from "@prisma/client";
import { prisma } from "@/lib/db";

type ExerciseQuery = {
  teacherId: string;
  studentId?: string;
  view?: string;
  query?: string;
  textbook?: string;
  module?: string;
  chapter?: string;
  knowledgePointId?: string;
  take?: number;
};

function clampTake(value?: number) {
  if (!value || !Number.isFinite(value)) return 80;
  return Math.min(120, Math.max(10, value));
}

function normalize(value?: string | null) {
  return value?.trim() || "";
}

function masteryBucket(score?: number | null) {
  if (typeof score !== "number") return "未复习";
  if (score < 60) return "薄弱";
  if (score < 80) return "巩固";
  return "稳定";
}

function effectiveDifficulty(base: number, override?: number | null) {
  return override ?? base;
}

export async function getExerciseLibrary({
  teacherId,
  studentId,
  view = "recommended",
  query,
  textbook,
  module,
  chapter,
  knowledgePointId,
  take,
}: ExerciseQuery) {
  const student = studentId
    ? await prisma.student.findFirst({
        where: { id: studentId, teacherId },
        select: { id: true },
      })
    : null;

  if (studentId && !student) {
    return null;
  }

  const normalizedQuery = normalize(query);
  const exercises = await prisma.textbookExercise.findMany({
    where: {
      textbook: normalize(textbook) || undefined,
      chapter: normalize(chapter) || undefined,
      knowledgePointId: normalize(knowledgePointId) || undefined,
      knowledgePoint: normalize(module) ? { module: normalize(module) } : undefined,
      OR: normalizedQuery
        ? [
            { prompt: { contains: normalizedQuery } },
            { sourceLabel: { contains: normalizedQuery } },
            { chapter: { contains: normalizedQuery } },
            { section: { contains: normalizedQuery } },
            { knowledgePoint: { name: { contains: normalizedQuery } } },
            { knowledgePoint: { module: { contains: normalizedQuery } } },
          ]
        : undefined,
    },
    include: {
      knowledgePoint: true,
      preferences: { where: { teacherId } },
      usages: {
        where: {
          teacherId,
          studentId: student?.id,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
    orderBy: [{ difficulty: "asc" }, { sourceLabel: "asc" }],
    take: 400,
  });
  const mastery = student
    ? await prisma.knowledgeMastery.findMany({
        where: { studentId: student.id },
        select: { knowledgePointId: true, score: true },
      })
    : [];
  const masteryMap = new Map(mastery.map((item) => [item.knowledgePointId, item.score]));

  const rows = exercises.map((exercise) => {
    const preference = exercise.preferences[0] ?? null;
    const usageCount = exercise.usages.length;
    const masteryScore = masteryMap.get(exercise.knowledgePointId);
    const disabled = preference?.isDisabled ?? false;
    const favorite = preference?.isFavorite ?? false;

    return {
      id: exercise.id,
      code: exercise.code,
      textbook: exercise.textbook,
      chapter: exercise.chapter,
      section: exercise.section,
      sourceLabel: exercise.sourceLabel,
      sourcePage: exercise.sourcePage,
      prompt: exercise.prompt,
      answerText: exercise.answerText,
      analysisText: exercise.analysisText,
      difficulty: effectiveDifficulty(exercise.difficulty, preference?.difficultyOverride),
      originalDifficulty: exercise.difficulty,
      knowledgePoint: {
        id: exercise.knowledgePoint.id,
        name: exercise.knowledgePoint.name,
        module: exercise.knowledgePoint.module,
      },
      preference: {
        isFavorite: favorite,
        note: preference?.note ?? "",
        difficultyOverride: preference?.difficultyOverride ?? null,
        isDisabled: disabled,
      },
      usage: {
        count: usageCount,
        lastUsedAt: exercise.usages[0]?.createdAt ?? null,
      },
      masteryScore,
      masteryLabel: masteryBucket(masteryScore),
      recommendedWeight:
        (typeof masteryScore === "number" ? 100 - masteryScore : 45) +
        (favorite ? 12 : 0) -
        usageCount * 18 -
        (disabled ? 999 : 0),
    };
  });
  const filtered = rows.filter((row) => {
    if (view === "favorites") return row.preference.isFavorite;
    if (view === "unused") return !row.preference.isDisabled && row.usage.count === 0;
    if (view === "all") return true;
    return !row.preference.isDisabled;
  });
  const sorted =
    view === "recommended"
      ? filtered.sort((a, b) => b.recommendedWeight - a.recommendedWeight || a.difficulty - b.difficulty)
      : filtered.sort((a, b) => a.difficulty - b.difficulty || a.sourceLabel.localeCompare(b.sourceLabel));

  return sorted.slice(0, clampTake(take));
}

export async function appendExerciseToPack({
  teacherId,
  packId,
  textbookExerciseId,
}: {
  teacherId: string;
  packId: string;
  textbookExerciseId: string;
}) {
  const [pack, exercise] = await Promise.all([
    prisma.practicePack.findFirst({
      where: { id: packId, teacherId },
      include: { items: { select: { order: true } } },
    }),
    prisma.textbookExercise.findUnique({
      where: { id: textbookExerciseId },
      include: { knowledgePoint: true, preferences: { where: { teacherId } } },
    }),
  ]);

  if (!pack) throw new Error("练习包不存在");
  if (!exercise) throw new Error("题源不存在");

  const preference = exercise.preferences[0];
  if (preference?.isDisabled) throw new Error("该题源已停用");

  const nextOrder = (pack.items.reduce((max, item) => Math.max(max, item.order), 0) ?? 0) + 1;
  const prompt = `【${exercise.knowledgePoint.name} · ${exercise.sourceLabel}】\n${exercise.prompt}`;

  const item = await prisma.$transaction(async (tx) => {
    const practiceItem = await tx.practiceItem.create({
      data: {
        packId: pack.id,
        order: nextOrder,
        prompt,
        answerText: exercise.answerText ?? "",
        analysisText: exercise.analysisText ?? "",
        isAiDraft: false,
        knowledgePointId: exercise.knowledgePointId,
        textbookExerciseId: exercise.id,
      },
    });

    await tx.textbookExerciseUsage.create({
      data: {
        teacherId,
        studentId: pack.studentId,
        packId: pack.id,
        practiceItemId: practiceItem.id,
        textbookExerciseId: exercise.id,
      },
    });

    await tx.practicePack.update({
      where: { id: pack.id },
      data: { status: PracticePackStatus.DRAFT, regionTag: RegionTag.JS },
    });

    return practiceItem;
  });

  return item;
}

export async function saveExercisePreference({
  teacherId,
  textbookExerciseId,
  isFavorite,
  note,
  difficultyOverride,
  isDisabled,
}: {
  teacherId: string;
  textbookExerciseId: string;
  isFavorite?: boolean;
  note?: string | null;
  difficultyOverride?: number | null;
  isDisabled?: boolean;
}) {
  const exercise = await prisma.textbookExercise.findUnique({
    where: { id: textbookExerciseId },
    select: { id: true },
  });

  if (!exercise) throw new Error("题源不存在");

  return prisma.textbookExercisePreference.upsert({
    where: {
      teacherId_textbookExerciseId: {
        teacherId,
        textbookExerciseId,
      },
    },
    update: {
      isFavorite,
      note,
      difficultyOverride,
      isDisabled,
    },
    create: {
      teacherId,
      textbookExerciseId,
      isFavorite: isFavorite ?? false,
      note,
      difficultyOverride,
      isDisabled: isDisabled ?? false,
    },
  });
}

export async function selectExercisesForPracticePack({
  teacherId,
  studentId,
  knowledgePointIds,
}: {
  teacherId: string;
  studentId: string;
  knowledgePointIds: string[];
}) {
  const [masteries, usages, preferences, mistakes] = await Promise.all([
    prisma.knowledgeMastery.findMany({ where: { studentId } }),
    prisma.textbookExerciseUsage.findMany({
      where: { teacherId, studentId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.textbookExercisePreference.findMany({ where: { teacherId } }),
    prisma.mistake.findMany({
      where: {
        studentId,
        knowledgeLinks: {
          some: { knowledgePointId: { in: knowledgePointIds } },
        },
      },
      include: { knowledgeLinks: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  const masteryMap = new Map(masteries.map((item) => [item.knowledgePointId, item.score]));
  const usageMap = new Map<string, number>();

  for (const usage of usages) {
    usageMap.set(usage.textbookExerciseId, (usageMap.get(usage.textbookExerciseId) ?? 0) + 1);
  }

  const preferenceMap = new Map(preferences.map((item) => [item.textbookExerciseId, item]));
  const exercises = await prisma.textbookExercise.findMany({
    where: { knowledgePointId: { in: knowledgePointIds } },
    include: { knowledgePoint: true },
    orderBy: [{ difficulty: "asc" }, { sourceLabel: "asc" }],
  });
  const byPoint = new Map<string, typeof exercises>();

  for (const exercise of exercises) {
    const preference = preferenceMap.get(exercise.id);
    if (preference?.isDisabled) continue;
    const existing = byPoint.get(exercise.knowledgePointId) ?? [];
    existing.push(exercise);
    byPoint.set(exercise.knowledgePointId, existing);
  }

  let order = 1;
  const items = knowledgePointIds.flatMap((pointId) => {
    const pointExercises = byPoint.get(pointId) ?? [];
    const score = masteryMap.get(pointId) ?? 50;
    const targetCount = score < 60 ? 3 : score < 80 ? 2 : 1;
    const sorted = [...pointExercises].sort((a, b) => {
      const aUsage = usageMap.get(a.id) ?? 0;
      const bUsage = usageMap.get(b.id) ?? 0;
      if (aUsage !== bUsage) return aUsage - bUsage;
      const aPreference = preferenceMap.get(a.id);
      const bPreference = preferenceMap.get(b.id);
      const aFavorite = aPreference?.isFavorite ? 1 : 0;
      const bFavorite = bPreference?.isFavorite ? 1 : 0;
      if (aFavorite !== bFavorite) return bFavorite - aFavorite;
      return a.difficulty - b.difficulty;
    });
    const source = mistakes.find((mistake) =>
      mistake.knowledgeLinks.some((link) => link.knowledgePointId === pointId),
    );

    return sorted.slice(0, targetCount).map((exercise) => ({
      order: order++,
      knowledgePointId: exercise.knowledgePointId,
      textbookExerciseId: exercise.id,
      sourceMistakeId: source?.id,
      prompt: `【${exercise.knowledgePoint.name} · ${exercise.sourceLabel}】\n${exercise.prompt}`,
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

  return items;
}
