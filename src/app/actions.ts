"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { teacherCookieName } from "@/lib/auth";
import { prisma } from "@/lib/db";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(teacherCookieName)?.value;

  if (!teacherId) {
    redirect("/login");
  }

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
