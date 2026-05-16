"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { unlink } from "node:fs/promises";
import path from "node:path";
import {
  ReviewCadence,
  ReviewResult,
  ReviewTermMode,
  StudentStatus,
  TeachingContributorKind,
  TeachingContributionType,
  TextbookContentBlockType,
  TextbookExerciseSourceType,
} from "@prisma/client";
import { teacherCookieName } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordMistakeReview } from "@/lib/review";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function requireTeacherId() {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(teacherCookieName)?.value;

  if (!teacherId) {
    redirect("/login");
  }

  return teacherId;
}

function asReviewTermMode(value: string): ReviewTermMode {
  return value === ReviewTermMode.HOLIDAY ? ReviewTermMode.HOLIDAY : ReviewTermMode.TERM;
}

function asReviewCadence(value: string): ReviewCadence {
  if (
    value === ReviewCadence.WEEKLY_WEEKEND ||
    value === ReviewCadence.BIWEEKLY_WEEKEND ||
    value === ReviewCadence.MONTHLY_WEEKEND ||
    value === ReviewCadence.HOLIDAY_ONLY
  ) {
    return value;
  }

  return ReviewCadence.WEEKLY_WEEKEND;
}

function asReviewResult(value: string): ReviewResult {
  if (
    value === ReviewResult.FORGOT ||
    value === ReviewResult.PARTIAL ||
    value === ReviewResult.MASTERED
  ) {
    return value;
  }

  return ReviewResult.PARTIAL;
}

function asTeachingContributionType(value: string): TeachingContributionType {
  if (
    value === TeachingContributionType.KNOWLEDGE_EXPLANATION ||
    value === TeachingContributionType.EXERCISE_SOLUTION
  ) {
    return value;
  }

  return TeachingContributionType.KNOWLEDGE_EXPLANATION;
}

function asTeachingContributorKind(value: string): TeachingContributorKind {
  return value === TeachingContributorKind.STUDENT
    ? TeachingContributorKind.STUDENT
    : TeachingContributorKind.TEACHER;
}

function asTextbookContentBlockType(value: string): TextbookContentBlockType {
  return Object.values(TextbookContentBlockType).includes(value as TextbookContentBlockType)
    ? (value as TextbookContentBlockType)
    : TextbookContentBlockType.OTHER;
}

function optionalInt(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function resolveTeachingContributor({
  teacherId,
  kind,
  studentId,
}: {
  teacherId: string;
  kind: TeachingContributorKind;
  studentId: string;
}) {
  if (kind === TeachingContributorKind.STUDENT && studentId) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, teacherId },
      select: { id: true, name: true },
    });

    if (student) {
      return {
        contributorKind: TeachingContributorKind.STUDENT,
        contributorStudentId: student.id,
        contributorName: student.name,
      };
    }
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { name: true },
  });

  return {
    contributorKind: TeachingContributorKind.TEACHER,
    contributorStudentId: null,
    contributorName: teacher?.name ?? "数学教师",
  };
}

async function resolveTeachingExercise({
  knowledgePointId,
  textbookExerciseId,
  exercisePromptSnapshot,
  type,
}: {
  knowledgePointId: string;
  textbookExerciseId: string;
  exercisePromptSnapshot: string;
  type: TeachingContributionType;
}) {
  if (type !== TeachingContributionType.EXERCISE_SOLUTION) {
    return {
      textbookExerciseId: null,
      exercisePromptSnapshot: null,
    };
  }

  const exercise = textbookExerciseId
    ? await prisma.textbookExercise.findFirst({
        where: { id: textbookExerciseId, knowledgePointId },
        select: { id: true, prompt: true },
      })
    : null;

  return {
    textbookExerciseId: exercise?.id ?? null,
    exercisePromptSnapshot: exercisePromptSnapshot || exercise?.prompt || null,
  };
}

export async function loginTeacher(formData: FormData) {
  const name = getString(formData, "name") || "数学教师";
  const phone = getString(formData, "phone") || null;

  const teacher = phone
    ? await prisma.teacher.upsert({
        where: { phone },
        update: { name },
        create: { name, phone },
      })
    : await prisma.teacher.create({
        data: { name },
      });

  const cookieStore = await cookies();
  cookieStore.set(teacherCookieName, teacher.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });

  redirect("/dashboard");
}

export async function logoutTeacher() {
  const cookieStore = await cookies();
  cookieStore.delete(teacherCookieName);
  redirect("/login");
}

export async function createStudent(formData: FormData) {
  const teacherId = await requireTeacherId();

  const name = getString(formData, "name");
  if (!name) return;

  await prisma.student.create({
    data: {
      name,
      teacherId,
      grade: getString(formData, "grade") || "高三",
      school: getString(formData, "school") || null,
      province: "江苏",
      textbookTrack: "苏教版",
    },
  });

  revalidatePath("/dashboard");
}

export async function setTeacherReviewMode(formData: FormData) {
  const teacherId = await requireTeacherId();
  const reviewTermMode = asReviewTermMode(getString(formData, "reviewTermMode"));

  await prisma.teacher.update({
    where: { id: teacherId },
    data: { reviewTermMode },
  });

  revalidatePath("/dashboard");
}

export async function updateStudentReviewSettings(formData: FormData) {
  const teacherId = await requireTeacherId();
  const studentId = getString(formData, "studentId");
  const student = await prisma.student.findFirst({
    where: { id: studentId, teacherId },
    select: { id: true },
  });

  if (!student) return;

  const batchSize = Number.parseInt(getString(formData, "reviewBatchSize"), 10);
  await prisma.student.update({
    where: { id: student.id },
    data: {
      reviewCadence: asReviewCadence(getString(formData, "reviewCadence")),
      reviewBatchSize: Number.isFinite(batchSize) ? Math.min(30, Math.max(3, batchSize)) : 8,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/students/${student.id}`);
}

export async function archiveStudent(formData: FormData) {
  const teacherId = await requireTeacherId();
  const studentId = getString(formData, "studentId");
  const reason = getString(formData, "archivedReason");
  const student = await prisma.student.findFirst({
    where: { id: studentId, teacherId },
    select: { id: true },
  });

  if (!student) return;

  await prisma.student.update({
    where: { id: student.id },
    data: {
      status: StudentStatus.ARCHIVED,
      archivedAt: new Date(),
      archivedReason: reason || null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/students/${student.id}`);
}

export async function restoreStudent(formData: FormData) {
  const teacherId = await requireTeacherId();
  const studentId = getString(formData, "studentId");
  const student = await prisma.student.findFirst({
    where: { id: studentId, teacherId },
    select: { id: true },
  });

  if (!student) return;

  await prisma.student.update({
    where: { id: student.id },
    data: {
      status: StudentStatus.ACTIVE,
      archivedAt: null,
      archivedReason: null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/students/${student.id}`);
}

async function removeUploadFiles(relativePaths: string[]) {
  const uploadsDir = path.join(process.cwd(), "uploads");
  const uniquePaths = Array.from(new Set(relativePaths.filter((item) => item.startsWith("uploads/"))));

  for (const relativePath of uniquePaths) {
    const target = path.join(uploadsDir, path.basename(relativePath));
    try {
      await unlink(target);
    } catch {
      // Best-effort cleanup only; database deletion should not fail because a file is already gone.
    }
  }
}

export async function hardDeleteStudent(formData: FormData) {
  const teacherId = await requireTeacherId();
  const studentId = getString(formData, "studentId");
  const confirmName = getString(formData, "confirmName");
  const student = await prisma.student.findFirst({
    where: { id: studentId, teacherId },
    include: {
      mistakes: {
        include: {
          attachments: true,
        },
      },
    },
  });

  if (!student || confirmName !== student.name) return;

  const filePaths = student.mistakes.flatMap((mistake) => [
    mistake.imagePath,
    ...mistake.attachments.map((attachment) => attachment.imagePath),
  ]).filter((item): item is string => Boolean(item));

  await prisma.student.delete({ where: { id: student.id } });
  await removeUploadFiles(filePaths);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function completeMistakeReview(formData: FormData) {
  const teacherId = await requireTeacherId();
  const mistakeId = getString(formData, "mistakeId");
  const result = asReviewResult(getString(formData, "result"));
  const note = getString(formData, "note");
  const review = await recordMistakeReview({
    teacherId,
    mistakeId,
    result,
    note,
  });

  revalidatePath("/dashboard");
  revalidatePath(`/students/${review.studentId}`);
  revalidatePath(`/diagnostics/student/${review.studentId}`);
  revalidatePath(`/mistakes/${mistakeId}/review`);
}

export async function updateTextbookContentBlock(formData: FormData) {
  await requireTeacherId();
  const blockId = getString(formData, "blockId");
  const contentText = getString(formData, "contentText");
  const knowledgePointId = getString(formData, "knowledgePointId");

  if (!blockId || !contentText) return;

  const knowledgePoint = knowledgePointId
    ? await prisma.knowledgePoint.findUnique({ where: { id: knowledgePointId } })
    : null;

  await prisma.textbookContentBlock.update({
    where: { id: blockId },
    data: {
      title: getString(formData, "title") || null,
      textbook: knowledgePoint?.textbook ?? undefined,
      blockType: asTextbookContentBlockType(getString(formData, "blockType")),
      sourceLabel: getString(formData, "sourceLabel") || "教师修订内容",
      sourcePageStart: optionalInt(getString(formData, "sourcePageStart")),
      sourcePageEnd: optionalInt(getString(formData, "sourcePageEnd")),
      contentText,
      chapter: knowledgePoint?.chapter ?? (getString(formData, "chapter") || "未定位章节"),
      section: knowledgePoint?.section ?? (getString(formData, "section") || null),
      knowledgePointId: knowledgePoint?.id ?? null,
      confidence: 95,
      isTeacherEdited: true,
      isArchived: false,
      editedAt: new Date(),
    },
  });

  revalidatePath("/textbooks/recognition");
}

export async function archiveTextbookContentBlock(formData: FormData) {
  await requireTeacherId();
  const blockId = getString(formData, "blockId");
  if (!blockId) return;

  await prisma.textbookContentBlock.update({
    where: { id: blockId },
    data: {
      isArchived: true,
      archivedAt: new Date(),
      isTeacherEdited: true,
      editedAt: new Date(),
    },
  });

  revalidatePath("/textbooks/recognition");
}

export async function saveTextbookCandidate(formData: FormData) {
  await requireTeacherId();
  const candidateId = getString(formData, "candidateId");
  const knowledgePointId = getString(formData, "knowledgePointId");
  const prompt = getString(formData, "prompt");
  const answerText = getString(formData, "answerText");
  const analysisText = getString(formData, "analysisText");

  if (!candidateId || !knowledgePointId || !prompt) return;

  const [candidate, knowledgePoint] = await Promise.all([
    prisma.textbookExerciseCandidate.findUnique({
      where: { id: candidateId },
      include: { textbookExercise: true },
    }),
    prisma.knowledgePoint.findUnique({ where: { id: knowledgePointId } }),
  ]);

  if (!candidate || !knowledgePoint) return;

  await prisma.textbookExerciseCandidate.update({
    where: { id: candidate.id },
    data: {
      prompt,
      answerText: answerText || null,
      analysisText: analysisText || null,
      knowledgePointId: knowledgePoint.id,
      textbook: knowledgePoint.textbook,
      chapter: knowledgePoint.chapter,
      section: knowledgePoint.section,
      confidence: 88,
      rejected: false,
      isArchived: false,
      isTeacherEdited: true,
      editedAt: new Date(),
      reason: "教师人工修订",
    },
  });

  if (candidate.textbookExerciseId) {
    await prisma.textbookExercise.update({
      where: { id: candidate.textbookExerciseId },
      data: {
        textbook: knowledgePoint.textbook,
        chapter: knowledgePoint.chapter,
        section: knowledgePoint.section,
        prompt,
        answerText: answerText || null,
        analysisText: analysisText || null,
        isTeacherVerified: true,
        isArchived: false,
        knowledgePointId: knowledgePoint.id,
      },
    });
  }

  revalidatePath("/textbooks/recognition");
}

export async function confirmTextbookCandidate(formData: FormData) {
  await requireTeacherId();
  const candidateId = getString(formData, "candidateId");
  const knowledgePointId = getString(formData, "knowledgePointId");
  const prompt = getString(formData, "prompt");
  const answerText = getString(formData, "answerText");
  const analysisText = getString(formData, "analysisText");

  if (!candidateId || !knowledgePointId || !prompt) return;

  const [candidate, knowledgePoint] = await Promise.all([
    prisma.textbookExerciseCandidate.findUnique({
      where: { id: candidateId },
      include: { textbookExercise: true },
    }),
    prisma.knowledgePoint.findUnique({ where: { id: knowledgePointId } }),
  ]);

  if (!candidate || !knowledgePoint) return;

  const code =
    candidate.textbookExercise?.code ??
    `${knowledgePoint.code}-TB-MANUAL-${String(candidate.sourcePage ?? 0).padStart(3, "0")}-${candidate.id.slice(-4)}`;
  const exercise = await prisma.textbookExercise.upsert({
    where: { code },
    update: {
      textbook: candidate.textbook,
      chapter: candidate.chapter,
      section: candidate.section,
      sourcePage: candidate.sourcePage,
      sourceLabel: candidate.sourceLabel,
      prompt,
      answerText: answerText || null,
      analysisText: analysisText || null,
      sourceType: candidate.sourceBlockId ? TextbookExerciseSourceType.EXTRACTED : TextbookExerciseSourceType.MANUAL,
      isTeacherVerified: true,
      isArchived: false,
      archivedAt: null,
      sourceBlockId: candidate.sourceBlockId,
      knowledgePointId: knowledgePoint.id,
    },
    create: {
      code,
      textbook: candidate.textbook,
      chapter: candidate.chapter,
      section: candidate.section,
      sourcePage: candidate.sourcePage,
      sourceLabel: candidate.sourceLabel,
      prompt,
      answerText: answerText || null,
      analysisText: analysisText || null,
      difficulty: 2,
      sourceType: candidate.sourceBlockId ? TextbookExerciseSourceType.EXTRACTED : TextbookExerciseSourceType.MANUAL,
      isTeacherVerified: true,
      isArchived: false,
      archivedAt: null,
      sourceBlockId: candidate.sourceBlockId,
      knowledgePointId: knowledgePoint.id,
    },
  });

  await prisma.textbookExerciseCandidate.update({
    where: { id: candidate.id },
    data: {
      prompt,
      answerText: answerText || null,
      analysisText: analysisText || null,
      confidence: 88,
      accepted: true,
      rejected: false,
      isArchived: false,
      isTeacherEdited: true,
      editedAt: new Date(),
      archivedAt: null,
      knowledgePointId: knowledgePoint.id,
      textbookExerciseId: exercise.id,
      reason: "教师人工确认",
    },
  });

  revalidatePath("/textbooks/recognition");
}

export async function rejectTextbookCandidate(formData: FormData) {
  await requireTeacherId();
  const candidateId = getString(formData, "candidateId");
  if (!candidateId) return;

  await prisma.textbookExerciseCandidate.update({
    where: { id: candidateId },
    data: {
      rejected: true,
      accepted: false,
      isTeacherEdited: true,
      editedAt: new Date(),
    },
  });

  revalidatePath("/textbooks/recognition");
}

export async function archiveTextbookCandidate(formData: FormData) {
  await requireTeacherId();
  const candidateId = getString(formData, "candidateId");
  if (!candidateId) return;

  const candidate = await prisma.textbookExerciseCandidate.findUnique({
    where: { id: candidateId },
    select: { id: true, textbookExerciseId: true },
  });
  if (!candidate) return;

  await prisma.$transaction([
    prisma.textbookExerciseCandidate.update({
      where: { id: candidate.id },
      data: {
        isArchived: true,
        rejected: true,
        accepted: false,
        archivedAt: new Date(),
        isTeacherEdited: true,
        editedAt: new Date(),
      },
    }),
    ...(candidate.textbookExerciseId
      ? [
          prisma.textbookExercise.update({
            where: { id: candidate.textbookExerciseId },
            data: {
              isArchived: true,
              archivedAt: new Date(),
              isTeacherVerified: true,
            },
          }),
        ]
      : []),
  ]);

  revalidatePath("/textbooks/recognition");
}

export async function createTeachingContribution(formData: FormData) {
  const teacherId = await requireTeacherId();
  const knowledgePointId = getString(formData, "knowledgePointId");
  const type = asTeachingContributionType(getString(formData, "type"));
  const title = getString(formData, "title");
  const content = getString(formData, "content");

  if (!knowledgePointId || !title || !content) return;

  const knowledgePoint = await prisma.knowledgePoint.findUnique({
    where: { id: knowledgePointId },
    select: { id: true },
  });

  if (!knowledgePoint) return;

  const contributor = await resolveTeachingContributor({
    teacherId,
    kind: asTeachingContributorKind(getString(formData, "contributorKind")),
    studentId: getString(formData, "contributorStudentId"),
  });
  const exercise = await resolveTeachingExercise({
    knowledgePointId,
    textbookExerciseId: getString(formData, "textbookExerciseId"),
    exercisePromptSnapshot: getString(formData, "exercisePromptSnapshot"),
    type,
  });

  await prisma.teachingContribution.create({
    data: {
      teacherId,
      knowledgePointId,
      type,
      title,
      content,
      backgroundKnowledge: getString(formData, "backgroundKnowledge") || null,
      ...contributor,
      ...exercise,
    },
  });

  revalidatePath("/teaching");
  revalidatePath(`/teaching/knowledge-points/${knowledgePointId}`);
}

export async function updateTeachingContribution(formData: FormData) {
  const teacherId = await requireTeacherId();
  const contributionId = getString(formData, "contributionId");
  const title = getString(formData, "title");
  const content = getString(formData, "content");

  if (!contributionId || !title || !content) return;

  const contribution = await prisma.teachingContribution.findFirst({
    where: { id: contributionId, teacherId },
    select: { id: true, knowledgePointId: true },
  });

  if (!contribution) return;

  const type = asTeachingContributionType(getString(formData, "type"));
  const contributor = await resolveTeachingContributor({
    teacherId,
    kind: asTeachingContributorKind(getString(formData, "contributorKind")),
    studentId: getString(formData, "contributorStudentId"),
  });
  const exercise = await resolveTeachingExercise({
    knowledgePointId: contribution.knowledgePointId,
    textbookExerciseId: getString(formData, "textbookExerciseId"),
    exercisePromptSnapshot: getString(formData, "exercisePromptSnapshot"),
    type,
  });

  await prisma.teachingContribution.update({
    where: { id: contribution.id },
    data: {
      type,
      title,
      content,
      backgroundKnowledge: getString(formData, "backgroundKnowledge") || null,
      ...contributor,
      ...exercise,
    },
  });

  revalidatePath("/teaching");
  revalidatePath(`/teaching/knowledge-points/${contribution.knowledgePointId}`);
}

export async function archiveTeachingContribution(formData: FormData) {
  const teacherId = await requireTeacherId();
  const contributionId = getString(formData, "contributionId");
  if (!contributionId) return;

  const contribution = await prisma.teachingContribution.findFirst({
    where: { id: contributionId, teacherId },
    select: { id: true, knowledgePointId: true },
  });

  if (!contribution) return;

  await prisma.teachingContribution.update({
    where: { id: contribution.id },
    data: { isArchived: true },
  });

  revalidatePath("/teaching");
  revalidatePath(`/teaching/knowledge-points/${contribution.knowledgePointId}`);
}
