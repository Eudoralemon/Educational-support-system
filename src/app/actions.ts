"use server";

import { RegionTag } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { teacherCookieName } from "@/lib/auth";
import { prisma } from "@/lib/db";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getRegion(value: string | null | undefined): RegionTag {
  if (value === "JS" || value === "GD" || value === "COMMON") {
    return value;
  }

  return "COMMON";
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

export async function createClass(formData: FormData) {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(teacherCookieName)?.value;

  if (!teacherId) {
    redirect("/login");
  }

  const name = getString(formData, "name");
  if (!name) return;

  await prisma.classGroup.create({
    data: {
      name,
      teacherId,
      region: getRegion(getString(formData, "region")),
    },
  });

  revalidatePath("/dashboard");
}

export async function createStudent(formData: FormData) {
  const classId = getString(formData, "classId");
  const name = getString(formData, "name");

  if (!classId || !name) return;

  const classGroup = await prisma.classGroup.findUnique({
    where: { id: classId },
  });

  if (!classGroup) return;

  await prisma.student.create({
    data: {
      name,
      classId,
      grade: getString(formData, "grade") || "高三",
      school: getString(formData, "school") || null,
      region: getRegion(getString(formData, "region") || classGroup.region),
    },
  });

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/dashboard");
}

export async function createPracticePackAction(formData: FormData) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/practice-packs`, {
    method: "POST",
    body: JSON.stringify({
      title: getString(formData, "title") || undefined,
      classId: getString(formData, "classId") || undefined,
      studentId: getString(formData, "studentId") || undefined,
      knowledgePointIds: getString(formData, "knowledgePointIds")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) return;

  const payload = (await response.json()) as { id: string };
  redirect(`/practice-packs/${payload.id}`);
}
