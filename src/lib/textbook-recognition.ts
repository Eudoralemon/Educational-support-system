import { AiTaskStatus, AiTaskType, MistakeAttachmentField, Prisma, TextbookMatchStatus } from "@prisma/client";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";
import { availableCommand, runLocalOcr } from "@/lib/local-ocr";

const execFileAsync = promisify(execFile);

export const textbookPdfFiles: Record<string, string> = {
  "苏教版高中数学 必修第1册": "苏教版高中数学 必修第1册.pdf",
  "苏教版高中数学 必修第2册": "苏教版高中数学 必修第2册.pdf",
  "苏教版高中数学 选择性必修1": "苏教版高中数学 选择性必修1.pdf",
  "苏教版高中数学 选择性必修2": "苏教版高中数学 选择性必修2.pdf",
};

type KnowledgePointRow = {
  id: string;
  code: string;
  name: string;
  module: string;
  textbook: string;
  chapter: string;
  section: string | null;
};

type ExerciseCandidate = {
  knowledgePoint: KnowledgePointRow;
  prompt: string;
  sourcePage: number;
  sourceLabel: string;
  confidence: number;
  reason: string;
  index: number;
};

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

function compact(value: string) {
  return toHalfWidthDigits(value)
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, "");
}

function textTokens(value: string) {
  return Array.from(new Set(value.match(/[\p{Script=Han}a-zA-Z0-9]{2,}/gu) ?? []));
}

function charSimilarity(a: string, b: string) {
  const left = compact(a);
  const right = compact(b);
  if (!left || !right) return 0;
  if (left.length >= 12 && right.includes(left.slice(0, Math.min(left.length, 60)))) return 0.86;
  if (right.length >= 12 && left.includes(right.slice(0, Math.min(right.length, 60)))) return 0.86;

  const grams = (value: string) => {
    const result = new Set<string>();
    for (let index = 0; index < Math.max(1, value.length - 1); index += 1) {
      result.add(value.slice(index, index + 2));
    }
    return result;
  };
  const leftGrams = grams(left);
  const rightGrams = grams(right);
  let overlap = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) overlap += 1;
  }

  return overlap / Math.max(1, Math.min(leftGrams.size, rightGrams.size));
}

async function readTextbookPdfPages(pdfPath: string) {
  if (!(await availableCommand("pdftotext"))) return null;

  try {
    const { stdout } = await execFileAsync("pdftotext", ["-enc", "UTF-8", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout.split("\f");
  } catch {
    return null;
  }
}

async function renderPdfPage(pdfPath: string, textbook: string, pageNumber: number) {
  if (!(await availableCommand("pdftoppm"))) return null;

  const outputDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "tmp", "textbook-ocr");
  await mkdir(outputDir, { recursive: true });
  const safeBook = textbook.replace(/[^\p{Script=Han}a-zA-Z0-9]+/gu, "-");
  const outputPrefix = path.join(outputDir, `${safeBook}-p${pageNumber}`);

  try {
    await execFileAsync(
      "pdftoppm",
      ["-f", String(pageNumber), "-l", String(pageNumber), "-singlefile", "-r", "180", "-png", pdfPath, outputPrefix],
      { windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
    );
    return `${outputPrefix}.png`;
  } catch {
    return null;
  }
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
  const normalized = tidyExerciseText(block)
    .replace(/习题\s*[0-9０-９]+[．.][0-9０-９]+/g, "\n")
    .replace(/感受\s*[·•]\s*理解|思考\s*[·•]\s*运用|探究\s*[·•]\s*拓展/g, "\n")
    .replace(/必修第?[一二三四五六七八九十]+册\s*数学|选择性必修第?[一二三四五六七八九十]+册\s*数学/g, "\n");
  const matches = Array.from(
    normalized.matchAll(/(?:^|\n)\s*([0-9０-９]{1,2})(?:[．.、])\s*/g),
  );

  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end =
        index + 1 < matches.length ? matches[index + 1].index ?? normalized.length : normalized.length;
      return tidyExerciseText(normalized.slice(start, end)).replace(/\s*\f\s*/g, " ");
    })
    .filter((prompt) => prompt.length >= 16 && prompt.length <= 900)
    .filter((prompt) => !/^([0-9]+[．.]\s*)?练\s*习/.test(prompt));
}

function exercisesFromSectionText(sectionText: string) {
  const exerciseStart = sectionText.search(/练\s*习|习题\s*[0-9０-９]/);
  if (exerciseStart < 0) return [];

  const fromExercise = sectionText.slice(exerciseStart);
  const stop = fromExercise.search(/\n\s*[0-9０-９]+[．.][0-9０-９]+|第[0-9０-９]+章|专题|附录/);
  const block = stop > 80 ? fromExercise.slice(0, stop) : fromExercise;

  return extractNumberedExercises(block).slice(0, 5);
}

async function recognizeTextbookPages(textbook: string, pdfPath: string, pages: string[]) {
  const canRender = await availableCommand("pdftoppm");
  const canOcr = await availableCommand(process.env.LOCAL_OCR_COMMAND?.trim() || "tesseract");
  let pageCount = 0;

  for (const [index, pdfText] of pages.entries()) {
    const pageNumber = index + 1;
    let textContent = tidyExerciseText(pdfText);
    let source = "PDF_TEXT";
    let confidence = textContent.length >= 40 ? 55 : 30;
    let imagePath: string | null = null;

    if (canRender && canOcr) {
      const rendered = await renderPdfPage(pdfPath, textbook, pageNumber);
      if (rendered) {
        imagePath = path.relative(/*turbopackIgnore: true*/ process.cwd(), rendered).replace(/\\/g, "/");
        const ocr = await runLocalOcr(rendered);
        if (ocr.text.length > textContent.length * 0.7) {
          textContent = tidyExerciseText(ocr.text);
          source = "LOCAL_OCR";
          confidence = ocr.confidence;
        } else if (ocr.text.length > 0) {
          textContent = tidyExerciseText(`${textContent}\n${ocr.text}`);
          source = "PDF_TEXT+LOCAL_OCR";
          confidence = Math.max(confidence, Math.min(80, ocr.confidence + 8));
        }
      }
    }

    await prisma.textbookPageRecognition.upsert({
      where: { textbook_pageNumber: { textbook, pageNumber } },
      update: {
        textContent,
        source,
        confidence,
        imagePath,
      },
      create: {
        textbook,
        pageNumber,
        textContent,
        source,
        confidence,
        imagePath,
      },
    });
    pageCount += 1;
  }

  return pageCount;
}

function candidatesFromPages(points: KnowledgePointRow[], pages: string[]) {
  const candidates: ExerciseCandidate[] = [];

  for (const point of points) {
    const startPage = findSectionPage(pages, point.section ?? point.name, point.chapter);
    if (startPage < 0) continue;

    const windowText = pages.slice(startPage, Math.min(pages.length, startPage + 8)).join("\n");
    const prompts = exercisesFromSectionText(windowText);
    for (const [index, prompt] of prompts.entries()) {
      candidates.push({
        knowledgePoint: point,
        prompt,
        sourcePage: startPage + 1,
        sourceLabel: `教材练习 ${index + 1}`,
        confidence: prompt.length >= 40 ? 72 : 52,
        reason: "按章节定位练习/习题编号切分",
        index,
      });
    }
  }

  return candidates;
}

export async function recognizeTextbooks() {
  const points = await prisma.knowledgePoint.findMany({
    orderBy: [{ textbook: "asc" }, { chapter: "asc" }, { code: "asc" }],
  });
  const summary = [];

  for (const [textbook, fileName] of Object.entries(textbookPdfFiles)) {
    const pdfPath = path.join(/*turbopackIgnore: true*/ process.cwd(), fileName);
    const pages = await readTextbookPdfPages(pdfPath);
    if (!pages) {
      summary.push({ textbook, pages: 0, candidates: 0, source: "MISSING_PDF_TEXT" });
      continue;
    }

    const pageCount = await recognizeTextbookPages(textbook, pdfPath, pages);
    const bookPoints = points.filter((point) => point.textbook === textbook);
    const candidates = candidatesFromPages(bookPoints, pages);

    await prisma.textbookExerciseCandidate.deleteMany({ where: { textbook } });
    for (const candidate of candidates) {
      const code = `${candidate.knowledgePoint.code}-TB-${String(candidate.index + 1).padStart(2, "0")}`;
      const exercise = await prisma.textbookExercise.upsert({
        where: { code },
        update: {
          textbook,
          chapter: candidate.knowledgePoint.chapter,
          section: candidate.knowledgePoint.section,
          sourcePage: candidate.sourcePage,
          sourceLabel: candidate.sourceLabel,
          prompt: candidate.prompt,
          analysisText: `来源：《${textbook}》${candidate.knowledgePoint.chapter}${candidate.knowledgePoint.section ? ` ${candidate.knowledgePoint.section}` : ""}。`,
          difficulty: candidate.index + 1,
          knowledgePointId: candidate.knowledgePoint.id,
        },
        create: {
          code,
          textbook,
          chapter: candidate.knowledgePoint.chapter,
          section: candidate.knowledgePoint.section,
          sourcePage: candidate.sourcePage,
          sourceLabel: candidate.sourceLabel,
          prompt: candidate.prompt,
          analysisText: `来源：《${textbook}》${candidate.knowledgePoint.chapter}${candidate.knowledgePoint.section ? ` ${candidate.knowledgePoint.section}` : ""}。`,
          difficulty: candidate.index + 1,
          knowledgePointId: candidate.knowledgePoint.id,
        },
      });
      const pageRecognition = await prisma.textbookPageRecognition.findUnique({
        where: { textbook_pageNumber: { textbook, pageNumber: candidate.sourcePage } },
        select: { id: true },
      });

      await prisma.textbookExerciseCandidate.create({
        data: {
          textbook,
          chapter: candidate.knowledgePoint.chapter,
          section: candidate.knowledgePoint.section,
          sourcePage: candidate.sourcePage,
          sourceLabel: candidate.sourceLabel,
          prompt: candidate.prompt,
          analysisText: `来源：《${textbook}》${candidate.knowledgePoint.chapter}${candidate.knowledgePoint.section ? ` ${candidate.knowledgePoint.section}` : ""}。`,
          confidence: candidate.confidence,
          reason: candidate.reason,
          accepted: candidate.confidence >= 70,
          pageRecognitionId: pageRecognition?.id,
          knowledgePointId: candidate.knowledgePoint.id,
          textbookExerciseId: exercise.id,
        },
      });
    }

    summary.push({ textbook, pages: pageCount, candidates: candidates.length, source: "PDF_TEXT_OR_LOCAL_OCR" });
  }

  return summary;
}

function scoreExercise(
  combinedText: string,
  exercise: {
    prompt: string;
    answerText: string | null;
    analysisText: string | null;
    textbook: string;
    chapter: string;
    section: string | null;
    sourceLabel: string;
    knowledgePoint: { name: string; module: string };
  },
) {
  const promptScore = Math.round(charSimilarity(combinedText, exercise.prompt) * 72);
  const tokens = textTokens(combinedText);
  let keywordScore = 0;
  for (const keyword of [
    exercise.knowledgePoint.name,
    exercise.knowledgePoint.module,
    exercise.section,
    exercise.chapter.replace(/^第\d+章\s*/, ""),
  ].filter(Boolean) as string[]) {
    if (compact(combinedText).includes(compact(keyword))) keywordScore += 10;
  }

  const tokenScore = Math.min(
    18,
    tokens.filter((token) => compact(exercise.prompt).includes(compact(token))).length * 3,
  );
  const answerScore =
    exercise.answerText && charSimilarity(combinedText, exercise.answerText) > 0.25 ? 8 : 0;
  const score = Math.min(100, promptScore + keywordScore + tokenScore + answerScore);
  const reason = [
    promptScore >= 45 ? "题干相似度较高" : null,
    keywordScore > 0 ? "命中教材/知识点关键词" : null,
    tokenScore > 0 ? "命中题面词组" : null,
    answerScore > 0 ? "答案草稿与题源答案相近" : null,
  ].filter(Boolean);

  return {
    score,
    reason: reason.join("；") || "低置信文本相似",
  };
}

function fieldTextFromAttachments(
  attachments: Array<{ field: MistakeAttachmentField; ocrText: string | null }>,
  field: MistakeAttachmentField,
) {
  return attachments
    .filter((attachment) => attachment.field === field)
    .map((attachment) => attachment.ocrText)
    .filter(Boolean)
    .join("\n");
}

export async function recognizeMistakeTextbook({
  teacherId,
  mistakeId,
}: {
  teacherId: string;
  mistakeId: string;
}) {
  const mistake = await prisma.mistake.findFirst({
    where: { id: mistakeId, student: { teacherId } },
    include: {
      attachments: { orderBy: [{ field: "asc" }, { order: "asc" }] },
      knowledgeLinks: true,
    },
  });

  if (!mistake) return null;

  const ocrOutputs = [];
  for (const attachment of mistake.attachments) {
    if (attachment.ocrText) continue;
    const absolutePath = path.join(/*turbopackIgnore: true*/ process.cwd(), attachment.imagePath);
    const ocr = await runLocalOcr(absolutePath);
    if (ocr.text) {
      await prisma.mistakeAttachment.update({
        where: { id: attachment.id },
        data: { ocrText: ocr.text, ocrConfidence: ocr.confidence },
      });
      attachment.ocrText = ocr.text;
      attachment.ocrConfidence = ocr.confidence;
    }
    ocrOutputs.push({
      attachmentId: attachment.id,
      field: attachment.field,
      status: ocr.status,
      confidence: ocr.confidence,
      errorMessage: ocr.errorMessage,
    });
  }

  const questionOcr = fieldTextFromAttachments(mistake.attachments, MistakeAttachmentField.QUESTION);
  const answerOcr = fieldTextFromAttachments(mistake.attachments, MistakeAttachmentField.ANSWER);
  const analysisOcr = fieldTextFromAttachments(mistake.attachments, MistakeAttachmentField.ANALYSIS);
  const correctionOcr = fieldTextFromAttachments(mistake.attachments, MistakeAttachmentField.CORRECTION);
  const textPatch: Prisma.MistakeUpdateInput = {};

  if (!mistake.questionText && questionOcr) textPatch.questionText = questionOcr;
  if (!mistake.answerText && answerOcr) textPatch.answerText = answerOcr;
  if (!mistake.analysisText && analysisOcr) textPatch.analysisText = analysisOcr;
  if (!mistake.correctionNote && correctionOcr) textPatch.correctionNote = correctionOcr;
  if (Object.keys(textPatch).length > 0) {
    await prisma.mistake.update({ where: { id: mistake.id }, data: textPatch });
  }

  const combinedText = [
    mistake.questionText,
    mistake.answerText,
    mistake.analysisText,
    mistake.correctionNote,
    questionOcr,
    answerOcr,
    analysisOcr,
    correctionOcr,
  ]
    .filter(Boolean)
    .join("\n");

  const exercises = await prisma.textbookExercise.findMany({
    include: { knowledgePoint: true },
    orderBy: [{ sourcePage: "asc" }, { sourceLabel: "asc" }],
  });
  const scored = exercises
    .map((exercise) => {
      const match = scoreExercise(combinedText, exercise);
      return { exercise, ...match };
    })
    .filter((item) => item.score >= 15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  await prisma.mistakeTextbookMatch.deleteMany({
    where: {
      mistakeId: mistake.id,
      status: { in: [TextbookMatchStatus.SUGGESTED, TextbookMatchStatus.AUTO_APPLIED] },
    },
  });

  const createdMatches = [];
  for (const item of scored) {
    const status =
      item.score >= 82 && item === scored[0]
        ? TextbookMatchStatus.AUTO_APPLIED
        : TextbookMatchStatus.SUGGESTED;
    const created = await prisma.mistakeTextbookMatch.create({
      data: {
        mistakeId: mistake.id,
        textbookExerciseId: item.exercise.id,
        knowledgePointId: item.exercise.knowledgePointId,
        textbook: item.exercise.textbook,
        chapter: item.exercise.chapter,
        section: item.exercise.section,
        sourcePage: item.exercise.sourcePage,
        sourceLabel: item.exercise.sourceLabel,
        score: item.score,
        reason: item.reason,
        status,
      },
      include: { knowledgePoint: true, textbookExercise: true },
    });
    createdMatches.push(created);
  }

  const top = createdMatches[0];
  if (top && top.status === TextbookMatchStatus.AUTO_APPLIED && top.knowledgePointId) {
    await prisma.mistakeKnowledgePoint.upsert({
      where: {
        mistakeId_knowledgePointId: {
          mistakeId: mistake.id,
          knowledgePointId: top.knowledgePointId,
        },
      },
      update: {},
      create: {
        mistakeId: mistake.id,
        knowledgePointId: top.knowledgePointId,
      },
    });

    if (top.textbookExercise && (!mistake.questionText || !mistake.answerText || !mistake.analysisText)) {
      await prisma.mistake.update({
        where: { id: mistake.id },
        data: {
          questionText: mistake.questionText || top.textbookExercise.prompt,
          answerText: mistake.answerText || top.textbookExercise.answerText,
          analysisText: mistake.analysisText || top.textbookExercise.analysisText,
        },
      });
    }
  }

  const hasCompletedOcr = ocrOutputs.some((item) => item.status === "COMPLETED");
  const hasFailedOcr = ocrOutputs.some((item) => item.status === "FAILED");
  await prisma.aiTask.create({
    data: {
      type: AiTaskType.LOCAL_OCR,
      status: hasFailedOcr ? AiTaskStatus.FAILED : hasCompletedOcr ? AiTaskStatus.COMPLETED : AiTaskStatus.SKIPPED,
      provider: "local-ocr",
      mistakeId: mistake.id,
      inputJson: { attachmentCount: mistake.attachments.length },
      outputJson: {
        ocrOutputs,
        matchCount: createdMatches.length,
        autoApplied: top?.status === TextbookMatchStatus.AUTO_APPLIED,
      } satisfies Prisma.InputJsonObject,
      errorMessage: hasFailedOcr ? "部分图片 OCR 失败" : undefined,
      completedAt: new Date(),
    },
  });

  return {
    textPatch,
    matches: createdMatches,
  };
}

export async function acceptMistakeTextbookMatch({
  teacherId,
  mistakeId,
  matchId,
}: {
  teacherId: string;
  mistakeId: string;
  matchId: string;
}) {
  const match = await prisma.mistakeTextbookMatch.findFirst({
    where: {
      id: matchId,
      mistakeId,
      mistake: { student: { teacherId } },
    },
    include: { textbookExercise: true },
  });

  if (!match) return null;

  await prisma.$transaction(async (tx) => {
    await tx.mistakeTextbookMatch.updateMany({
      where: { mistakeId, id: { not: match.id }, status: TextbookMatchStatus.ACCEPTED },
      data: { status: TextbookMatchStatus.SUGGESTED },
    });
    await tx.mistakeTextbookMatch.update({
      where: { id: match.id },
      data: { status: TextbookMatchStatus.ACCEPTED },
    });

    if (match.knowledgePointId) {
      await tx.mistakeKnowledgePoint.upsert({
        where: {
          mistakeId_knowledgePointId: {
            mistakeId,
            knowledgePointId: match.knowledgePointId,
          },
        },
        update: {},
        create: { mistakeId, knowledgePointId: match.knowledgePointId },
      });
    }

    if (match.textbookExercise) {
      const existing = await tx.mistake.findUnique({
        where: { id: mistakeId },
        select: { questionText: true, answerText: true, analysisText: true },
      });
      await tx.mistake.update({
        where: { id: mistakeId },
        data: {
          questionText: existing?.questionText || match.textbookExercise.prompt,
          answerText: existing?.answerText || match.textbookExercise.answerText,
          analysisText: existing?.analysisText || match.textbookExercise.analysisText,
        },
      });
    }
  });

  return match;
}
