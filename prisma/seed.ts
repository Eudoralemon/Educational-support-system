import { MistakeStatus, PrismaClient, RegionTag, TextbookExerciseSourceType } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const textbookPdfFiles: Record<string, string> = {
  "苏教版高中数学 必修第1册": "苏教版高中数学 必修第1册.pdf",
  "苏教版高中数学 必修第2册": "苏教版高中数学 必修第2册.pdf",
  "苏教版高中数学 选择性必修1": "苏教版高中数学 选择性必修1.pdf",
  "苏教版高中数学 选择性必修2": "苏教版高中数学 选择性必修2.pdf",
};

const textbookCatalog = [
  {
    textbook: "苏教版高中数学 必修第1册",
    chapter: "第1章 集合",
    module: "集合与逻辑",
    sections: ["集合的概念与表示", "子集、全集、补集", "交集、并集"],
  },
  {
    textbook: "苏教版高中数学 必修第1册",
    chapter: "第2章 常用逻辑用语",
    module: "集合与逻辑",
    sections: ["命题、定理、定义", "充分条件、必要条件、充要条件", "全称量词命题与存在量词命题"],
  },
  {
    textbook: "苏教版高中数学 必修第1册",
    chapter: "第3章 不等式",
    module: "不等式",
    sections: ["不等式的基本性质", "基本不等式", "一元二次方程与一元二次不等式"],
  },
  {
    textbook: "苏教版高中数学 必修第1册",
    chapter: "第4章 指数与对数",
    module: "函数",
    sections: ["指数", "对数"],
  },
  {
    textbook: "苏教版高中数学 必修第1册",
    chapter: "第5章 函数概念与性质",
    module: "函数",
    sections: ["函数的概念和图象", "函数的表示方法", "函数的单调性", "函数的奇偶性"],
  },
  {
    textbook: "苏教版高中数学 必修第1册",
    chapter: "第6章 幂函数、指数函数和对数函数",
    module: "函数",
    sections: ["幂函数", "指数函数", "对数函数"],
  },
  {
    textbook: "苏教版高中数学 必修第1册",
    chapter: "第7章 三角函数",
    module: "三角函数",
    sections: ["角与弧度", "三角函数概念", "三角函数的图象和性质", "三角函数应用"],
  },
  {
    textbook: "苏教版高中数学 必修第1册",
    chapter: "第8章 函数应用",
    module: "函数",
    sections: ["二分法与求方程近似解", "函数与数学模型"],
  },
  {
    textbook: "苏教版高中数学 必修第2册",
    chapter: "第9章 平面向量",
    module: "平面向量",
    sections: ["向量概念", "向量运算", "向量基本定理及坐标表示", "向量应用"],
  },
  {
    textbook: "苏教版高中数学 必修第2册",
    chapter: "第10章 三角恒等变换",
    module: "三角函数",
    sections: ["两角和与差的三角函数", "二倍角的三角函数", "几个三角恒等式"],
  },
  {
    textbook: "苏教版高中数学 必修第2册",
    chapter: "第11章 解三角形",
    module: "解三角形",
    sections: ["余弦定理", "正弦定理", "正弦定理、余弦定理的应用"],
  },
  {
    textbook: "苏教版高中数学 必修第2册",
    chapter: "第12章 复数",
    module: "复数",
    sections: ["复数的概念", "复数的运算", "复数的几何意义", "复数的三角形式"],
  },
  {
    textbook: "苏教版高中数学 必修第2册",
    chapter: "第13章 立体几何初步",
    module: "立体几何",
    sections: ["基本立体图形", "基本图形位置关系", "空间图形的表面积和体积"],
  },
  {
    textbook: "苏教版高中数学 必修第2册",
    chapter: "第14章 统计",
    module: "统计",
    sections: ["获取数据的基本途径及相关概念", "抽样", "统计图表", "用样本估计总体"],
  },
  {
    textbook: "苏教版高中数学 必修第2册",
    chapter: "第15章 概率",
    module: "概率",
    sections: ["随机事件和样本空间", "随机事件的概率", "互斥事件和独立事件"],
  },
  {
    textbook: "苏教版高中数学 选择性必修1",
    chapter: "第1章 直线与方程",
    module: "解析几何",
    sections: ["直线的斜率与倾斜角", "直线的方程", "两条直线的平行与垂直", "两条直线的交点", "平面上的距离"],
  },
  {
    textbook: "苏教版高中数学 选择性必修1",
    chapter: "第2章 圆与方程",
    module: "解析几何",
    sections: ["圆的方程", "直线与圆的位置关系", "圆与圆的位置关系"],
  },
  {
    textbook: "苏教版高中数学 选择性必修1",
    chapter: "第3章 圆锥曲线与方程",
    module: "解析几何",
    sections: ["椭圆", "双曲线", "抛物线"],
  },
  {
    textbook: "苏教版高中数学 选择性必修1",
    chapter: "第4章 数列",
    module: "数列",
    sections: ["数列", "等差数列", "等比数列", "数学归纳法"],
  },
  {
    textbook: "苏教版高中数学 选择性必修1",
    chapter: "第5章 导数及其应用",
    module: "导数",
    sections: ["导数的概念", "导数的运算", "导数在研究函数中的应用"],
  },
  {
    textbook: "苏教版高中数学 选择性必修2",
    chapter: "第6章 空间向量与立体几何",
    module: "空间向量",
    sections: ["空间向量及其运算", "空间向量的坐标表示", "空间向量的应用"],
  },
  {
    textbook: "苏教版高中数学 选择性必修2",
    chapter: "第7章 计数原理",
    module: "计数原理",
    sections: ["两个基本计数原理", "排列", "组合", "二项式定理"],
  },
  {
    textbook: "苏教版高中数学 选择性必修2",
    chapter: "第8章 概率",
    module: "概率",
    sections: ["条件概率", "离散型随机变量及其分布列", "正态分布"],
  },
  {
    textbook: "苏教版高中数学 选择性必修2",
    chapter: "第9章 统计",
    module: "统计",
    sections: ["线性回归分析", "独立性检验"],
  },
];

const errorTypes = [
  { code: "CONCEPT", name: "概念理解偏差", description: "定义、定理、适用条件没有分清。" },
  { code: "METHOD", name: "方法选择不当", description: "没有选到合适的解题入口或模型。" },
  { code: "CALCULATION", name: "运算失误", description: "代数变形、符号、数值计算出现错误。" },
  { code: "REVIEW", name: "审题遗漏", description: "忽略限制条件、问法或图形信息。" },
  { code: "EXPRESSION", name: "表达不规范", description: "步骤、结论、证明书写影响得分。" },
];

function codeFrom(textbook: string, chapter: string, section: string, index: number) {
  const bookCode =
    textbook.includes("必修第1册")
      ? "B1"
      : textbook.includes("必修第2册")
        ? "B2"
        : textbook.includes("选择性必修1")
          ? "X1"
          : "X2";
  const chapterNumber = chapter.match(/第(\d+)章/)?.[1] ?? "0";
  return `${bookCode}-C${chapterNumber.padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
}

function toHalfWidthDigits(value: string) {
  return value.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30),
  );
}

function tidyExerciseText(value: string) {
  return toHalfWidthDigits(value)
    .replace(/\r/g, "")
    .replace(/[]/g, "")
    .replace(/[ \t　]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n(?=[，。；：、）])/g, "")
    .replace(/(?<=[（(])\n/g, "")
    .trim();
}

function readTextbookPdf(textbook: string) {
  const fileName = textbookPdfFiles[textbook];
  if (!fileName) return null;

  const pdfPath = path.join(process.cwd(), fileName);
  if (!existsSync(pdfPath)) return null;

  try {
    return execFileSync("pdftotext", ["-enc", "UTF-8", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024,
      windowsHide: true,
    });
  } catch {
    return null;
  }
}

function pageForIndex(pages: string[], index: number) {
  return Math.max(1, index + 1);
}

function findSectionPage(pages: string[], section: string, chapter: string) {
  const sectionNeedle = section.replace(/\s+/g, "");
  const chapterNeedle = chapter.replace(/\s+/g, "");
  const searchablePages = pages.map((page, index) => ({ page, index })).slice(8);
  const sectionMatch = searchablePages.find(({ page }) =>
    page.replace(/\s+/g, "").includes(sectionNeedle),
  );

  if (sectionMatch) return sectionMatch.index;

  const chapterMatch = searchablePages.find(({ page }) =>
    page.replace(/\s+/g, "").includes(chapterNeedle),
  );

  return chapterMatch?.index ?? -1;
}

function extractNumberedExercises(block: string) {
  const compact = tidyExerciseText(block)
    .replace(/习题\s*[0-9０-９]+[．.][0-9０-９]+/g, "\n")
    .replace(/感受\s*[·•]\s*理解|思考\s*[·•]\s*运用|探究\s*[·•]\s*拓展/g, "\n")
    .replace(/必修第?[一二三四五六七八九十]+册\s*数学|选择性必修第?[一二三四五六七八九十]+册\s*数学/g, "\n");
  const matches = Array.from(
    compact.matchAll(/(?:^|\n)\s*([0-9０-９]{1,2})(?:[．.、])\s*/g),
  );

  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end =
        index + 1 < matches.length ? matches[index + 1].index ?? compact.length : compact.length;
      const raw = compact.slice(start, end);
      return tidyExerciseText(raw).replace(/\s*\f\s*/g, " ");
    })
    .filter((prompt) => prompt.length >= 16 && prompt.length <= 700)
    .filter((prompt) => !/^([0-9]+[．.]\s*)?练\s*习/.test(prompt));
}

function exercisesFromSectionText(sectionText: string) {
  const exerciseStart = sectionText.search(/练\s*习|习题\s*[0-9０-９]/);
  if (exerciseStart < 0) return [];

  const fromExercise = sectionText.slice(exerciseStart);
  const stop = fromExercise.search(/\n\s*[0-9０-９]+[．.][0-9０-９]+|第[0-9０-９]+章|专题|附录/);
  const block = stop > 80 ? fromExercise.slice(0, stop) : fromExercise;

  return extractNumberedExercises(block).slice(0, 3);
}

async function seedFallbackExercise(point: {
  id: string;
  code: string;
  name: string;
  textbook: string;
  chapter: string;
  section: string | null;
}) {
  await prisma.textbookExercise.upsert({
    where: { code: `${point.code}-TB-FALLBACK-01` },
    update: {
      textbook: point.textbook,
      chapter: point.chapter,
      section: point.section,
      sourceLabel: "教材练习/习题",
      prompt: `【教材题源】请打开《${point.textbook}》${point.chapter}${point.section ? `“${point.section}”` : ""}，选做本节“练习”或“习题”中与“${point.name}”对应的一题，并完整作答。`,
      analysisText: "本题源自本地苏教版教材目录定位；若需自动写入原题，请确认项目根目录保留对应 PDF 并重新运行 npm.cmd run db:seed。",
      difficulty: 1,
      sourceType: TextbookExerciseSourceType.FALLBACK,
      isTeacherVerified: false,
      knowledgePointId: point.id,
    },
    create: {
      code: `${point.code}-TB-FALLBACK-01`,
      textbook: point.textbook,
      chapter: point.chapter,
      section: point.section,
      sourceLabel: "教材练习/习题",
      prompt: `【教材题源】请打开《${point.textbook}》${point.chapter}${point.section ? `“${point.section}”` : ""}，选做本节“练习”或“习题”中与“${point.name}”对应的一题，并完整作答。`,
      analysisText: "本题源自本地苏教版教材目录定位；若需自动写入原题，请确认项目根目录保留对应 PDF 并重新运行 npm.cmd run db:seed。",
      difficulty: 1,
      sourceType: TextbookExerciseSourceType.FALLBACK,
      isTeacherVerified: false,
      knowledgePointId: point.id,
    },
  });
}

async function seedTextbookExercises() {
  const textCache = new Map<string, string[] | null>();
  const points = await prisma.knowledgePoint.findMany({
    orderBy: [{ textbook: "asc" }, { chapter: "asc" }, { code: "asc" }],
  });

  for (const point of points) {
    if (!textCache.has(point.textbook)) {
      const text = readTextbookPdf(point.textbook);
      textCache.set(point.textbook, text ? text.split("\f") : null);
    }

    const pages = textCache.get(point.textbook);
    if (!pages) {
      await seedFallbackExercise(point);
      continue;
    }

    const startPage = findSectionPage(pages, point.section ?? point.name, point.chapter);
    if (startPage < 0) {
      await seedFallbackExercise(point);
      continue;
    }

    const windowText = pages.slice(startPage, Math.min(pages.length, startPage + 8)).join("\n");
    const prompts = exercisesFromSectionText(windowText);

    if (prompts.length === 0) {
      await seedFallbackExercise(point);
      continue;
    }

    for (const [index, prompt] of prompts.entries()) {
      await prisma.textbookExercise.upsert({
        where: { code: `${point.code}-TB-${String(index + 1).padStart(2, "0")}` },
        update: {
          textbook: point.textbook,
          chapter: point.chapter,
          section: point.section,
          sourcePage: pageForIndex(pages, startPage),
          sourceLabel: `教材练习 ${index + 1}`,
          prompt,
          analysisText: `来源：《${point.textbook}》${point.chapter}${point.section ? ` ${point.section}` : ""}。`,
          difficulty: index + 1,
          sourceType: TextbookExerciseSourceType.EXTRACTED,
          isTeacherVerified: false,
          knowledgePointId: point.id,
        },
        create: {
          code: `${point.code}-TB-${String(index + 1).padStart(2, "0")}`,
          textbook: point.textbook,
          chapter: point.chapter,
          section: point.section,
          sourcePage: pageForIndex(pages, startPage),
          sourceLabel: `教材练习 ${index + 1}`,
          prompt,
          analysisText: `来源：《${point.textbook}》${point.chapter}${point.section ? ` ${point.section}` : ""}。`,
          difficulty: index + 1,
          sourceType: TextbookExerciseSourceType.EXTRACTED,
          isTeacherVerified: false,
          knowledgePointId: point.id,
        },
      });
    }
  }
}

async function main() {
  for (const chapter of textbookCatalog) {
    for (const [index, section] of chapter.sections.entries()) {
      await prisma.knowledgePoint.upsert({
        where: { code: codeFrom(chapter.textbook, chapter.chapter, section, index) },
        update: {
          name: section,
          module: chapter.module,
          textbook: chapter.textbook,
          chapter: chapter.chapter,
          section,
          region: RegionTag.JS,
          examWeight: chapter.module === "导数" || chapter.module === "解析几何" ? 5 : 3,
        },
        create: {
          code: codeFrom(chapter.textbook, chapter.chapter, section, index),
          name: section,
          module: chapter.module,
          textbook: chapter.textbook,
          chapter: chapter.chapter,
          section,
          region: RegionTag.JS,
          examWeight: chapter.module === "导数" || chapter.module === "解析几何" ? 5 : 3,
        },
      });
    }
  }

  await seedTextbookExercises();

  for (const errorType of errorTypes) {
    await prisma.errorType.upsert({
      where: { code: errorType.code },
      update: errorType,
      create: errorType,
    });
  }

  const teacher = await prisma.teacher.upsert({
    where: { phone: "demo" },
    update: { name: "示例教师" },
    create: { name: "示例教师", phone: "demo" },
  });

  const studentA = await prisma.student.upsert({
    where: { id: "demo-student-a" },
    update: {
      name: "林同学",
      teacherId: teacher.id,
      province: "江苏",
      textbookTrack: "苏教版",
    },
    create: {
      id: "demo-student-a",
      name: "林同学",
      grade: "高三",
      school: "示例中学",
      province: "江苏",
      textbookTrack: "苏教版",
      teacherId: teacher.id,
    },
  });

  const studentB = await prisma.student.upsert({
    where: { id: "demo-student-b" },
    update: {
      name: "周同学",
      teacherId: teacher.id,
      province: "江苏",
      textbookTrack: "苏教版",
    },
    create: {
      id: "demo-student-b",
      name: "周同学",
      grade: "高三",
      school: "示例中学",
      province: "江苏",
      textbookTrack: "苏教版",
      teacherId: teacher.id,
    },
  });

  const existingMistakes = await prisma.mistake.count({
    where: { student: { teacherId: teacher.id } },
  });

  if (existingMistakes === 0) {
    const derivative = await prisma.knowledgePoint.findUniqueOrThrow({
      where: { code: "X1-C05-03" },
    });
    const conic = await prisma.knowledgePoint.findUniqueOrThrow({
      where: { code: "X1-C03-01" },
    });
    const review = await prisma.errorType.findUniqueOrThrow({
      where: { code: "REVIEW" },
    });
    const method = await prisma.errorType.findUniqueOrThrow({
      where: { code: "METHOD" },
    });

    await prisma.mistake.create({
      data: {
        studentId: studentA.id,
        questionText: "已知函数 f(x)=x^3-3ax，讨论其单调区间并求极值。",
        answerText: "对参数 a 分类讨论，先求 f'(x)=3x^2-3a。",
        analysisText: "关键是先判断 a 的符号，再讨论导函数零点是否存在。",
        correctionNote: "下次先写导函数与分类标准，再进入区间表。",
        questionType: "解答题",
        regionTag: RegionTag.JS,
        status: MistakeStatus.REVIEWED,
        errorTypeId: method.id,
        reviewedAt: new Date(),
        reviewDueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        knowledgeLinks: {
          create: [{ knowledgePointId: derivative.id }],
        },
      },
    });

    await prisma.mistake.create({
      data: {
        studentId: studentA.id,
        questionText: "椭圆与直线联立后，求弦长并判断参数范围。",
        answerText: "联立得到一元二次方程，使用判别式与韦达定理。",
        analysisText: "漏掉判别式大于等于零，导致参数范围偏大。",
        correctionNote: "解析几何参数题先写存在性条件。",
        questionType: "解答题",
        regionTag: RegionTag.JS,
        status: MistakeStatus.REVIEWED,
        errorTypeId: review.id,
        reviewedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        reviewDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        knowledgeLinks: {
          create: [{ knowledgePointId: conic.id }],
        },
      },
    });

    await prisma.mistake.create({
      data: {
        studentId: studentB.id,
        questionText: "利用导数证明函数不等式。",
        answerText: "构造差函数，证明其最小值非负。",
        analysisText: "构造函数方向正确，但没有说明定义域。",
        correctionNote: "导数证明题先补定义域和端点讨论。",
        questionType: "解答题",
        regionTag: RegionTag.JS,
        status: MistakeStatus.REVIEWED,
        errorTypeId: review.id,
        reviewedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        reviewDueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        knowledgeLinks: {
          create: [{ knowledgePointId: derivative.id }],
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
