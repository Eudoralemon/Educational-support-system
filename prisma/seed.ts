import {
  MistakeStatus,
  PrismaClient,
  RegionTag,
} from "@prisma/client";

const prisma = new PrismaClient();

const knowledgePoints = [
  { code: "ALG-FUNC-001", name: "函数的单调性与最值", module: "函数与导数", region: RegionTag.COMMON, examWeight: 5 },
  { code: "ALG-FUNC-002", name: "函数零点与方程思想", module: "函数与导数", region: RegionTag.COMMON, examWeight: 4 },
  { code: "CAL-DER-001", name: "导数的几何意义", module: "函数与导数", region: RegionTag.COMMON, examWeight: 4 },
  { code: "CAL-DER-002", name: "利用导数研究函数性质", module: "函数与导数", region: RegionTag.COMMON, examWeight: 5 },
  { code: "GEO-VEC-001", name: "平面向量数量积", module: "平面向量", region: RegionTag.COMMON, examWeight: 3 },
  { code: "GEO-SOL-001", name: "空间线面位置关系", module: "立体几何", region: RegionTag.COMMON, examWeight: 4 },
  { code: "ANA-CON-001", name: "圆锥曲线定义与标准方程", module: "解析几何", region: RegionTag.COMMON, examWeight: 5 },
  { code: "ANA-CON-002", name: "直线与圆锥曲线联立", module: "解析几何", region: RegionTag.COMMON, examWeight: 5 },
  { code: "PRO-STA-001", name: "古典概型与条件概率", module: "概率统计", region: RegionTag.COMMON, examWeight: 4 },
  { code: "SEQ-001", name: "等差等比数列通项与求和", module: "数列", region: RegionTag.COMMON, examWeight: 4 },
  { code: "JS-TYPE-001", name: "江苏常见多选压轴审题", module: "地区题型", region: RegionTag.JS, examWeight: 2 },
  { code: "GD-TYPE-001", name: "广东常见应用情境建模", module: "地区题型", region: RegionTag.GD, examWeight: 2 },
];

const errorTypes = [
  { code: "CONCEPT", name: "概念理解偏差", description: "定义、定理、适用条件没有分清。" },
  { code: "METHOD", name: "方法选择不当", description: "没有选到合适的解题入口或模型。" },
  { code: "CALCULATION", name: "运算失误", description: "代数变形、符号、数值计算出现错误。" },
  { code: "REVIEW", name: "审题遗漏", description: "忽略限制条件、问法或图形信息。" },
  { code: "EXPRESSION", name: "表达不规范", description: "步骤、结论、证明书写影响得分。" },
];

async function main() {
  for (const point of knowledgePoints) {
    await prisma.knowledgePoint.upsert({
      where: { code: point.code },
      update: point,
      create: point,
    });
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

  let classGroup = await prisma.classGroup.findFirst({
    where: { teacherId: teacher.id, name: "高三数学A班" },
  });

  if (!classGroup) {
    classGroup = await prisma.classGroup.create({
      data: {
        name: "高三数学A班",
        region: RegionTag.JS,
        teacherId: teacher.id,
      },
    });
  }

  const studentA = await prisma.student.upsert({
    where: { id: "demo-student-a" },
    update: {
      name: "林同学",
      classId: classGroup.id,
      region: RegionTag.JS,
    },
    create: {
      id: "demo-student-a",
      name: "林同学",
      grade: "高三",
      school: "示例中学",
      region: RegionTag.JS,
      classId: classGroup.id,
    },
  });

  const studentB = await prisma.student.upsert({
    where: { id: "demo-student-b" },
    update: {
      name: "周同学",
      classId: classGroup.id,
      region: RegionTag.GD,
    },
    create: {
      id: "demo-student-b",
      name: "周同学",
      grade: "高三",
      school: "示例中学",
      region: RegionTag.GD,
      classId: classGroup.id,
    },
  });

  const existingMistakes = await prisma.mistake.count({
    where: { classId: classGroup.id },
  });

  if (existingMistakes === 0) {
    const derivative = await prisma.knowledgePoint.findUniqueOrThrow({
      where: { code: "CAL-DER-002" },
    });
    const conic = await prisma.knowledgePoint.findUniqueOrThrow({
      where: { code: "ANA-CON-002" },
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
        classId: classGroup.id,
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
        classId: classGroup.id,
        questionText: "椭圆与直线联立后，求弦长并判断参数范围。",
        answerText: "联立得到一元二次方程，使用判别式与韦达定理。",
        analysisText: "漏掉判别式大于等于零，导致参数范围偏大。",
        correctionNote: "解析几何参数题先写存在性条件。",
        questionType: "解答题",
        regionTag: RegionTag.COMMON,
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
        classId: classGroup.id,
        questionText: "利用导数证明函数不等式。",
        answerText: "构造差函数，证明其最小值非负。",
        analysisText: "构造函数方向正确，但没有说明定义域。",
        correctionNote: "导数证明题先补定义域和端点讨论。",
        questionType: "解答题",
        regionTag: RegionTag.GD,
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
