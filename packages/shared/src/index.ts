export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIdx]}`;
}

export function formatRelativeExpiry(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoDate.trim());
  const normalized = hasTz ? isoDate.trim() : `${isoDate.trim()}Z`;
  const parsed = new Date(normalized).getTime();
  if (Number.isNaN(parsed)) return null;
  const diffMs = parsed - Date.now();
  if (diffMs <= 0) return "Expired";
  const mins = Math.ceil(diffMs / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m left`;
}

export const COMPRESS_TARGET_PRESETS = [
  { id: "100kb", label: "Under 100 KB", targetKb: 100, useCase: "Scholarship & Exam Portals" },
  { id: "200kb", label: "Under 200 KB", targetKb: 200, useCase: "College Admission & Govt Forms" },
  { id: "1mb", label: "Under 1 MB", targetKb: 1024, useCase: "Email & Assignment Upload" },
  { id: "2mb", label: "Under 2 MB", targetKb: 2048, useCase: "Standard Portal Limit" },
] as const;

export const PHOTO_RESIZE_PRESETS = [
  {
    id: "passport_india",
    label: "Passport Photo (3.5 x 4.5 cm)",
    widthPx: 413,
    heightPx: 531,
    dpi: 300,
    maxKb: 100,
    format: "JPEG" as const,
  },
  {
    id: "signature_standard",
    label: "Signature Box (3.5 x 1.5 cm)",
    widthPx: 413,
    heightPx: 177,
    dpi: 300,
    maxKb: 50,
    format: "JPEG" as const,
  },
  {
    id: "gate_photo",
    label: "GATE / JEE Photo",
    widthPx: 480,
    heightPx: 640,
    dpi: 200,
    maxKb: 200,
    format: "JPEG" as const,
  },
  {
    id: "upsc_photo",
    label: "UPSC / TNPSC Photo",
    widthPx: 350,
    heightPx: 350,
    dpi: 200,
    maxKb: 300,
    format: "JPEG" as const,
  },
  {
    id: "pan_photo",
    label: "PAN Card Photo",
    widthPx: 213,
    heightPx: 213,
    dpi: 300,
    maxKb: 50,
    format: "JPEG" as const,
  },
] as const;

export const ALLOWED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".md",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
] as const;

export const CONVERSION_TARGETS: Record<
  string,
  readonly ("pdf" | "docx" | "xlsx" | "pptx" | "md" | "txt" | "html" | "csv" | "json" | "png" | "jpg")[]
> = {
  pdf: ["docx", "xlsx", "pptx", "md", "txt", "html", "csv", "json", "png", "jpg"],
  docx: ["pdf", "md", "txt", "html", "png", "jpg"],
  xlsx: ["pdf", "csv", "html", "png", "jpg"],
  pptx: ["pdf", "png", "jpg"],
  md: ["pdf", "docx", "html", "txt"],
  txt: ["pdf", "docx", "html", "md"],
  html: ["pdf", "docx", "md", "txt"],
  png: ["pdf"],
  jpg: ["pdf"],
  jpeg: ["pdf"],
};
