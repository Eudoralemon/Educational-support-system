import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GARBLED_CHAR_MAP: Record<string, string> = {
  // Uppercase italic Latin → regular Latin (PDF font encoding errors)
  "犃": "A", "犅": "B", "犆": "C", "犇": "D", "犈": "E", "犉": "F",
  "犌": "G", "犎": "H", "犐": "I", "犔": "L", "犕": "M", "犖": "N",
  "犗": "O", "犘": "P", "犙": "Q", "犚": "R", "犛": "S", "犜": "T",
  "犝": "U", "犞": "V", "犠": "W", "犡": "X", "犢": "Y", "犣": "Z",
  // Lowercase italic Latin → regular Latin
  "犪": "a", "犫": "b", "犮": "c", "犱": "d", "犲": "e", "犳": "f",
  "犵": "g", "犺": "h", "犻": "i", "犼": "j", "犽": "k", "犾": "l",
  "犿": "m", "狀": "n", "狆": "p", "狇": "q", "狉": "r", "狊": "s",
  "狋": "t", "狌": "u", "狏": "v", "狓": "x", "狔": "y", "狕": "z",
  // Math symbols
  "槡": "√", "狘": "|",
  // CJK substitution for complement symbol
  "瓓": "∁",
  // PUA: exercise number separator, subset symbols
  "": ".",  "": "⊆", "": "⊂",
  // PUA: logical / set symbols
  "": "∉",   // not element of
  "": "∅",   // empty set
  "": "▱",   // parallelogram (▱ABCD)
  "": "⇔",   // if and only if
  "": "⇒",   // implies
  "": "⊂",   // contained in (line in plane)
  "": "⊄",   // not contained in
  "": "↗",   // increase arrow (function monotonicity table)
  "": "↘",   // decrease arrow
  "": "∀",   // universal quantifier
  // PUA: formatting artifacts → remove
  "": "",    // end-of-proof tombstone marker
  "": "",    // unknown formatting char
};

const PUA_CHAR_CLASS = new RegExp(
  "[" + Object.keys(GARBLED_CHAR_MAP).join("") + "]",
  "g",
);

function cleanGarbledText(value: string | null) {
  if (!value) return value;
  let result = value.replace(PUA_CHAR_CLASS, (char) => GARBLED_CHAR_MAP[char] ?? char);
  // ∈／ → ∉
  result = result.replace(/∈／/g, "∉");
  // /∈ → ∉
  result = result.replace(/\/∈/g, "∉");
  // Fullwidth Latin letters → halfwidth (handles ｓｉｎ→sin, ｃｏｓ→cos, etc.)
  // Correct offset: U+FF21(Ａ) - 0xFEE0 = U+0041(A)
  result = result.replace(/[Ａ-Ｚａ-ｚ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xFEE0),
  );
  // Reverse first-run buggy fullwidth conversion (wrong offset 0xFF20)
  // ａ=!, ｃ=#, ｅ=%, ｆ=&, ｇ=', ｉ=), ｋ=+, ｌ=,, ｍ=-, ｎ=., ｏ=/, ｓ=3, ｔ=4
  // Use split-join for literal string patterns to avoid regex escaping issues
  const literalFixes: Array<[string, string]> = [
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
    ["-／3", "m/s"],   // m/s with fullwidth slash (ｍ/ｓ → -／3)
    ["m／3", "m/s"],   // m/s with fullwidth slash after partial fix
    ["km／3", "km/s"], // km/s with fullwidth slash
    ["-／3", "m/s"],   // duplicate to ensure coverage
  ];
  for (const [corrupted, original] of literalFixes) {
    if (result.includes(corrupted)) {
      result = result.split(corrupted).join(original);
    }
  }

  // Clean up double spaces from removed PUA chars
  result = result.replace(/  +/g, " ");
  return result;
}

async function fixTable(
  table: string,
  fields: string[],
  batchSize = 200,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (prisma as any)[table];
  if (!model) {
    console.log(`  skip: model not found for ${table}`);
    return { total: 0, fixed: 0 };
  }

  let cursor: string | undefined;
  let total = 0;
  let fixed = 0;

  while (true) {
    const rows = await model.findMany({
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      select: { id: true, ...Object.fromEntries(fields.map((f) => [f, true])) },
    });

    if (rows.length === 0) break;
    total += rows.length;

    for (const row of rows) {
      const data: Record<string, string> = {};
      for (const field of fields) {
        const original = row[field] as string | null;
        if (!original) continue;
        const cleaned = cleanGarbledText(original) as string;
        if (cleaned !== original) {
          data[field] = cleaned;
        }
      }
      if (Object.keys(data).length > 0) {
        await model.update({ where: { id: row.id }, data });
        fixed += 1;
      }
    }

    cursor = rows[rows.length - 1].id;
    process.stdout.write(`\r  ${table}: scanned ${total}, fixed ${fixed}...`);
  }

  console.log(`\r  ${table}: scanned ${total}, fixed ${fixed} rows.`);
  return { total, fixed };
}

async function main() {
  console.log("Fixing garbled text in database...\n");

  const results: Record<string, { total: number; fixed: number }> = {};

  results["TextbookExercise"] = await fixTable("textbookExercise", [
    "prompt",
    "answerText",
    "analysisText",
  ]);

  results["TextbookExerciseCandidate"] = await fixTable(
    "textbookExerciseCandidate",
    ["prompt", "answerText", "analysisText"],
  );

  results["TextbookContentBlock"] = await fixTable("textbookContentBlock", [
    "contentText",
    "title",
  ]);

  results["TextbookPageRecognition"] = await fixTable("textbookPageRecognition", [
    "textContent",
  ]);

  const grandTotalFixed = Object.values(results).reduce(
    (sum, r) => sum + r.fixed,
    0,
  );

  console.log(`\nDone. Total rows fixed: ${grandTotalFixed}`);
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
