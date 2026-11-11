"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Crop,
  Flashlight,
  FlashlightOff,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  ScanLine,
  SwitchCamera,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { formatBytes } from "@documind/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  applyEnhanceFilterToCanvas,
  blobToCanvas,
  canvasToJpegBlob,
  compareSignatures,
  computeFrameSignature,
  computeMotionScore,
  defaultFullQuad,
  detectDocumentQuad,
  extractLuma,
  rotateCanvas,
  smoothQuad,
  warpPerspectiveQuad,
  type EnhanceMode,
  type Point,
  type Quad,
} from "@/lib/docScannerCv";
import {
  clearSavedScanPages,
  deleteSavedScanPage,
  loadSavedScanPages,
  persistAllScanPages,
  persistScanPage,
  type SavedScanPageRecord,
} from "@/lib/scanSessionStorage";

export interface ScannedPageItem extends SavedScanPageRecord {
  previewUrl: string;
  processedBlob: Blob;
  processedSize: number;
}

interface AutoDocScannerProps {
  enhanceMode: EnhanceMode;
  maxPages?: number;
  onPagesChange: (pages: ScannedPageItem[]) => void;
  onBuildPdfRequested?: () => void;
  buildingPdf?: boolean;
}

type ScanStage =
  | "searching"
  | "holding"
  | "wait_next_page"
  | "paused"
  | "manual";

const HOLD_TO_CAPTURE_MS = 900;
const POST_CAPTURE_COOLDOWN_MS = 850;
const PAGE_CHANGE_DIFF_THRESHOLD = 0.21;
const PAGE_CHANGE_AFTER_MOTION_DIFF = 0.15;
const MOTION_STEADY_THRESHOLD = 0.022;
const MOTION_FLIP_THRESHOLD = 0.055;

function playShutterChime(enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(780, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.08);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
    setTimeout(() => void ctx.close().catch(() => {}), 250);
  } catch {
    // Ignore audio errors when blocked by autoplay policy
  }
}

async function renderProcessedPage(
  originalBlob: Blob,
  quad: Quad,
  rotation: 0 | 90 | 180 | 270,
  enhanceMode: EnhanceMode,
  forPdfExport = false
): Promise<{ blob: Blob; previewUrl: string }> {
  const srcCanvas = await blobToCanvas(originalBlob);
  const warped = warpPerspectiveQuad(srcCanvas, quad, forPdfExport ? 1800 : 900);
  const rotated = rotateCanvas(warped, rotation);
  const enhanced = applyEnhanceFilterToCanvas(rotated, enhanceMode);
  const blob = await canvasToJpegBlob(enhanced, forPdfExport ? 0.92 : 0.84);
  const previewUrl = URL.createObjectURL(blob);
  return { blob, previewUrl };
}

function toSavedRecord(p: ScannedPageItem): SavedScanPageRecord {
  return {
    id: p.id,
    order: p.order,
    name: p.name,
    capturedAt: p.capturedAt,
    originalBlob: p.originalBlob,
    quad: p.quad,
    rotation: p.rotation,
  };
}

export async function exportPageForUpload(
  page: ScannedPageItem
): Promise<File> {
  const srcCanvas = await blobToCanvas(page.originalBlob);
  const warped = warpPerspectiveQuad(srcCanvas, page.quad, 2000);
  const rotated = rotateCanvas(warped, page.rotation);
  const blob = await canvasToJpegBlob(rotated, 0.93);
  return new File([blob], page.name, { type: "image/jpeg" });
}

export function AutoDocScanner({
  enhanceMode,
  maxPages = 30,
  onPagesChange,
  onBuildPdfRequested,
  buildingPdf = false,
}: AutoDocScannerProps) {
  const [activeTab, setActiveTab] = useState<"camera" | "upload">("camera");
  const [autoCapture, setAutoCapture] = useState(true);
  const [autoPaused, setAutoPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoCropEnabled, setAutoCropEnabled] = useState(true);

  const [cameraState, setCameraState] = useState<"starting" | "ready" | "error">("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const [scanStage, setScanStage] = useState<ScanStage>("searching");
  const [holdProgress, setHoldProgress] = useState(0);
  const [detectedQuad, setDetectedQuad] = useState<Quad | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string>(
    "Point camera at a page — auto-captures when steady"
  );

  const [pages, setPages] = useState<ScannedPageItem[]>([]);
  const [restoring, setRestoring] = useState(true);
  const [processingCapture, setProcessingCapture] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draftQuad, setDraftQuad] = useState<Quad | null>(null);
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    { type: "page"; id: string; pageNumber: number } | { type: "all" } | null
  >(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewfinderRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [videoOverlayBox, setVideoOverlayBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  // Mutable CV tracking state inside animation loop
  const prevLumaRef = useRef<Uint8Array | null>(null);
  const smoothedQuadRef = useRef<Quad | null>(null);
  const steadySinceRef = useRef<number | null>(null);
  const lastCaptureAtRef = useRef<number>(0);
  const lastCapturedSigRef = useRef<Float32Array | null>(null);
  const sawPageFlipMotionRef = useRef<boolean>(false);
  const waitNextPageRef = useRef<boolean>(false);
  const isCapturingRef = useRef<boolean>(false);

  const pagesRef = useRef<ScannedPageItem[]>(pages);
  pagesRef.current = pages;

  // Keep parent synced
  useEffect(() => {
    onPagesChange(pages);
  }, [pages, onPagesChange]);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      pagesRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  // Load auto-saved pages from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadSavedScanPages();
      if (cancelled || saved.length === 0) {
        setRestoring(false);
        return;
      }
      const hydrated: ScannedPageItem[] = [];
      for (const rec of saved) {
        const rendered = await renderProcessedPage(
          rec.originalBlob,
          rec.quad,
          rec.rotation,
          enhanceMode
        );
        hydrated.push({
          ...rec,
          previewUrl: rendered.previewUrl,
          processedBlob: rendered.blob,
          processedSize: rendered.blob.size,
        });
      }
      if (!cancelled) {
        setPages(hydrated);
        setRestoring(false);
      } else {
        hydrated.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only restore once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render page previews whenever global enhanceMode changes
  const prevModeRef = useRef<EnhanceMode>(enhanceMode);
  useEffect(() => {
    if (prevModeRef.current === enhanceMode) return;
    prevModeRef.current = enhanceMode;
    let cancelled = false;
    (async () => {
      const current = pagesRef.current;
      if (current.length === 0) return;
      const updated = await Promise.all(
        current.map(async (p) => {
          const rendered = await renderProcessedPage(
            p.originalBlob,
            p.quad,
            p.rotation,
            enhanceMode
          );
          return {
            ...p,
            previewUrl: rendered.previewUrl,
            processedBlob: rendered.blob,
            processedSize: rendered.blob.size,
          };
        })
      );
      if (!cancelled) {
        current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        setPages(updated);
      } else {
        updated.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enhanceMode]);

  const updateVideoOverlayBox = useCallback(() => {
    const container = viewfinderRef.current;
    const video = videoRef.current;
    if (!container || !video || video.videoWidth === 0 || video.videoHeight === 0) {
      setVideoOverlayBox(null);
      return;
    }
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.min(cw / video.videoWidth, ch / video.videoHeight);
    const rw = video.videoWidth * scale;
    const rh = video.videoHeight * scale;
    setVideoOverlayBox({
      left: (cw - rw) / 2,
      top: (ch - rh) / 2,
      width: rw,
      height: rh,
    });
  }, []);

  useEffect(() => {
    const container = viewfinderRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateVideoOverlayBox());
    ro.observe(container);
    return () => ro.disconnect();
  }, [updateVideoOverlayBox, activeTab]);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setCameraError(
        "Live camera access is unavailable in this browser context. Use HTTPS/localhost or upload photos below."
      );
      return;
    }

    setCameraState("starting");
    setCameraError(null);

    try {
      const videoConstraint: MediaTrackConstraints = selectedDeviceId
        ? {
            deviceId: { exact: selectedDeviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }
        : {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }

      const track = stream.getVideoTracks()[0];
      if (track) {
        const caps = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(Boolean(caps?.torch));
      }

      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        setDevices(allDevices.filter((d) => d.kind === "videoinput"));
      } catch {
        // Ignore enumerate failure
      }

      setCameraState("ready");
    } catch (err) {
      setCameraState("error");
      const msg =
        err instanceof Error
          ? err.message
          : "Camera permission was denied or no camera device was found.";
      setCameraError(msg);
    }
  }, [facingMode, selectedDeviceId, stopCamera]);

  useEffect(() => {
    if (activeTab === "camera") {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab, startCamera, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      // Some devices reject torch constraints dynamically
    }
  };

  const addCapturedBlob = useCallback(
    async (
      rawBlob: Blob,
      quadHint: Quad | null,
      sourceLabel = "scan"
    ): Promise<ScannedPageItem | null> => {
      if (pagesRef.current.length >= maxPages) return null;
      const chosenQuad = autoCropEnabled
        ? quadHint ?? defaultFullQuad(0.02)
        : defaultFullQuad(0);

      const pageNumber = pagesRef.current.length + 1;
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const record: SavedScanPageRecord = {
        id,
        order: pageNumber - 1,
        name: `${sourceLabel}_page_${String(pageNumber).padStart(2, "0")}.jpg`,
        capturedAt: Date.now(),
        originalBlob: rawBlob,
        quad: chosenQuad,
        rotation: 0,
      };

      const rendered = await renderProcessedPage(
        record.originalBlob,
        record.quad,
        record.rotation,
        enhanceMode
      );

      const item: ScannedPageItem = {
        ...record,
        previewUrl: rendered.previewUrl,
        processedBlob: rendered.blob,
        processedSize: rendered.blob.size,
      };

      await persistScanPage(record);
      setPages((prev) => [...prev, item].slice(0, maxPages));
      return item;
    },
    [autoCropEnabled, enhanceMode, maxPages]
  );

  const captureFromVideo = useCallback(
    async (quadOverride?: Quad | null, analysisImgData?: ImageData | null) => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || isCapturingRef.current) return;
      if (pagesRef.current.length >= maxPages) {
        setStatusBanner(`Max limit of ${maxPages} pages reached — build your PDF below.`);
        return;
      }

      isCapturingRef.current = true;
      setProcessingCapture(true);
      setFlashActive(true);
      setTimeout(() => setFlashActive(false), 180);
      playShutterChime(soundEnabled);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(35);
      }

      try {
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        const snapCanvas = document.createElement("canvas");
        snapCanvas.width = vw;
        snapCanvas.height = vh;
        const ctx = snapCanvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0, vw, vh);

        const rawBlob = await canvasToJpegBlob(snapCanvas, 0.94);
        const quadToUse = quadOverride ?? smoothedQuadRef.current;

        if (analysisImgData) {
          lastCapturedSigRef.current = computeFrameSignature(analysisImgData, quadToUse);
        }
        lastCaptureAtRef.current = performance.now();
        waitNextPageRef.current = true;
        sawPageFlipMotionRef.current = false;
        steadySinceRef.current = null;
        setHoldProgress(0);

        const savedPageNum = pagesRef.current.length + 1;
        const saved = await addCapturedBlob(rawBlob, quadToUse, "scan");
        if (saved) {
          setScanStage("wait_next_page");
          setStatusBanner(
            `Page ${savedPageNum} auto-saved! Turn or show next page`
          );
        }
      } finally {
        isCapturingRef.current = false;
        setProcessingCapture(false);
      }
    },
    [addCapturedBlob, maxPages, soundEnabled]
  );

  // Real-time Document Edge + Stability + Page-Change Loop
  useEffect(() => {
    if (activeTab !== "camera" || cameraState !== "ready") return;

    if (!analysisCanvasRef.current) {
      analysisCanvasRef.current = document.createElement("canvas");
    }
    const analysisCanvas = analysisCanvasRef.current;
    let lastTick = 0;
    let cancelled = false;

    const loop = (now: number) => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(loop);

      // Run CV at ~14 fps to stay light on battery & CPU
      if (now - lastTick < 70) return;
      lastTick = now;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      const scale = Math.min(1, 240 / Math.max(video.videoWidth, video.videoHeight));
      const aw = Math.max(80, Math.round(video.videoWidth * scale));
      const ah = Math.max(60, Math.round(video.videoHeight * scale));
      if (analysisCanvas.width !== aw || analysisCanvas.height !== ah) {
        analysisCanvas.width = aw;
        analysisCanvas.height = ah;
      }

      const actx = analysisCanvas.getContext("2d", { willReadFrequently: true });
      if (!actx) return;
      actx.drawImage(video, 0, 0, aw, ah);
      const imgData = actx.getImageData(0, 0, aw, ah);

      const currLuma = extractLuma(imgData);
      const motion = prevLumaRef.current ? computeMotionScore(prevLumaRef.current, currLuma) : 0;
      prevLumaRef.current = currLuma;

      const detection = detectDocumentQuad(imgData);
      const nextSmooth = smoothQuad(smoothedQuadRef.current, detection.quad, 0.36);
      smoothedQuadRef.current = nextSmooth;
      setDetectedQuad(nextSmooth);

      if (!autoCapture) {
        setScanStage("manual");
        setHoldProgress(0);
        setStatusBanner("Manual shutter mode — tap capture button when ready");
        return;
      }

      if (autoPaused) {
        setScanStage("paused");
        setHoldProgress(0);
        setStatusBanner("Auto-scan paused — press Resume to continue hands-free scanning");
        return;
      }

      if (pagesRef.current.length >= maxPages) {
        setScanStage("paused");
        setHoldProgress(0);
        setStatusBanner(`Reached ${maxPages} pages — click Save PDF below`);
        return;
      }

      if (isCapturingRef.current) return;

      // Cooldown immediately after capture so hands pulling back don't re-trigger
      const sinceCapture = now - lastCaptureAtRef.current;
      if (waitNextPageRef.current) {
        if (motion > MOTION_FLIP_THRESHOLD) {
          sawPageFlipMotionRef.current = true;
        }
        if (sinceCapture < POST_CAPTURE_COOLDOWN_MS) {
          setScanStage("wait_next_page");
          setHoldProgress(0);
          return;
        }

        const lastSig = lastCapturedSigRef.current;
        if (lastSig) {
          const currSig = computeFrameSignature(imgData, nextSmooth);
          const diff = compareSignatures(currSig, lastSig);
          const requiredDiff = sawPageFlipMotionRef.current
            ? PAGE_CHANGE_AFTER_MOTION_DIFF
            : PAGE_CHANGE_DIFF_THRESHOLD;

          if (diff < requiredDiff) {
            setScanStage("wait_next_page");
            setHoldProgress(0);
            setStatusBanner(
              `Page ${pagesRef.current.length} auto-saved • Flip or swap to next page`
            );
            return;
          }
        }

        // Page changed! Ready to auto-capture the new page once steady
        waitNextPageRef.current = false;
        sawPageFlipMotionRef.current = false;
        steadySinceRef.current = null;
      }

      const documentReady =
        (detection.quad !== null && detection.confidence >= 0.45) ||
        (detection.hasContent && detection.sharpness >= 0.16);

      if (!documentReady) {
        steadySinceRef.current = null;
        setHoldProgress(0);
        setScanStage("searching");
        setStatusBanner("Align page inside frame — auto-scan searching…");
        return;
      }

      if (motion > MOTION_STEADY_THRESHOLD) {
        steadySinceRef.current = null;
        setHoldProgress(0);
        setScanStage("searching");
        setStatusBanner("Movement detected — hold page steady…");
        return;
      }

      if (steadySinceRef.current === null) {
        steadySinceRef.current = now;
      }
      const elapsed = now - steadySinceRef.current;
      const pct = Math.min(1, elapsed / HOLD_TO_CAPTURE_MS);
      setHoldProgress(pct);
      setScanStage("holding");
      setStatusBanner("Hold steady… auto-capturing page");

      if (elapsed >= HOLD_TO_CAPTURE_MS) {
        void captureFromVideo(nextSmooth, imgData);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [activeTab, autoCapture, autoPaused, cameraState, captureFromVideo, maxPages]);

  const handleManualSnap = () => {
    const video = videoRef.current;
    const analysisCanvas = analysisCanvasRef.current;
    let imgData: ImageData | null = null;
    if (video && analysisCanvas && analysisCanvas.width > 0) {
      const ctx = analysisCanvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height);
        imgData = ctx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
      }
    }
    void captureFromVideo(smoothedQuadRef.current, imgData);
  };

  // Auto-detect edges & crop uploaded photos too
  const handleFilesSelected = async (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setProcessingCapture(true);
    try {
      const list = Array.from(incoming).slice(0, Math.max(0, maxPages - pagesRef.current.length));
      for (const file of list) {
        const canvas = await blobToCanvas(file);
        const scale = Math.min(1, 240 / Math.max(canvas.width, canvas.height));
        const probe = document.createElement("canvas");
        probe.width = Math.max(80, Math.round(canvas.width * scale));
        probe.height = Math.max(60, Math.round(canvas.height * scale));
        const pctx = probe.getContext("2d", { willReadFrequently: true })!;
        pctx.drawImage(canvas, 0, 0, probe.width, probe.height);
        const det = detectDocumentQuad(pctx.getImageData(0, 0, probe.width, probe.height));
        const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
        await addCapturedBlob(file, det.quad, baseName);
      }
    } finally {
      setProcessingCapture(false);
    }
  };

  const handleDeletePage = async (id: string) => {
    const target = pages.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    const next = pages
      .filter((p) => p.id !== id)
      .map((p, idx) => ({ ...p, order: idx }));
    setPages(next);
    await deleteSavedScanPage(id);
    await persistAllScanPages(next.map(toSavedRecord));
    if (next.length === 0) {
      lastCapturedSigRef.current = null;
      waitNextPageRef.current = false;
    }
  };

  const handleClearAll = async () => {
    pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPages([]);
    lastCapturedSigRef.current = null;
    waitNextPageRef.current = false;
    await clearSavedScanPages();
  };

  const handleRotatePage = async (id: string) => {
    const target = pages.find((p) => p.id === id);
    if (!target) return;
    const nextRot = ((target.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    const rendered = await renderProcessedPage(
      target.originalBlob,
      target.quad,
      nextRot,
      enhanceMode
    );
    URL.revokeObjectURL(target.previewUrl);
    const updatedRec: SavedScanPageRecord = {
      id: target.id,
      order: target.order,
      name: target.name,
      capturedAt: target.capturedAt,
      originalBlob: target.originalBlob,
      quad: target.quad,
      rotation: nextRot,
    };
    await persistScanPage(updatedRec);
    setPages((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...updatedRec,
              previewUrl: rendered.previewUrl,
              processedBlob: rendered.blob,
              processedSize: rendered.blob.size,
            }
          : p
      )
    );
  };

  const handleMovePage = async (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= pages.length) return;
    const copy = [...pages];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    const reordered = copy.map((p, i) => ({ ...p, order: i }));
    setPages(reordered);
    await persistAllScanPages(reordered.map(toSavedRecord));
  };

  const openCropEditor = (page: ScannedPageItem) => {
    if (editingImageUrl) URL.revokeObjectURL(editingImageUrl);
    setEditingPageId(page.id);
    setDraftQuad(page.quad);
    setEditingImageUrl(URL.createObjectURL(page.originalBlob));
  };

  const closeCropEditor = () => {
    if (editingImageUrl) URL.revokeObjectURL(editingImageUrl);
    setEditingImageUrl(null);
    setEditingPageId(null);
    setDraftQuad(null);
  };

  const applyCropEditor = async () => {
    if (!editingPageId || !draftQuad) return;
    const target = pages.find((p) => p.id === editingPageId);
    if (!target) return;
    const rendered = await renderProcessedPage(
      target.originalBlob,
      draftQuad,
      target.rotation,
      enhanceMode
    );
    URL.revokeObjectURL(target.previewUrl);
    const updatedRec: SavedScanPageRecord = {
      id: target.id,
      order: target.order,
      name: target.name,
      capturedAt: target.capturedAt,
      originalBlob: target.originalBlob,
      quad: draftQuad,
      rotation: target.rotation,
    };
    await persistScanPage(updatedRec);
    setPages((prev) =>
      prev.map((p) =>
        p.id === editingPageId
          ? {
              ...updatedRec,
              previewUrl: rendered.previewUrl,
              processedBlob: rendered.blob,
              processedSize: rendered.blob.size,
            }
          : p
      )
    );
    closeCropEditor();
  };

  const switchCamera = () => {
    if (devices.length > 1) {
      const idx = devices.findIndex((d) => d.deviceId === selectedDeviceId);
      const next = devices[(idx + 1) % devices.length];
      setSelectedDeviceId(next.deviceId);
    } else {
      setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
    }
  };

  const activeQuadPoints = useMemo(() => {
    const q = detectedQuad;
    if (!q) return null;
    const pct = (p: Point) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`;
    return `${pct(q.tl)} ${pct(q.tr)} ${pct(q.br)} ${pct(q.bl)}`;
  }, [detectedQuad]);

  const stageColor =
    scanStage === "wait_next_page"
      ? "emerald"
      : scanStage === "holding"
        ? "sky"
        : "amber";

  return (
    <div className="space-y-4">
      {/* Scanner Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("camera")}
            className={`px-3 py-1.5 rounded-lg font-medium inline-flex items-center gap-1.5 transition-colors ${
              activeTab === "camera"
                ? "bg-[var(--dm-surface)] text-[var(--dm-text)] shadow-sm"
                : "text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
            }`}
          >
            <ScanLine className="h-3.5 w-3.5 text-sky-500" />
            <span>Live Auto-Scanner</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`px-3 py-1.5 rounded-lg font-medium inline-flex items-center gap-1.5 transition-colors ${
              activeTab === "upload"
                ? "bg-[var(--dm-surface)] text-[var(--dm-text)] shadow-sm"
                : "text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
            }`}
          >
            <Upload className="h-3.5 w-3.5 text-indigo-500" />
            <span>Upload / Gallery</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setAutoCapture((v) => !v)}
            className={`px-3 py-1.5 rounded-xl border font-medium inline-flex items-center gap-1.5 transition-colors ${
              autoCapture
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                : "border-[var(--dm-border)] bg-[var(--dm-subtle)] text-[var(--dm-muted)]"
            }`}
            title="Automatically detect pages, capture when steady, and save on page change"
          >
            <ScanLine className="h-3.5 w-3.5" />
            <span>Auto-Scan: {autoCapture ? "ON" : "OFF"}</span>
          </button>

          <button
            type="button"
            onClick={() => setAutoCropEnabled((v) => !v)}
            className={`px-3 py-1.5 rounded-xl border font-medium inline-flex items-center gap-1.5 transition-colors ${
              autoCropEnabled
                ? "border-sky-500/40 bg-sky-500/15 text-sky-600 dark:text-sky-300"
                : "border-[var(--dm-border)] bg-[var(--dm-subtle)] text-[var(--dm-muted)]"
            }`}
            title="Automatically straighten & crop detected document edges"
          >
            <Crop className="h-3.5 w-3.5" />
            <span>Auto-Crop: {autoCropEnabled ? "ON" : "OFF"}</span>
          </button>

          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className="p-2 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
            title={soundEnabled ? "Mute shutter sound" : "Unmute shutter sound"}
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Live Viewfinder */}
      {activeTab === "camera" ? (
        <div
          ref={viewfinderRef}
          className="relative rounded-2xl overflow-hidden border border-[var(--dm-border)] bg-slate-950 aspect-[4/3] sm:aspect-[16/10] flex items-center justify-center select-none"
        >
          <video
            ref={videoRef}
            playsInline
            muted
            onLoadedMetadata={updateVideoOverlayBox}
            onResize={updateVideoOverlayBox}
            className="w-full h-full object-contain bg-slate-950"
          />

          {/* Document Quad & Spotlight SVG Overlay */}
          {cameraState === "ready" && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={
                videoOverlayBox
                  ? {
                      left: `${videoOverlayBox.left}px`,
                      top: `${videoOverlayBox.top}px`,
                      width: `${videoOverlayBox.width}px`,
                      height: `${videoOverlayBox.height}px`,
                    }
                  : undefined
              }
              className={`absolute pointer-events-none ${videoOverlayBox ? "" : "inset-0 w-full h-full"}`}
            >
              {activeQuadPoints && detectedQuad ? (
                <>
                  <defs>
                    <mask id="doc-spotlight-mask">
                      <rect x="0" y="0" width="100" height="100" fill="white" />
                      <polygon points={activeQuadPoints} fill="black" />
                    </mask>
                  </defs>
                  <rect
                    x="0"
                    y="0"
                    width="100"
                    height="100"
                    fill="rgba(2, 6, 23, 0.42)"
                    mask="url(#doc-spotlight-mask)"
                  />
                  <polygon
                    points={activeQuadPoints}
                    fill={
                      stageColor === "emerald"
                        ? "rgba(16, 185, 129, 0.14)"
                        : stageColor === "sky"
                          ? "rgba(56, 189, 248, 0.16)"
                          : "rgba(99, 102, 241, 0.10)"
                    }
                    stroke={
                      stageColor === "emerald"
                        ? "#10b981"
                        : stageColor === "sky"
                          ? "#38bdf8"
                          : "#818cf8"
                    }
                    strokeWidth="0.7"
                    strokeLinejoin="round"
                  />
                  {[detectedQuad.tl, detectedQuad.tr, detectedQuad.br, detectedQuad.bl].map(
                    (pt, i) => (
                      <circle
                        key={i}
                        cx={pt.x * 100}
                        cy={pt.y * 100}
                        r="1.35"
                        fill="#ffffff"
                        stroke={stageColor === "emerald" ? "#10b981" : "#38bdf8"}
                        strokeWidth="0.6"
                      />
                    )
                  )}
                </>
              ) : (
                /* Subtle center alignment guides when full-frame or searching */
                <g
                  stroke={
                    stageColor === "emerald"
                      ? "rgba(16, 185, 129, 0.85)"
                      : stageColor === "sky"
                        ? "rgba(56, 189, 248, 0.85)"
                        : "rgba(255, 255, 255, 0.35)"
                  }
                  strokeWidth="0.65"
                  fill="none"
                >
                  <path d="M 10 18 L 10 10 L 18 10" />
                  <path d="M 82 10 L 90 10 L 90 18" />
                  <path d="M 90 82 L 90 90 L 82 90" />
                  <path d="M 18 90 L 10 90 L 10 82" />
                </g>
              )}
            </svg>
          )}

          {/* Shutter flash */}
          {flashActive && (
            <div className="absolute inset-0 bg-white/80 pointer-events-none transition-opacity duration-150" />
          )}

          {/* Top Status Pill */}
          {cameraState === "ready" && (
            <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2 pointer-events-none">
              <div
                className={`px-3 py-1.5 rounded-full backdrop-blur-md text-xs font-medium inline-flex items-center gap-2 border shadow-lg ${
                  scanStage === "wait_next_page"
                    ? "bg-emerald-950/80 border-emerald-400/50 text-emerald-200"
                    : scanStage === "holding"
                      ? "bg-sky-950/80 border-sky-400/50 text-sky-100"
                      : "bg-slate-950/75 border-white/15 text-slate-100"
                }`}
              >
                {scanStage === "wait_next_page" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : scanStage === "holding" ? (
                  <Loader2 className="h-3.5 w-3.5 text-sky-400 animate-spin shrink-0" />
                ) : (
                  <ScanLine className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                )}
                <span>{statusBanner}</span>
              </div>

              <div className="px-2.5 py-1 rounded-full bg-slate-950/75 border border-white/15 text-[11px] font-mono text-white backdrop-blur-md shrink-0">
                {pages.length} / {maxPages} saved
              </div>
            </div>
          )}

          {/* Center Auto-Capture Ring when holding steady */}
          {cameraState === "ready" && scanStage === "holding" && holdProgress > 0.05 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-20 w-20 rounded-full bg-slate-950/55 backdrop-blur-sm flex items-center justify-center relative">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="5"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={2 * Math.PI * 34 * (1 - holdProgress)}
                  />
                </svg>
                <span className="absolute text-xs font-mono font-semibold text-white">
                  {Math.round(holdProgress * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Bottom Camera HUD Controls */}
          {cameraState === "ready" && (
            <div className="absolute bottom-3 inset-x-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {autoCapture && (
                  <button
                    type="button"
                    onClick={() => setAutoPaused((p) => !p)}
                    className="px-3 py-2 rounded-full bg-slate-950/80 hover:bg-slate-900 border border-white/15 text-white text-xs font-medium inline-flex items-center gap-1.5 backdrop-blur-md"
                  >
                    {autoPaused ? (
                      <>
                        <Play className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Resume</span>
                      </>
                    ) : (
                      <>
                        <Pause className="h-3.5 w-3.5 text-amber-300" />
                        <span>Pause</span>
                      </>
                    )}
                  </button>
                )}

                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className="p-2.5 rounded-full bg-slate-950/80 hover:bg-slate-900 border border-white/15 text-white backdrop-blur-md"
                    title="Toggle flash"
                  >
                    {torchOn ? (
                      <Flashlight className="h-4 w-4 text-amber-300" />
                    ) : (
                      <FlashlightOff className="h-4 w-4" />
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={switchCamera}
                  className="p-2.5 rounded-full bg-slate-950/80 hover:bg-slate-900 border border-white/15 text-white backdrop-blur-md"
                  title="Switch camera"
                >
                  <SwitchCamera className="h-4 w-4" />
                </button>
              </div>

              {/* Manual / Force Shutter Button */}
              <button
                type="button"
                onClick={handleManualSnap}
                disabled={processingCapture || pages.length >= maxPages}
                className="h-12 w-12 rounded-full border-2 border-white bg-white/20 hover:bg-white/35 active:scale-95 transition-all flex items-center justify-center backdrop-blur-md disabled:opacity-40"
                title={
                  autoCapture
                    ? "Force instant capture (auto-capture is already active)"
                    : "Capture page"
                }
              >
                <span className="h-9 w-9 rounded-full bg-white shadow-inner block" />
              </button>

              <div className="flex items-center gap-2">
                {pages.length > 0 && onBuildPdfRequested && (
                  <button
                    type="button"
                    onClick={onBuildPdfRequested}
                    disabled={buildingPdf}
                    className="px-3.5 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 shadow-lg disabled:opacity-50"
                  >
                    {buildingPdf ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    <span>Save PDF ({pages.length})</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Starting / Error Overlay */}
          {cameraState === "starting" && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 text-slate-200 text-xs">
              <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
              <span>Starting live document scanner camera…</span>
            </div>
          )}

          {cameraState === "error" && (
            <div className="absolute inset-0 bg-slate-950/95 p-6 flex flex-col items-center justify-center text-center gap-3">
              <Camera className="h-8 w-8 text-amber-400" />
              <div className="space-y-1 max-w-md">
                <p className="text-sm font-semibold text-white">Camera Unavailable</p>
                <p className="text-xs text-slate-300">{cameraError}</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("upload")}
                  className="px-3.5 py-2 rounded-xl border border-white/20 bg-white/10 text-white text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload Photos Instead</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Upload / Gallery Tab with Auto-Edge-Crop */
        <label className="block rounded-2xl border-2 border-dashed border-[var(--dm-border)] hover:border-sky-500/60 bg-[var(--dm-subtle)] p-8 text-center cursor-pointer transition-colors">
          <input
            type="file"
            accept="image/png,image/jpeg"
            capture="environment"
            multiple
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <div className="h-11 w-11 rounded-2xl bg-sky-500/15 text-sky-500 flex items-center justify-center">
              {processingCapture ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </div>
            <p className="text-sm font-medium">
              Click to select photos or drop mobile captures
            </p>
            <p className="text-xs text-[var(--dm-muted)]">
              Document edges are automatically detected, straightened, and auto-saved ({pages.length}
              /{maxPages} pages).
            </p>
          </div>
        </label>
      )}

      {/* Auto-Saved Scanned Pages Filmstrip */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
              Auto-Saved Pages ({pages.length})
            </span>
            {restoring && (
              <span className="text-[var(--dm-muted)] inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Restoring…
              </span>
            )}
            {!restoring && pages.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-medium">
                Saved locally
              </span>
            )}
          </div>
          {pages.length > 0 && (
            <button
              type="button"
              onClick={() => setPendingDelete({ type: "all" })}
              className="text-red-400 hover:underline font-medium"
            >
              Clear All
            </button>
          )}
        </div>

        {pages.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {pages.map((p, idx) => (
              <div
                key={p.id}
                className="rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] overflow-hidden flex flex-col group"
              >
                <div className="relative aspect-[3/4] bg-slate-900 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewUrl}
                    alt={`Scanned page ${idx + 1}`}
                    className="w-full h-full object-contain"
                  />
                  <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-slate-950/80 text-white text-[10px] font-mono font-semibold">
                    P{idx + 1}
                  </span>
                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-slate-950/75 text-slate-200 text-[10px] font-mono">
                    {formatBytes(p.processedSize)}
                  </span>
                </div>

                <div className="p-1.5 flex items-center justify-between gap-1 border-t border-[var(--dm-border)]">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void handleMovePage(idx, -1)}
                      className="p-1 rounded hover:bg-[var(--dm-surface)] disabled:opacity-30"
                      title="Move left"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === pages.length - 1}
                      onClick={() => void handleMovePage(idx, 1)}
                      className="p-1 rounded hover:bg-[var(--dm-surface)] disabled:opacity-30"
                      title="Move right"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => openCropEditor(p)}
                      className="p-1 rounded hover:bg-[var(--dm-surface)] text-sky-500"
                      title="Adjust crop corners"
                    >
                      <Crop className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRotatePage(p.id)}
                      className="p-1 rounded hover:bg-[var(--dm-surface)]"
                      title="Rotate 90°"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingDelete({ type: "page", id: p.id, pageNumber: idx + 1 })
                      }
                      className="p-1 rounded hover:bg-red-500/15 text-red-400"
                      title="Delete page"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4-Corner Interactive Crop Modal */}
      {editingPageId && draftQuad && editingImageUrl && (
        <CornerCropModal
          imageUrl={editingImageUrl}
          quad={draftQuad}
          onChange={setDraftQuad}
          onReset={() => setDraftQuad(defaultFullQuad(0.03))}
          onCancel={closeCropEditor}
          onApply={() => void applyCropEditor()}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete?.type === "all"
            ? `Are you sure you want to clear all ${pages.length} pages?`
            : `Are you sure you want to delete Page ${pendingDelete?.pageNumber ?? ""}?`
        }
        description={
          pendingDelete?.type === "all"
            ? "All auto-saved scanned pages in this session will be permanently removed."
            : "This scanned page will be permanently removed from your current scan queue."
        }
        confirmLabel={pendingDelete?.type === "all" ? "Clear All Pages" : "Delete Page"}
        loading={confirmingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          setConfirmingDelete(true);
          try {
            if (pendingDelete.type === "all") {
              await handleClearAll();
            } else {
              await handleDeletePage(pendingDelete.id);
            }
            setPendingDelete(null);
          } finally {
            setConfirmingDelete(false);
          }
        }}
      />
    </div>
  );
}

interface CornerCropModalProps {
  imageUrl: string;
  quad: Quad;
  onChange: (q: Quad) => void;
  onReset: () => void;
  onCancel: () => void;
  onApply: () => void;
}

function CornerCropModal({
  imageUrl,
  quad,
  onChange,
  onReset,
  onCancel,
  onApply,
}: CornerCropModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [draggingCorner, setDraggingCorner] = useState<keyof Quad | null>(null);

  const updatePointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!draggingCorner || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      const ny = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
      onChange({
        ...quad,
        [draggingCorner]: { x: nx, y: ny },
      });
    },
    [draggingCorner, onChange, quad]
  );

  useEffect(() => {
    if (!draggingCorner) return;
    const onMove = (e: PointerEvent) => updatePointer(e.clientX, e.clientY);
    const onUp = () => setDraggingCorner(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingCorner, updatePointer]);

  const pts = `${quad.tl.x * 100},${quad.tl.y * 100} ${quad.tr.x * 100},${quad.tr.y * 100} ${quad.br.x * 100},${quad.br.y * 100} ${quad.bl.x * 100},${quad.bl.y * 100}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="dm-card max-w-2xl w-full p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Adjust Page Corners</h3>
            <p className="text-xs text-[var(--dm-muted)]">
              Drag the 4 corner handles to straighten and crop the scanned sheet.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-[var(--dm-subtle)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex justify-center bg-slate-950 rounded-xl p-2 max-h-[65vh] overflow-hidden">
          <div ref={containerRef} className="relative inline-block touch-none select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Crop source"
              className="max-h-[60vh] w-auto block rounded-lg pointer-events-none"
            />
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none"
            >
              <polygon
                points={pts}
                fill="rgba(56, 189, 248, 0.16)"
                stroke="#38bdf8"
                strokeWidth="0.8"
              />
            </svg>
            {(["tl", "tr", "br", "bl"] as (keyof Quad)[]).map((key) => {
              const p = quad[key];
              return (
                <button
                  key={key}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDraggingCorner(key);
                  }}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-sky-500 border-2 border-white shadow-lg cursor-grab active:cursor-grabbing"
                  aria-label={`Drag ${key} corner`}
                />
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-2 text-xs rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] font-medium"
          >
            Reset Full Frame
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 text-xs rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              className="dm-primary-btn px-4 py-2 text-xs font-medium"
            >
              Apply Crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
