import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const teacherCookieName = "math_teacher_id";

export async function getCurrentTeacher() {
  const cookieStore = await cookies();
  const teacherId = cookieStore.get(teacherCookieName)?.value;

  if (!teacherId) {
    return null;
  }

  return prisma.teacher.findUnique({
    where: { id: teacherId },
  });
}

export async function requireTeacher() {
  const teacher = await getCurrentTeacher();

  if (!teacher) {
    redirect("/login");
  }

  return teacher;
}
