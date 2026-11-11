"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { fetchAuthorizedBlob } from "@/lib/api";

interface PdfViewerProps {
  documentId: string;
  versionNo: number;
  currentPage: number;
  zoom: number;
  onPageCount?: (count: number) => void;
}

const PDF_BYTES_CACHE_MAX = 6;
const pdfBytesCache = new Map<string, Uint8Array>();

function cachePdfBytes(key: string, bytes: Uint8Array): void {
  if (pdfBytesCache.has(key)) {
    pdfBytesCache.delete(key);
  } else if (pdfBytesCache.size >= PDF_BYTES_CACHE_MAX) {
    const oldestKey = pdfBytesCache.keys().next().value;
    if (oldestKey) pdfBytesCache.delete(oldestKey);
  }
  pdfBytesCache.set(key, bytes);
}

export function PdfViewer({
  documentId,
  versionNo,
  currentPage,
  zoom,
  onPageCount,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onPageCountRef = useRef(onPageCount);
  onPageCountRef.current = onPageCount;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);

  useEffect(() => {
    let cancelled = false;
    let activeDoc: import("pdfjs-dist").PDFDocumentProxy | null = null;
    const cacheKey = `${documentId}:v${versionNo}`;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let bytes = pdfBytesCache.get(cacheKey);
        if (!bytes) {
          const blob = await fetchAuthorizedBlob(`/documents/${documentId}/preview?v=${versionNo}`);
          bytes = new Uint8Array(await blob.arrayBuffer());
          cachePdfBytes(cacheKey, bytes);
        }
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        // Pass a copy because pdf.js may transfer/detach the underlying buffer to its worker
        const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        activeDoc = doc;
        setPdfDoc(doc);
        onPageCountRef.current?.(doc.numPages);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to preview this PDF (it may be password-protected)."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (activeDoc) {
        activeDoc.destroy().catch(() => undefined);
      }
    };
  }, [documentId, versionNo]);

  useEffect(() => {
    let cancelled = false;
    let activeRenderTask: import("pdfjs-dist").RenderTask | null = null;

    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;
      const safePage = Math.max(1, Math.min(currentPage, pdfDoc.numPages));
      const page = await pdfDoc.getPage(safePage);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      activeRenderTask = page.render({ canvasContext: ctx, viewport });
      await activeRenderTask.promise;
    }

    renderPage().catch((err) => {
      if (!cancelled && err?.name !== "RenderingCancelledException") {
        setError(err instanceof Error ? err.message : "Failed to render page.");
      }
    });

    return () => {
      cancelled = true;
      if (activeRenderTask) {
        try {
          activeRenderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, currentPage, zoom]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[360px] gap-2 text-sm text-[var(--dm-muted)]">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
        <span>Rendering document preview...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[360px] p-6 text-center gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-sm font-medium">Preview unavailable</p>
        <p className="text-xs text-[var(--dm-muted)] max-w-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex justify-center p-6 overflow-auto h-full">
      <canvas
        ref={canvasRef}
        className="rounded-md shadow-xl border border-[var(--dm-border)] bg-white"
      />
    </div>
  );
}
