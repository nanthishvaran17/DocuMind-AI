import React from "react";

export type SupportedFormat =
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "csv"
  | "image"
  | "zip"
  | "md"
  | "txt"
  | "json"
  | "generic";

export interface FileFormatMeta {
  format: SupportedFormat;
  label: string;
  ext: string;
  badgeBg: string;
  chipClass: string;
  brandColor: string;
}

export function detectFileFormat(mime?: string, filename?: string): SupportedFormat {
  const lowerName = (filename || "").toLowerCase();
  const lowerMime = (mime || "").toLowerCase();

  // Excel
  if (
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".xlsm") ||
    lowerMime.includes("spreadsheetml") ||
    lowerMime.includes("ms-excel")
  ) {
    return "xlsx";
  }

  // Word
  if (
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".doc") ||
    lowerMime.includes("wordprocessingml") ||
    lowerMime.includes("msword")
  ) {
    return "docx";
  }

  // PowerPoint
  if (
    lowerName.endsWith(".pptx") ||
    lowerName.endsWith(".ppt") ||
    lowerMime.includes("presentationml") ||
    lowerMime.includes("ms-powerpoint")
  ) {
    return "pptx";
  }

  // PDF
  if (lowerName.endsWith(".pdf") || lowerMime === "application/pdf") {
    return "pdf";
  }

  // CSV
  if (lowerName.endsWith(".csv") || lowerMime === "text/csv") {
    return "csv";
  }

  // Images
  if (
    lowerMime.startsWith("image/") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".gif") ||
    lowerName.endsWith(".svg")
  ) {
    return "image";
  }

  // Archives
  if (
    lowerName.endsWith(".zip") ||
    lowerName.endsWith(".tar") ||
    lowerName.endsWith(".gz") ||
    lowerMime.includes("zip") ||
    lowerMime.includes("compressed")
  ) {
    return "zip";
  }

  // Markdown
  if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) {
    return "md";
  }

  // Plain Text
  if (lowerName.endsWith(".txt") || lowerMime === "text/plain") {
    return "txt";
  }

  // JSON
  if (lowerName.endsWith(".json") || lowerMime === "application/json") {
    return "json";
  }

  return "generic";
}

export function getFileFormatMeta(mime?: string, filename?: string): FileFormatMeta {
  const format = detectFileFormat(mime, filename);
  const lowerName = (filename || "").toLowerCase();

  switch (format) {
    case "xlsx":
      return {
        format: "xlsx",
        label: lowerName.endsWith(".xls") ? "XLS" : "XLSX",
        ext: "xlsx",
        badgeBg: "bg-emerald-700 text-white border-emerald-600 shadow-xs shadow-emerald-700/25",
        chipClass: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
        brandColor: "#107C41",
      };
    case "docx":
      return {
        format: "docx",
        label: lowerName.endsWith(".doc") ? "DOC" : "DOCX",
        ext: "docx",
        badgeBg: "bg-blue-700 text-white border-blue-600 shadow-xs shadow-blue-700/25",
        chipClass: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
        brandColor: "#185ABD",
      };
    case "pptx":
      return {
        format: "pptx",
        label: lowerName.endsWith(".ppt") ? "PPT" : "PPTX",
        ext: "pptx",
        badgeBg: "bg-orange-700 text-white border-orange-600 shadow-xs shadow-orange-700/25",
        chipClass: "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
        brandColor: "#D24726",
      };
    case "pdf":
      return {
        format: "pdf",
        label: "PDF",
        ext: "pdf",
        badgeBg: "bg-red-700 text-white border-red-600 shadow-xs shadow-red-700/25",
        chipClass: "bg-red-50 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
        brandColor: "#E5252A",
      };
    case "csv":
      return {
        format: "csv",
        label: "CSV",
        ext: "csv",
        badgeBg: "bg-teal-700 text-white border-teal-600 shadow-xs shadow-teal-700/25",
        chipClass: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
        brandColor: "#007A5E",
      };
    case "image":
      return {
        format: "image",
        label: lowerName.endsWith(".png") ? "PNG" : lowerName.endsWith(".svg") ? "SVG" : "IMG",
        ext: "png",
        badgeBg: "bg-sky-600 text-white border-sky-500 shadow-xs shadow-sky-600/25",
        chipClass: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
        brandColor: "#0284C7",
      };
    case "zip":
      return {
        format: "zip",
        label: "ZIP",
        ext: "zip",
        badgeBg: "bg-amber-600 text-white border-amber-500 shadow-xs shadow-amber-600/25",
        chipClass: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
        brandColor: "#D97706",
      };
    case "md":
      return {
        format: "md",
        label: "MD",
        ext: "md",
        badgeBg: "bg-slate-700 text-white border-slate-600 shadow-xs shadow-slate-700/25",
        chipClass: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
        brandColor: "#334155",
      };
    case "txt":
      return {
        format: "txt",
        label: "TXT",
        ext: "txt",
        badgeBg: "bg-zinc-700 text-white border-zinc-600 shadow-xs shadow-zinc-700/25",
        chipClass: "bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700",
        brandColor: "#52525B",
      };
    default:
      return {
        format: "generic",
        label: lowerName.split(".").pop()?.toUpperCase().slice(0, 4) || "FILE",
        ext: "file",
        badgeBg: "bg-indigo-700 text-white border-indigo-600 shadow-xs shadow-indigo-700/25",
        chipClass: "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
        brandColor: "#4F46E5",
      };
  }
}

/**
 * Official Microsoft Excel Logo SVG
 */
export function ExcelLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Microsoft Excel"
    >
      <defs>
        <linearGradient id="dm-excel-front" x1="3" y1="6" x2="19" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#107C41" />
          <stop offset="1" stopColor="#0B5A2F" />
        </linearGradient>
      </defs>
      {/* Right base sheet flaps with official Fluent greens */}
      <path d="M19 4h6.5A3.5 3.5 0 0 1 29 7.5V14H19V4z" fill="#21A366" />
      <path d="M19 14h10v5H19v-5z" fill="#107C41" />
      <path d="M19 19h10v5.5a3.5 3.5 0 0 1-3.5 3.5H19v-9z" fill="#185C37" />

      {/* Spreadsheet grid lines on the right side */}
      <rect x="21" y="7" width="5.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.7" />
      <rect x="21" y="11" width="5.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.7" />
      <rect x="21" y="16" width="5.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.7" />
      <rect x="21" y="21" width="5.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.7" />

      {/* Front elevated tile shadow */}
      <rect x="2.5" y="6.5" width="17" height="19" rx="3.5" fill="#000000" fillOpacity="0.25" />

      {/* Front elevated tile */}
      <rect x="3" y="6" width="16.5" height="18.5" rx="3" fill="url(#dm-excel-front)" />

      {/* White 'X' symbol */}
      <path
        d="M7.3 9.8h2.5l2.2 3.8 2.2-3.8h2.5l-3.4 5.2 3.6 5.4h-2.5l-2.4-4-2.4 4H7.3l3.6-5.4-3.6-5.2z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/**
 * Official Microsoft Word Logo SVG
 */
export function WordLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Microsoft Word"
    >
      <defs>
        <linearGradient id="dm-word-front" x1="3" y1="6" x2="19" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#185ABD" />
          <stop offset="1" stopColor="#0F479C" />
        </linearGradient>
      </defs>
      {/* Right base sheet flaps with official Fluent blues */}
      <path d="M19 4h6.5A3.5 3.5 0 0 1 29 7.5V14H19V4z" fill="#41A5EE" />
      <path d="M19 14h10v5H19v-5z" fill="#185ABD" />
      <path d="M19 19h10v5.5a3.5 3.5 0 0 1-3.5 3.5H19v-9z" fill="#104A9E" />

      {/* Document text lines on the right side */}
      <rect x="21" y="8" width="5.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.8" />
      <rect x="21" y="12" width="5.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.8" />
      <rect x="21" y="16.5" width="5.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.8" />
      <rect x="21" y="21" width="3.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.8" />

      {/* Front elevated tile shadow */}
      <rect x="2.5" y="6.5" width="17" height="19" rx="3.5" fill="#000000" fillOpacity="0.25" />

      {/* Front elevated tile */}
      <rect x="3" y="6" width="16.5" height="18.5" rx="3" fill="url(#dm-word-front)" />

      {/* White 'W' symbol */}
      <path
        d="M6.5 9.8h2.1l1.6 6.5 1.7-6.5h1.9l1.7 6.5 1.6-6.5h2.1l-2.5 9h-2.2l-1.6-6-1.6 6H9L6.5 9.8z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/**
 * Official Microsoft PowerPoint Logo SVG
 */
export function PowerPointLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Microsoft PowerPoint"
    >
      <defs>
        <linearGradient id="dm-ppt-front" x1="3" y1="6" x2="19" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D24726" />
          <stop offset="1" stopColor="#9C2D16" />
        </linearGradient>
      </defs>
      {/* Right base sheet flaps with official Fluent orange/coral */}
      <path d="M19 4h6.5A3.5 3.5 0 0 1 29 7.5V14H19V4z" fill="#F06543" />
      <path d="M19 14h10v5H19v-5z" fill="#D24726" />
      <path d="M19 19h10v5.5a3.5 3.5 0 0 1-3.5 3.5H19v-9z" fill="#A83318" />

      {/* Slide chart on the right side */}
      <circle cx="24" cy="11" r="3.2" fill="#FFFFFF" fillOpacity="0.25" />
      <path d="M24 11V7.8a3.2 3.2 0 0 1 3.2 3.2H24z" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="21" y="17" width="5.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.8" />
      <rect x="21" y="21" width="4" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.8" />

      {/* Front elevated tile shadow */}
      <rect x="2.5" y="6.5" width="17" height="19" rx="3.5" fill="#000000" fillOpacity="0.25" />

      {/* Front elevated tile */}
      <rect x="3" y="6" width="16.5" height="18.5" rx="3" fill="url(#dm-ppt-front)" />

      {/* White 'P' symbol */}
      <path
        d="M7.8 9.8h4.6c2.5 0 3.9 1.3 3.9 3.2 0 2.1-1.4 3.3-3.9 3.3h-2.3v3.7H7.8V9.8zm2.3 4.6h2.1c1.2 0 1.9-.5 1.9-1.4 0-.9-.7-1.4-1.9-1.4h-2.1v2.8z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/**
 * Official Adobe PDF Logo SVG with authentic Acrobat ribbon curve
 */
export function PdfLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Adobe PDF"
    >
      <defs>
        <linearGradient id="dm-pdf-grad" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4272C" />
          <stop offset="1" stopColor="#B31217" />
        </linearGradient>
      </defs>
      {/* Acrobat signature red rounded badge */}
      <rect x="3" y="3" width="26" height="26" rx="6" fill="url(#dm-pdf-grad)" />

      {/* Authentic Adobe Acrobat continuous tri-loop curve */}
      <path
        d="M23.7 19.3c-1-1.3-2.9-2-5.4-2.2-.7-.9-1.5-2.2-2.1-3.6.4-1.9.5-3.5.3-4.4-.3-1.4-1.2-1.7-1.8-1.7-.8 0-1.4.6-1.4 1.7 0 1.8.8 3.8 1.9 5.8-.9 2.5-2.2 5.1-3.6 7-2 1.3-3.6 2.9-3.7 4.1 0 .9.6 1.7 1.5 1.7 1.7 0 3.8-2.6 5.4-6 1.7.5 3.5.9 5.1 1.1 1.7 2.2 3.2 3.2 4.4 3.2.9 0 1.5-.6 1.5-1.5 0-1.2-.7-2.6-2.1-3.2zm-15.5 5.5c.2-.5 1.2-1.8 2.8-3.1-1.2 2.3-2.2 3.6-2.8 3.1zm5-14.7c.3 0 .5.3.5.8 0 .6-.1 1.6-.3 2.8-.7-1.5-1.1-2.7-.9-3.4.1-.1.4-.2.7-.2zm.5 9.4c.5-1.3 1.1-2.6 1.6-3.7.8 1 1.6 1.8 2.4 2.5-1.3-.1-2.7-.2-4-.4v1.6zm8.8 4.6c-.6 0-1.5-.5-2.6-1.8.9.1 1.8.3 2.5.6.3.3.4.7.4.9-.1.2-.2.3-.3.3z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/**
 * CSV / Tabular Data Logo SVG
 */
export function CsvLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="CSV Data"
    >
      <defs>
        <linearGradient id="dm-csv-grad" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0D9488" />
          <stop offset="1" stopColor="#0F766E" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="26" height="26" rx="6" fill="url(#dm-csv-grad)" />
      {/* Grid cells */}
      <rect x="7" y="7" width="18" height="11" rx="2" fill="#FFFFFF" fillOpacity="0.18" />
      <line x1="7" y1="12.5" x2="25" y2="12.5" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="1" />
      <line x1="13" y1="7" x2="13" y2="18" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="1" />
      <line x1="19" y1="7" x2="19" y2="18" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="1" />
      {/* "CSV" text pill */}
      <rect x="7" y="20.5" width="18" height="5.5" rx="1.5" fill="#FFFFFF" />
      <text
        x="16"
        y="25"
        fill="#0F766E"
        fontSize="5"
        fontWeight="bold"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        CSV
      </text>
    </svg>
  );
}

/**
 * Image Logo SVG
 */
export function ImageLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Image"
    >
      <defs>
        <linearGradient id="dm-img-grad" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0284C7" />
          <stop offset="1" stopColor="#0369A1" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="26" height="26" rx="6" fill="url(#dm-img-grad)" />
      {/* Sun */}
      <circle cx="11.5" cy="11.5" r="2.5" fill="#FCD34D" />
      {/* Mountain landscape */}
      <path
        d="M7 23.5l6-7 4 4.5 4-4.5 4 7H7z"
        fill="#FFFFFF"
        fillOpacity="0.95"
      />
    </svg>
  );
}

/**
 * ZIP / Archive Logo SVG
 */
export function ZipLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ZIP Archive"
    >
      <defs>
        <linearGradient id="dm-zip-grad" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D97706" />
          <stop offset="1" stopColor="#B45309" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="26" height="26" rx="6" fill="url(#dm-zip-grad)" />
      {/* Zipper teeth */}
      <rect x="14" y="6" width="4" height="2" rx="0.5" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="14" y="9" width="4" height="2" rx="0.5" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="14" y="12" width="4" height="2" rx="0.5" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="14" y="15" width="4" height="2" rx="0.5" fill="#FFFFFF" fillOpacity="0.9" />
      {/* Pull tab */}
      <rect x="13.5" y="18" width="5" height="7" rx="1.5" fill="#FEF3C7" />
      <circle cx="16" cy="22" r="1.2" fill="#B45309" />
    </svg>
  );
}

/**
 * Text / Markdown Logo SVG
 */
export function TextLogo({ className = "h-5 w-5", isMd = false }: { className?: string; isMd?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={isMd ? "Markdown Document" : "Text Document"}
    >
      <defs>
        <linearGradient id="dm-text-grad" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#475569" />
          <stop offset="1" stopColor="#1E293B" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="26" height="26" rx="6" fill="url(#dm-text-grad)" />
      {isMd ? (
        <>
          {/* M shape */}
          <path
            d="M8 12v8h2v-5l2 3 2-3v5h2v-8h-2l-2 3-2-3H8z"
            fill="#FFFFFF"
          />
          {/* Down arrow */}
          <path
            d="M20 12v5h-2l3 3.5 3-3.5h-2v-5h-2z"
            fill="#38BDF8"
          />
        </>
      ) : (
        <>
          <rect x="8" y="9" width="16" height="2" rx="1" fill="#FFFFFF" fillOpacity="0.9" />
          <rect x="8" y="13.5" width="14" height="2" rx="1" fill="#FFFFFF" fillOpacity="0.75" />
          <rect x="8" y="18" width="16" height="2" rx="1" fill="#FFFFFF" fillOpacity="0.75" />
          <rect x="8" y="22.5" width="10" height="2" rx="1" fill="#FFFFFF" fillOpacity="0.5" />
        </>
      )}
    </svg>
  );
}

/**
 * Generic Document Logo SVG
 */
export function GenericDocLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Document"
    >
      <defs>
        <linearGradient id="dm-gen-grad" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366F1" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="26" height="26" rx="6" fill="url(#dm-gen-grad)" />
      <path
        d="M9 8h9l6 6v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"
        fill="#FFFFFF"
        fillOpacity="0.2"
      />
      <path d="M18 8v6h6" fill="#FFFFFF" fillOpacity="0.4" />
      <rect x="10" y="17" width="10" height="1.8" rx="0.9" fill="#FFFFFF" fillOpacity="0.9" />
      <rect x="10" y="20.5" width="7" height="1.8" rx="0.9" fill="#FFFFFF" fillOpacity="0.7" />
    </svg>
  );
}

export interface FileFormatIconProps {
  mime?: string;
  filename?: string;
  format?: string;
  className?: string;
}

/**
 * Universal Official Document / Office File Icon
 * Automatically identifies file type and displays the official, authentic brand icon:
 * - Microsoft Excel (.xlsx, .xls) -> Official Excel logo
 * - Microsoft Word (.docx, .doc) -> Official Word logo
 * - Microsoft PowerPoint (.pptx, .ppt) -> Official PowerPoint logo
 * - Adobe PDF (.pdf) -> Official Adobe Acrobat PDF logo
 * - CSV (.csv) -> Tabular Data logo
 * - Images (.png, .jpg, .jpeg, etc.) -> Image logo
 * - ZIP (.zip) -> Archive logo
 * - Markdown / Plain Text -> Text logo
 */
export function FileFormatIcon({
  mime,
  filename,
  format,
  className = "h-5 w-5",
}: FileFormatIconProps) {
  const resolvedFormat = format
    ? (format.toLowerCase().replace(/^\./, "") as SupportedFormat)
    : detectFileFormat(mime, filename);

  switch (resolvedFormat) {
    case "xlsx":
      return <ExcelLogo className={className} />;
    case "docx":
      return <WordLogo className={className} />;
    case "pptx":
      return <PowerPointLogo className={className} />;
    case "pdf":
      return <PdfLogo className={className} />;
    case "csv":
      return <CsvLogo className={className} />;
    case "image":
      return <ImageLogo className={className} />;
    case "zip":
      return <ZipLogo className={className} />;
    case "md":
      return <TextLogo className={className} isMd />;
    case "txt":
      return <TextLogo className={className} isMd={false} />;
    default:
      return <GenericDocLogo className={className} />;
  }
}
