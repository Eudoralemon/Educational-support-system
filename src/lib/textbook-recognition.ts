import {
  AiTaskStatus,
  AiTaskType,
  MistakeAttachmentField,
  Prisma,
  TextbookContentBlockType,
  TextbookExerciseSourceType,
  TextbookMatchStatus,
} from "@prisma/client";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { prisma } from "@/lib/db";
import { runLocalOcr } from "@/lib/local-ocr";

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

type PdfPageText = {
  pageNumber: number;
  text: string;
};

type LineWithPage = {
  text: string;
  pageNumber: number;
};

type LocatedPoint = {
  point: KnowledgePointRow;
  startIndex: number;
  endIndex: number;
};

type ContentBlockDraft = {
  knowledgePoint: KnowledgePointRow;
  blockType: TextbookContentBlockType;
  title: string | null;
  contentText: string;
  sourcePageStart: number;
  sourcePageEnd: number;
  sourceLabel: string;
  confidence: number;
  order: number;
};

type ExerciseCandidateDraft = {
  knowledgePoint: KnowledgePointRow;
  prompt: string;
  sourcePage: number;
  sourceLabel: string;
  confidence: number;
  reason: string;
  sequence: number;
};

type RecognitionBookSummary = {
  textbook: string;
  pages: number;
  contentBlocks: number;
  candidates: number;
  autoApplied: number;
  lowConfidence: number;
  source: string;
};

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
};

function toHalfWidthDigits(value: string) {
  return value.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30),
  );
}

const GARBLED_CHAR_MAP: Record<string, string> = {
  // Uppercase italic Latin → regular Latin (PDF font encoding errors)
  "犃": "A", // 犃
  "犅": "B", // 犅
  "犆": "C", // 犆
  "犇": "D", // 犇
  "犈": "E", // 犈
  "犉": "F", // 犉
  "犌": "G", // 犌
  "犎": "H", // 犎
  "犐": "I", // 犐
  "犔": "L", // 犔
  "犕": "M", // 犕
  "犖": "N", // 犖
  "犗": "O", // 犗
  "犘": "P", // 犘
  "犙": "Q", // 犙
  "犚": "R", // 犚
  "犛": "S", // 犛
  "犜": "T", // 犜
  "犝": "U", // 犝
  "犞": "V", // 犞
  "犠": "W", // 犠
  "犡": "X", // 犡
  "犢": "Y", // 犢
  "犣": "Z", // 犣
  // Lowercase italic Latin → regular Latin
  "犪": "a", // 犪
  "犫": "b", // 犫
  "犮": "c", // 犮
  "犱": "d", // 犱
  "犲": "e", // 犲
  "犳": "f", // 犳
  "犵": "g", // 犵
  "犺": "h", // 犺
  "犻": "i", // 犻
  "犼": "j", // 犼
  "犽": "k", // 犽
  "犾": "l", // 犾
  "犿": "m", // 犿
  "狀": "n", // 狀
  "狆": "p", // 狆
  "狇": "q", // 狇
  "狉": "r", // 狉
  "狊": "s", // 狊
  "狋": "t", // 狋
  "狌": "u", // 狌
  "狏": "v", // 狏
  "狓": "x", // 狓
  "狔": "y", // 狔
  "狕": "z", // 狕
  // Math symbols (CJK substitutes)
  "槡": "√", // 槡 → √
  "狘": "|",   // 狘 → |
  "瓓": "∁", // 瓓 → ∁ (complement)
  // Private Use Area symbols
  "": ".",  //  exercise number separator
  "": "⊆", //  → ⊆
  "": "⊂", //  → ⊂
  "": "∉", //  → ∉
  "": "∅", //  → ∅
  "": "▱", //  → ▱ (parallelogram)
  "": "⇔", //  → ⇔ (iff)
  "": "⇒", //  → ⇒ (implies)
  "": "⊂", //  → ⊂ (line in plane)
  "": "⊄", //  → ⊄
  "": "↗", //  → ↗ (increase)
  "": "↘", //  → ↘ (decrease)
  "": "∀", //  → ∀
  "": "",  //  end-of-proof tombstone → remove
  "": "",  //  unknown formatting → remove
};

function cleanGarbledText(value: string) {
  // Replace all mapped characters
  let result = value.replace(
    /[槡犃犅-犉犌犎犐犔-犞犠-犣犪犫犮犱-犳犵犺-狀狆狇狉-狏狓-狕狘瓓]/g,
    (char) => GARBLED_CHAR_MAP[char] ?? char,
  );
  // ∈／ → ∉
  result = result.replace(/∈／/g, "∉");
  // Fullwidth Latin letters → halfwidth (handles ｓｉｎ→sin, ｃｏｓ→cos, etc.)
  // Correct offset: U+FF21(Ａ) - 0xFEE0 = U+0041(A)
  result = result.replace(/[Ａ-Ｚａ-ｚ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xFEE0),
  );
  // Reverse first-run buggy fullwidth conversion (wrong offset 0xFF20 was used previously)
  // Use split-join for literal string patterns to avoid regex escaping issues
  const buggyReversals: Array<[string, string]> = [
    [",/'", "log"],
    [",'", "lg"],
    [",.", "ln"],
    ["+'", "kg"],
    ["+-/3", "km/s"],
    ["+-", "km"],
    ["#-", "cm"],
    ["#/3", "cos"],
    ["3).", "sin"],
    ["4!.", "tan"],
    ["3%#", "sec"],
    ["#3#", "csc"],
    ["&(", "f("],
    ["-／3", "m/s"],
    ["m／3", "m/s"],
    ["km／3", "km/s"],
  ];
  for (const [corrupted, original] of buggyReversals) {
    if (result.includes(corrupted)) {
      result = result.split(corrupted).join(original);
    }
  }
  // Clean up double spaces from removed PUA chars
  result = result.replace(/  +/g, " ");
  return result;
}

function tidyExerciseText(value: string) {
  return cleanGarbledText(toHalfWidthDigits(value))
    .replace(/\r/g, "")
    .replace(/[]/g, "")
    .replace(/[ \t　]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n(?=[，。；：、）])/g, "")
    .replace(/(?<=[（(])\n/g, "")
    .trim();
}

function compact(value: string) {
  return cleanGarbledText(toHalfWidthDigits(value))
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, "");
}

function textTokens(value: string) {
  return Array.from(new Set(value.match(/[\p{Script=Han}a-zA-Z0-9]{2,}/gu) ?? []));
}

function normalizeLine(value: string) {
  return tidyExerciseText(value)
    .replace(/^[\s·•\-—–]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimmedLines(value: string) {
  return value
    .split(/\n+/)
    .map(normalizeLine)
    .filter(Boolean);
}

function confidenceForText(text: string, base = 65) {
  let confidence = base;
  if (text.length >= 80) confidence += 8;
  if (text.length >= 220) confidence += 5;
  if (/[�]/.test(text)) confidence -= 18;
  if (/[]/.test(text)) confidence -= 10;
  if (text.length < 25) confidence -= 18;
  return Math.min(92, Math.max(25, confidence));
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

async function readTextbookPdfPages(pdfPath: string): Promise<PdfPageText[] | null> {
  if (!existsSync(pdfPath)) return null;

  try {
    const fileBuffer = await readFile(pdfPath);
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(fileBuffer),
      disableFontFace: true,
      useSystemFonts: true,
    });
    const document = await loadingTask.promise;
    const pages: PdfPageText[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        pages.push({
          pageNumber,
          text: tidyExerciseText(textItemsToText(textContent.items as PdfTextItem[])),
        });
        page.cleanup();
      }
    } finally {
      await document.destroy();
    }

    return pages;
  } catch {
    return null;
  }
}

function textItemsToText(items: PdfTextItem[]) {
  const positioned = items
    .map((item) => ({
      text: item.str ?? "",
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
      width: item.width ?? 0,
      hasEOL: item.hasEOL ?? false,
    }))
    .filter((item) => item.text.trim().length > 0);

  const lines: Array<{ y: number; items: typeof positioned }> = [];
  for (const item of positioned) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2.8);
    if (line) {
      line.items.push(item);
      line.y = (line.y + item.y) / 2;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      let previousEnd: number | null = null;
      return line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => {
          const gap = previousEnd === null ? 0 : item.x - previousEnd;
          previousEnd = item.x + item.width;
          return `${gap > 10 ? " " : ""}${item.text}`;
        })
        .join("")
        .trim();
    })
    .filter(Boolean)
    .join("\n");
}

async function recognizeTextbookPages(textbook: string, pages: PdfPageText[]) {
  let pageCount = 0;

  for (const page of pages) {
    const textContent = tidyExerciseText(page.text);
    await prisma.textbookPageRecognition.upsert({
      where: { textbook_pageNumber: { textbook, pageNumber: page.pageNumber } },
      update: {
        textContent,
        source: "PDF_JS_TEXT",
        confidence: confidenceForText(textContent, 62),
        imagePath: null,
      },
      create: {
        textbook,
        pageNumber: page.pageNumber,
        textContent,
        source: "PDF_JS_TEXT",
        confidence: confidenceForText(textContent, 62),
      },
    });
    pageCount += 1;
  }

  return pageCount;
}

function pageTextContains(page: PdfPageText, needle: string) {
  const normalizedNeedle = compact(needle);
  if (!normalizedNeedle) return false;
  return compact(page.text).includes(normalizedNeedle);
}

function findSectionPage(pages: PdfPageText[], section: string, chapter: string, fromIndex: number) {
  const startIndex = Math.max(8, Math.min(fromIndex, pages.length - 1));
  const searchablePages = pages.map((page, index) => ({ page, index })).slice(startIndex);
  const sectionMatch = searchablePages.find(({ page }) => pageTextContains(page, section));
  if (sectionMatch) return sectionMatch.index;

  const chapterMatch = searchablePages.find(({ page }) => pageTextContains(page, chapter));
  if (chapterMatch) return chapterMatch.index;

  if (startIndex > 8) {
    return findSectionPage(pages, section, chapter, 8);
  }

  return -1;
}

function locateKnowledgePointWindows(points: KnowledgePointRow[], pages: PdfPageText[]) {
  const orderedPoints = [...points].sort((a, b) => a.code.localeCompare(b.code, "zh-Hans-CN", { numeric: true }));
  const located: Array<{ point: KnowledgePointRow; startIndex: number }> = [];
  let cursor = 8;

  for (const point of orderedPoints) {
    const startIndex = findSectionPage(pages, point.section ?? point.name, point.chapter, cursor);
    if (startIndex < 0) continue;
    located.push({ point, startIndex });
    cursor = Math.max(cursor, startIndex);
  }

  located.sort((a, b) => a.startIndex - b.startIndex || a.point.code.localeCompare(b.point.code));

  return located.map((item, index): LocatedPoint => {
    const nextDistinct = located.slice(index + 1).find((candidate) => candidate.startIndex > item.startIndex);
    return {
      ...item,
      endIndex: Math.min(pages.length, nextDistinct?.startIndex ?? item.startIndex + 8),
    };
  });
}

function linesForWindow(pages: PdfPageText[], startIndex: number, endIndex: number): LineWithPage[] {
  return pages.slice(startIndex, endIndex).flatMap((page) =>
    trimmedLines(page.text).map((text) => ({
      text,
      pageNumber: page.pageNumber,
    })),
  );
}

function classifyBlockStart(line: string): { type: TextbookContentBlockType; title: string } | null {
  const normalized = compact(line);
  if (!normalized) return null;
  if (/^(参考答案|答案|习题答案|练习答案)/u.test(normalized)) {
    return { type: TextbookContentBlockType.ANSWER, title: line };
  }
  if (/^(解析|分析|解答)/u.test(normalized) && normalized.length <= 28) {
    return { type: TextbookContentBlockType.ANALYSIS, title: line };
  }
  if (/^(练习|习题|复习题|章末复习题)/u.test(normalized)) {
    return { type: TextbookContentBlockType.EXERCISE, title: line };
  }
  if (/^(思考|想一想)/u.test(normalized)) {
    return { type: TextbookContentBlockType.THINKING, title: line };
  }
  if (/^(探究|探究与发现|试一试)/u.test(normalized)) {
    return { type: TextbookContentBlockType.EXPLORATION, title: line };
  }
  if (/^(阅读|数学阅读|拓展阅读)/u.test(normalized)) {
    return { type: TextbookContentBlockType.READING, title: line };
  }
  if (/^(小结|本章小结|章末总结|回顾与总结)/u.test(normalized)) {
    return { type: TextbookContentBlockType.SUMMARY, title: line };
  }
  if (/^例/u.test(normalized) && normalized.length <= 42) {
    return { type: TextbookContentBlockType.EXAMPLE, title: line };
  }
  return null;
}

function blockTypeLabel(type: TextbookContentBlockType) {
  const labels: Record<TextbookContentBlockType, string> = {
    CONCEPT: "正文",
    EXAMPLE: "例题",
    EXERCISE: "练习/习题",
    THINKING: "思考",
    EXPLORATION: "探究",
    READING: "阅读",
    SUMMARY: "小结",
    ANSWER: "答案",
    ANALYSIS: "解析",
    OTHER: "其他",
  };
  return labels[type];
}

function contentBlocksForWindow(
  located: LocatedPoint,
  pages: PdfPageText[],
  startOrder: number,
): ContentBlockDraft[] {
  const lines = linesForWindow(pages, located.startIndex, located.endIndex);
  const drafts: ContentBlockDraft[] = [];
  let currentType: TextbookContentBlockType = TextbookContentBlockType.CONCEPT;
  let currentTitle: string | null = located.point.section ?? located.point.name;
  let currentLines: LineWithPage[] = [];
  let order = startOrder;

  const flush = () => {
    const contentText = tidyExerciseText(currentLines.map((line) => line.text).join("\n"));
    if (contentText.length < 20) {
      currentLines = [];
      return;
    }

    drafts.push({
      knowledgePoint: located.point,
      blockType: currentType,
      title: currentTitle,
      contentText,
      sourcePageStart: Math.min(...currentLines.map((line) => line.pageNumber)),
      sourcePageEnd: Math.max(...currentLines.map((line) => line.pageNumber)),
      sourceLabel: `${blockTypeLabel(currentType)} ${drafts.length + 1}`,
      confidence: confidenceForText(contentText, currentType === TextbookContentBlockType.CONCEPT ? 58 : 66),
      order,
    });
    order += 1;
    currentLines = [];
  };

  for (const line of lines) {
    const marker = classifyBlockStart(line.text);
    const shouldSplitLongConcept =
      currentType === TextbookContentBlockType.CONCEPT &&
      currentLines.reduce((sum, item) => sum + item.text.length, 0) > 1800 &&
      line.text.length < 80;

    if (marker || shouldSplitLongConcept) {
      flush();
      currentType = marker?.type ?? TextbookContentBlockType.CONCEPT;
      currentTitle = marker?.title ?? `${located.point.section ?? located.point.name}（续）`;
    }

    currentLines.push(line);
  }
  flush();

  if (drafts.length === 0) {
    const text = tidyExerciseText(lines.map((line) => line.text).join("\n"));
    if (text.length >= 20) {
      drafts.push({
        knowledgePoint: located.point,
        blockType: TextbookContentBlockType.OTHER,
        title: located.point.section ?? located.point.name,
        contentText: text,
        sourcePageStart: pages[located.startIndex]?.pageNumber ?? 1,
        sourcePageEnd: pages[Math.max(located.startIndex, located.endIndex - 1)]?.pageNumber ?? 1,
        sourceLabel: "其他 1",
        confidence: confidenceForText(text, 48),
        order,
      });
    }
  }

  return drafts;
}

function extractNumberedExercises(block: string) {
  const normalized = tidyExerciseText(block)
    .replace(/习\s*题\s*[0-9０-９]+[．.][0-9０-９]+/g, "\n")
    .replace(/练\s*习/g, "\n")
    .replace(/感受\s*[·•]\s*理解|思考\s*[·•]\s*运用|探究\s*[·•]\s*拓展/g, "\n")
    .replace(/必修第?[一二三四五六七八九十]+册\s*数学|选择性必修第?[一二三四五六七八九十]+册\s*数学/g, "\n");
  const matches = Array.from(
    normalized.matchAll(/(?:^|\n)\s*([0-9０-９]{1,3})(?:[．.、])\s*/g),
  );

  if (matches.length === 0) {
    const fallback = tidyExerciseText(normalized);
    return fallback.length >= 18 && fallback.length <= 1200 ? [fallback] : [];
  }

  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end =
        index + 1 < matches.length ? matches[index + 1].index ?? normalized.length : normalized.length;
      return tidyExerciseText(normalized.slice(start, end)).replace(/\s*\f\s*/g, " ");
    })
    .filter((prompt) => prompt.length >= 16 && prompt.length <= 1200)
    .filter((prompt) => !/^([0-9]+[．.]\s*)?练\s*习$/u.test(prompt))
    .filter((prompt) => compact(prompt).length >= 10);
}

function candidateConfidence(prompt: string, blockConfidence: number) {
  let confidence = Math.max(40, blockConfidence);
  if (prompt.length >= 40) confidence += 8;
  if (/[？?求证证明判断计算]/u.test(prompt)) confidence += 4;
  if (/[�]/u.test(prompt)) confidence -= 18;
  if (prompt.length < 26) confidence -= 12;
  if (/\n\s*习\s*题$/u.test(prompt)) confidence -= 8;
  return Math.min(92, Math.max(25, confidence));
}

async function upsertExtractedExercise({
  candidate,
  sourceBlockId,
}: {
  candidate: ExerciseCandidateDraft;
  sourceBlockId: string;
}) {
  const code = exerciseCodeForCandidate(candidate);
  const existing = await prisma.textbookExercise.findUnique({
    where: { code },
    include: {
      _count: {
        select: {
          practiceItems: true,
          preferences: true,
          usages: true,
        },
      },
    },
  });
  const protectedByTeacherOrUsage =
    existing?.isTeacherVerified ||
    existing?.isArchived ||
    Boolean(existing && (existing._count.practiceItems > 0 || existing._count.preferences > 0 || existing._count.usages > 0));

  const data = {
    textbook: candidate.knowledgePoint.textbook,
    chapter: candidate.knowledgePoint.chapter,
    section: candidate.knowledgePoint.section,
    sourcePage: candidate.sourcePage,
    sourceLabel: candidate.sourceLabel,
    prompt: candidate.prompt,
    answerText: null,
    analysisText: null,
    difficulty: Math.min(5, Math.max(1, candidate.sequence)),
    sourceType: TextbookExerciseSourceType.EXTRACTED,
    sourceBlockId,
    knowledgePointId: candidate.knowledgePoint.id,
  };

  if (existing) {
    if (protectedByTeacherOrUsage) {
      return prisma.textbookExercise.update({
        where: { id: existing.id },
        data: {
          sourceType: existing.sourceType === TextbookExerciseSourceType.FALLBACK ? TextbookExerciseSourceType.EXTRACTED : existing.sourceType,
          sourceBlockId,
        },
      });
    }

    return prisma.textbookExercise.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.textbookExercise.create({
    data: {
      code,
      ...data,
    },
  });
}

function exerciseCodeForCandidate(candidate: ExerciseCandidateDraft) {
  return `${candidate.knowledgePoint.code}-TB-${String(candidate.sequence).padStart(2, "0")}`;
}

function contentBlockRecognitionKey(draft: ContentBlockDraft) {
  return [
    "block",
    draft.knowledgePoint.textbook,
    draft.knowledgePoint.code,
    draft.blockType,
    draft.sourcePageStart,
    draft.sourceLabel,
    draft.order,
  ].join(":");
}

function candidateRecognitionKey(candidate: ExerciseCandidateDraft) {
  return [
    "candidate",
    candidate.knowledgePoint.textbook,
    candidate.knowledgePoint.code,
    candidate.sourcePage,
    candidate.sourceLabel,
    candidate.sequence,
  ].join(":");
}

async function createOrUpdateCandidate({
  candidate,
  pageRecognitionId,
  sourceBlockId,
  textbookExerciseId,
  accepted,
}: {
  candidate: ExerciseCandidateDraft;
  pageRecognitionId?: string;
  sourceBlockId: string;
  textbookExerciseId?: string;
  accepted: boolean;
}) {
  const recognitionKey = candidateRecognitionKey(candidate);
  const existing = await prisma.textbookExerciseCandidate.findUnique({
    where: { recognitionKey },
  });
  const data = {
    recognitionKey,
    textbook: candidate.knowledgePoint.textbook,
    chapter: candidate.knowledgePoint.chapter,
    section: candidate.knowledgePoint.section,
    sourcePage: candidate.sourcePage,
    sourceLabel: candidate.sourceLabel,
    prompt: candidate.prompt,
    answerText: null,
    analysisText: null,
    confidence: candidate.confidence,
    reason: candidate.reason,
    accepted,
    rejected: false,
    pageRecognitionId,
    sourceBlockId,
    knowledgePointId: candidate.knowledgePoint.id,
    textbookExerciseId,
  };

  if (existing) {
    if (existing.rejected || existing.isArchived || existing.isTeacherEdited) {
      return prisma.textbookExerciseCandidate.update({
        where: { id: existing.id },
        data: {
          pageRecognitionId,
          sourceBlockId,
          textbookExerciseId: existing.textbookExerciseId ?? textbookExerciseId,
        },
      });
    }

    return prisma.textbookExerciseCandidate.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.textbookExerciseCandidate.create({ data });
}

async function rebuildTextbookContent({
  textbook,
  pages,
  points,
}: {
  textbook: string;
  pages: PdfPageText[];
  points: KnowledgePointRow[];
}) {
  const located = locateKnowledgePointWindows(points, pages);
  let order = 1;
  let contentBlocks = 0;
  let candidates = 0;
  let autoApplied = 0;
  let lowConfidence = 0;
  const sequenceByPoint = new Map<string, number>();
  const generatedExerciseCodes = new Set<string>();
  const generatedBlockKeys = new Set<string>();
  const generatedCandidateKeys = new Set<string>();

  for (const window of located) {
    const drafts = contentBlocksForWindow(window, pages, order);
    order += drafts.length;

    for (const draft of drafts) {
      const recognitionKey = contentBlockRecognitionKey(draft);
      generatedBlockKeys.add(recognitionKey);
      const existingBlock = await prisma.textbookContentBlock.findUnique({
        where: { recognitionKey },
      });
      const blockData = {
        recognitionKey,
        textbook,
        chapter: draft.knowledgePoint.chapter,
        section: draft.knowledgePoint.section,
        blockType: draft.blockType,
        sourcePageStart: draft.sourcePageStart,
        sourcePageEnd: draft.sourcePageEnd,
        sourceLabel: draft.sourceLabel,
        title: draft.title,
        contentText: draft.contentText,
        order: draft.order,
        confidence: draft.confidence,
        knowledgePointId: draft.knowledgePoint.id,
      };
      const block =
        existingBlock?.isTeacherEdited || existingBlock?.isArchived
          ? existingBlock
          : await prisma.textbookContentBlock.upsert({
              where: { recognitionKey },
              update: blockData,
              create: blockData,
            });
      contentBlocks += 1;

      if (block.isArchived || block.isTeacherEdited) continue;
      if (draft.blockType !== TextbookContentBlockType.EXERCISE) continue;

      const prompts = extractNumberedExercises(draft.contentText).slice(0, 12);
      for (const [index, prompt] of prompts.entries()) {
        const nextSequence = (sequenceByPoint.get(draft.knowledgePoint.id) ?? 0) + 1;
        sequenceByPoint.set(draft.knowledgePoint.id, nextSequence);
        const confidence = candidateConfidence(prompt, draft.confidence);
        const candidate: ExerciseCandidateDraft = {
          knowledgePoint: draft.knowledgePoint,
          prompt,
          sourcePage: draft.sourcePageStart,
          sourceLabel: `${draft.title || "教材练习"} 第 ${index + 1} 题`,
          confidence,
          reason: "按教材目录定位小节，并从练习/习题结构块按编号切分",
          sequence: nextSequence,
        };
        generatedCandidateKeys.add(candidateRecognitionKey(candidate));
        const pageRecognition = await prisma.textbookPageRecognition.findUnique({
          where: { textbook_pageNumber: { textbook, pageNumber: candidate.sourcePage } },
          select: { id: true },
        });
        const accepted = confidence >= 72;
        if (accepted) generatedExerciseCodes.add(exerciseCodeForCandidate(candidate));
        const exercise = accepted ? await upsertExtractedExercise({ candidate, sourceBlockId: block.id }) : null;
        await createOrUpdateCandidate({
          candidate,
          sourceBlockId: block.id,
          pageRecognitionId: pageRecognition?.id,
          textbookExerciseId: exercise?.id,
          accepted,
        });
        candidates += 1;
        if (accepted) autoApplied += 1;
        else lowConfidence += 1;
      }
    }
  }

  await prisma.textbookContentBlock.deleteMany({
    where: {
      textbook,
      isTeacherEdited: false,
      isArchived: false,
      OR: [{ recognitionKey: null }, { recognitionKey: { notIn: [...generatedBlockKeys] } }],
    },
  });
  await prisma.textbookExerciseCandidate.deleteMany({
    where: {
      textbook,
      isTeacherEdited: false,
      isArchived: false,
      rejected: false,
      OR: [{ recognitionKey: null }, { recognitionKey: { notIn: [...generatedCandidateKeys] } }],
    },
  });

  if (generatedExerciseCodes.size > 0) {
    await prisma.textbookExercise.deleteMany({
      where: {
        textbook,
        sourceType: TextbookExerciseSourceType.EXTRACTED,
        isTeacherVerified: false,
        isArchived: false,
        code: { notIn: [...generatedExerciseCodes] },
        practiceItems: { none: {} },
        preferences: { none: {} },
        usages: { none: {} },
      },
    });
  }
  await prisma.textbookExerciseCandidate.deleteMany({
    where: {
      textbook,
      accepted: true,
      rejected: false,
      textbookExerciseId: null,
    },
  });

  return { contentBlocks, candidates, autoApplied, lowConfidence };
}

export async function recognizeTextbooks(): Promise<RecognitionBookSummary[]> {
  const points = await prisma.knowledgePoint.findMany({
    orderBy: [{ textbook: "asc" }, { chapter: "asc" }, { code: "asc" }],
  });
  const summary: RecognitionBookSummary[] = [];

  for (const [textbook, fileName] of Object.entries(textbookPdfFiles)) {
    const pdfPath = path.join(/*turbopackIgnore: true*/ process.cwd(), fileName);
    const pages = await readTextbookPdfPages(pdfPath);
    if (!pages) {
      summary.push({
        textbook,
        pages: 0,
        contentBlocks: 0,
        candidates: 0,
        autoApplied: 0,
        lowConfidence: 0,
        source: "MISSING_PDF_JS_TEXT",
      });
      continue;
    }

    const pageCount = await recognizeTextbookPages(textbook, pages);
    const bookPoints = points.filter((point) => point.textbook === textbook);
    const result = await rebuildTextbookContent({
      textbook,
      pages,
      points: bookPoints,
    });

    summary.push({
      textbook,
      pages: pageCount,
      contentBlocks: result.contentBlocks,
      candidates: result.candidates,
      autoApplied: result.autoApplied,
      lowConfidence: result.lowConfidence,
      source: "PDF_JS_TEXT",
    });
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
    where: { sourceType: { not: TextbookExerciseSourceType.FALLBACK }, isArchived: false },
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
