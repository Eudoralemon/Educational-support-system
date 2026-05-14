import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function commandExists(command: string) {
  if (!command || command.toLowerCase() === "none") return false;
  if (command.includes("\\") || command.includes("/") || /^[A-Za-z]:/.test(command)) {
    return existsSync(command);
  }

  const lookup = process.platform === "win32" ? "where.exe" : "which";
  try {
    await execFileAsync(lookup, [command], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export async function availableCommand(command: string) {
  return commandExists(command);
}

export async function runLocalOcr(imagePath: string) {
  const command = process.env.LOCAL_OCR_COMMAND?.trim() || "tesseract";
  const langs = process.env.LOCAL_OCR_LANGS?.trim() || "chi_sim+eng";

  if (!(await commandExists(command))) {
    return {
      text: "",
      confidence: 0,
      provider: "local-ocr",
      status: "SKIPPED" as const,
      errorMessage: "未找到本地 OCR 命令；可配置 LOCAL_OCR_COMMAND。",
    };
  }

  try {
    const { stdout } = await execFileAsync(command, [imagePath, "stdout", "-l", langs], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
    const text = stdout.trim();

    return {
      text,
      confidence: text.length >= 20 ? 72 : text.length > 0 ? 45 : 10,
      provider: "local-ocr",
      status: "COMPLETED" as const,
      errorMessage: undefined,
    };
  } catch (error) {
    return {
      text: "",
      confidence: 0,
      provider: "local-ocr",
      status: "FAILED" as const,
      errorMessage: error instanceof Error ? error.message : "本地 OCR 失败",
    };
  }
}
