import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const maxImageBytes = 10 * 1024 * 1024;
export const maxImagesPerDraftField = 6;
export const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type SavedImage = {
  imagePath: string;
  imageMimeType: string;
  originalName?: string;
};

function extensionFor(file: File) {
  const originalExtension = path.extname(file.name);
  if (originalExtension) return originalExtension;

  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  if (file.type === "image/gif") return ".gif";
  return ".jpg";
}

export function uploadUrl(imagePath: string) {
  return `/api/uploads/${encodeURIComponent(imagePath.replace("uploads/", ""))}`;
}

export function imageUploadError(file: File) {
  if (!allowedImageTypes.has(file.type)) {
    return "仅支持 JPG、PNG、WebP 或 GIF 图片";
  }

  if (file.size > maxImageBytes) {
    return "图片不能超过 10MB";
  }

  return null;
}

export async function saveUploadImage(file: File): Promise<SavedImage> {
  const error = imageUploadError(file);
  if (error) {
    throw new Error(error);
  }

  const uploadsDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const fileName = `${Date.now()}-${crypto.randomUUID()}${extensionFor(file)}`;
  const target = path.join(uploadsDir, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());

  await writeFile(target, bytes);

  return {
    imagePath: `uploads/${fileName}`,
    imageMimeType: file.type || "application/octet-stream",
    originalName: file.name || undefined,
  };
}

export function filesFromFormData(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((item): item is File => item instanceof File && item.size > 0);
}
