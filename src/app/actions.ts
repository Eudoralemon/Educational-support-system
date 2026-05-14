"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ReviewCadence, ReviewResult, ReviewTermMode } from "@prisma/client";
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
