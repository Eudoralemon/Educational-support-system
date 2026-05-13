import { MistakeStatus, PrismaClient, RegionTag } from "@prisma/client";

const prisma = new PrismaClient();

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
