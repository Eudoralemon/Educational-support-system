import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, BookOpen, BookOpenCheck, ClipboardList, Home, LogOut, Upload, UserRound } from "lucide-react";
import { logoutTeacher } from "@/app/actions";
import { getCurrentTeacher } from "@/lib/auth";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "高中数学错题诊断",
  description: "面向江苏高中数学学生的轻量教学辅助系统",
};

function Sidebar({ teacherName }: { teacherName?: string }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-title">数学错题诊断</span>
        <span className="brand-subtitle">{teacherName ?? "本地教学辅助"}</span>
      </div>
      <nav className="nav-list">
        <Link className="nav-link" href="/dashboard">
          <Home size={18} />
          工作台
        </Link>
        <Link className="nav-link" href="/mistakes/new">
          <Upload size={18} />
          录入错题
        </Link>
        <Link className="nav-link" href="/dashboard#students">
          <UserRound size={18} />
          学生
        </Link>
        <Link className="nav-link" href="/dashboard#practice">
          <ClipboardList size={18} />
          练习包
        </Link>
        <Link className="nav-link" href="/dashboard#diagnostics">
          <BarChart3 size={18} />
          诊断
        </Link>
        <Link className="nav-link" href="/teaching">
          <BookOpen size={18} />
          教案中心
        </Link>
        <Link className="nav-link" href="/textbooks/recognition">
          <BookOpenCheck size={18} />
          教材识别
        </Link>
        {teacherName ? (
          <form action={logoutTeacher}>
            <button className="nav-button" type="submit">
              <LogOut size={18} />
              退出
            </button>
          </form>
        ) : null}
      </nav>
    </aside>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const teacher = await getCurrentTeacher();

  return (
    <html lang="zh-CN">
      <body>
        <div className="app-shell">
          <Sidebar teacherName={teacher?.name} />
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
