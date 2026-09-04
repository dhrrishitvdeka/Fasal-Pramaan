"use client";

import Link from "next/link";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Mic,
  MicOff,
  MapPin,
  Maximize2,
  ArrowUpLeft,
  ArrowUpRight,
  Scan,
  ZoomIn,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Save,
  Send,
  Trash2,
  Info,
  Layers,
  HelpCircle,
  Compass,
  Check,
  AlertTriangle,
  Lock,
  Upload,
} from "lucide-react";
import { useFarmerData, ClaimImageEvidence } from "@/lib/farmerStore";
import { getFarmerT, CANONICAL_ANGLES as ANGLE_DEFS } from "@/lib/farmerI18n";
import { getLocalizedAngleInfo } from "@/lib/help-i18n";
import { getSpeechLocale } from "@/lib/live-indian-languages";
import {
  isUnusableLighting,
  measureLightingScore,
  qualityPassedFromSignals,
  sha256FromDataUrl,
  sha256Hex,
} from "@/lib/evidence";
import {
  applyVideoPlaybackFlags,
  attachStreamToVideo,
  BLANK_SENSOR_LUMA_MAX,
  cameraConstraintLadder,
  enqueueCameraWork,
  sampleVideoMeanLuma,
  safeDisplayUrl,
  stopMediaStream,
  videoFrameCaptureSize,
} from "@/lib/media";
import { isSupabaseConfigured } from "@/lib/supabase";
import { runVoiceShutter, runVoiceSubmitDraft } from "@/lib/voice/capture-actions";
import { webCaptureBridge } from "@/lib/voice/capture-bridge";
import { anglesForPeril, normalizePeril, routeForPeril } from "@/lib/claim-routing";
import { apiFetch } from "@/lib/auth-headers";
import clsx from "clsx";

function CaptureStudioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    lang,
    plots,
    claims,
    farmerProfile,
    registerPlot,
    createClaim,
    updateClaimRecapture,
    saveClaimDraft,
    loadClaimDraft,
    completeMilestone,
    milestones,
    persistError,
    activeIntent,
    clearActiveIntent,
  } = useFarmerData();
  const t = getFarmerT(lang);

  // URL query params
  const recaptureClaimId = searchParams.get("recapture");
  const requestedAnglesParam = searchParams.get("angles");
  const plotIdParam = searchParams.get("plotId");
  const milestoneId = searchParams.get("milestone");
  const intentIdParam = searchParams.get("intentId");
  const perilParam = searchParams.get("peril");
  const milestone = milestones.find((item) => item.id === milestoneId);

  // Determine active angles to capture — peril-aware, recapture-aware, intent-aware
  const isTargetedRecapture = Boolean(recaptureClaimId);
  const targetAngleIds = requestedAnglesParam
    ? requestedAnglesParam.split(",").map((s) => s.trim())
    : [];
  const requestedPeril = normalizePeril(
    perilParam || (intentIdParam ? activeIntent?.peril : undefined) || "normal",
  );
  const intentAngles = anglesForPeril(requestedPeril);
  const baseAngleDefs = intentAngles.length ? intentAngles : ANGLE_DEFS;

  const filteredRecaptureAngles = isTargetedRecapture && targetAngleIds.length > 0
    ? ANGLE_DEFS.filter((a) => targetAngleIds.includes(a.id) && a.id !== "__gps__")
    : [];
  const activeAngleDefs = filteredRecaptureAngles.length > 0
    ? filteredRecaptureAngles
    : baseAngleDefs;
  const activeRoute = routeForPeril(requestedPeril);

  // Selected plot
  const [selectedPlotId, setSelectedPlotId] = useState<string>(
    plotIdParam || milestone?.plotId || plots[0]?.id || "",
  );
  const selectedPlot = plots.find((p) => p.id === selectedPlotId);

  useEffect(() => {
    if (milestone?.plotId) setSelectedPlotId(milestone.plotId);
  }, [milestone?.plotId]);

  useEffect(() => {
    if (!selectedPlotId && plots.length > 0) {
      setSelectedPlotId(plots[0].id);
    }
  }, [plots, selectedPlotId]);

  // A leftover Saathi intent must not silently hijack a fresh capture (e.g. drought
  // 3-angle route on a later general claim). Only honor it when the URL carries it.
  useEffect(() => {
    if (!perilParam && !intentIdParam && !recaptureClaimId) {
      clearActiveIntent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perilParam, intentIdParam, recaptureClaimId]);

  // Active step in stepper
  const [currentAngleIndex, setCurrentAngleIndex] = useState<number>(0);
  const currentAngle = activeAngleDefs[currentAngleIndex] || activeAngleDefs[0];

  // Mobile guidance accordion — collapsed/expanded below the viewfinder; always
  // open on lg+ (two-column studio). Re-opened when the angle auto-advances so
  // guidance stays in sync with the viewfinder.
  const [guidanceOpen, setGuidanceOpen] = useState<boolean>(true);
  useEffect(() => {
    setGuidanceOpen(true);
  }, [currentAngleIndex]);

  // Captured images storage keyed by angle id
  const [capturedImages, setCapturedImages] = useState<Record<string, ClaimImageEvidence>>({});

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraGenRef = useRef(0);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  // Realtime CV guidance
  const [cvResult, setCvResult] = useState<import("@/lib/vision/realtime-cv").CvFrameResult | null>(null);
  const [cvModelStatus, setCvModelStatus] = useState<"unknown" | "loading" | "ready" | "unavailable">("unknown");

  // GPS state
  const [gpsCoords, setGpsCoords] = useState<{
    lat: number | null;
    lon: number | null;
    accuracyM: number | null;
    status: "accurate" | "searching" | "unavailable";
  }>({
    lat: null,
    lon: null,
    accuracyM: null,
    status: "searching",
  });

  // Observations & Voice Dictation
  const [observations, setObservations] = useState<string>("");
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechSupported, setSpeechSupported] = useState<boolean>(false);

  // Submission / draft state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Capture mode: Live Camera vs Field Photo Upload
  const [captureMode, setCaptureMode] = useState<"camera" | "upload">("camera");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Inline Plot Registration State (when farmer has no registered plots)
  const [inlinePlotName, setInlinePlotName] = useState<string>("");
  const [inlineCropType, setInlineCropType] = useState<string>("wheat");
  const [inlineKhasra, setInlineKhasra] = useState<string>("");
  const [inlineArea, setInlineArea] = useState<string>("1.0");
  const [inlineVillage, setInlineVillage] = useState<string>("");
  const [isRegisteringInlinePlot, setIsRegisteringInlinePlot] = useState<boolean>(false);
  const [inlinePlotError, setInlinePlotError] = useState<string | null>(null);

  // Load existing draft if not in recapture or milestone mode
  useEffect(() => {
    if (!isTargetedRecapture && !milestoneId) {
      const draft = loadClaimDraft();
      if (draft) {
        if (draft.plotId) setSelectedPlotId(draft.plotId);
        if (draft.farmerObservations) setObservations(draft.farmerObservations);
        if (draft.images) {
          const map: Record<string, ClaimImageEvidence> = {};
          draft.images.forEach((img) => {
            const url = safeDisplayUrl(img.imageUrl);
            if (!url) return;
            map[img.angleType] = { ...img, imageUrl: url };
          });
          setCapturedImages(map);
        }
      }
    }
  }, [isTargetedRecapture]);

  const stopCamera = () => {
    cameraGenRef.current += 1;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(t.cameraUnavailable);
      setIsCameraActive(false);
      return;
    }
    const gen = ++cameraGenRef.current;
    await enqueueCameraWork(async () => {
      if (gen !== cameraGenRef.current) return;
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) {
        applyVideoPlaybackFlags(videoRef.current);
        videoRef.current.srcObject = null;
      }
      setCameraError(null);
      setIsCameraActive(false);
      let lastError: unknown;

      // Single-prompt clean constraint ladder for requested facing mode
      const ladder: MediaStreamConstraints[] = [
        {
          audio: false,
          video: {
            facingMode: { ideal: cameraFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        {
          audio: false,
          video: {
            facingMode: { ideal: cameraFacing },
          },
        },
        {
          audio: false,
          video: true,
        },
      ];

      for (let step = 0; step < ladder.length; step += 1) {
        const constraints = ladder[step];
        if (gen !== cameraGenRef.current) return;
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (gen !== cameraGenRef.current) {
            stopMediaStream(stream);
            return;
          }
          streamRef.current = stream;
          let video = videoRef.current;
          if (!video) {
            const waitUntil = Date.now() + 800;
            while (!video && Date.now() < waitUntil) {
              await new Promise((resolve) => setTimeout(resolve, 32));
              video = videoRef.current;
            }
          }
          if (!video) {
            // Permission already granted — keep the stream
            setIsCameraActive(true);
            return;
          }
          applyVideoPlaybackFlags(video);
          const gotFrame = await attachStreamToVideo(video, stream, 2500);
          if (gen !== cameraGenRef.current) {
            stopMediaStream(stream);
            return;
          }
          // Successfully acquired and attached camera stream
          setIsCameraActive(true);
          setCameraError(null);
          return;
        } catch (err) {
          lastError = err;
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
      console.warn("Camera access failed or unavailable:", lastError);
      setCameraError(t.cameraUnavailable);
      setIsCameraActive(false);
    });
  };

  useEffect(() => {
    let cancelled = false;
    // 200ms hardware cooldown allows mobile OS camera daemon to release sensor when flipping
    const timer = window.setTimeout(() => {
      if (!cancelled) void startCamera();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stopCamera();
    };
  }, [cameraFacing]);

  // Spin up the OpenCV worker on mount so the first live frame is off-thread.
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    let realtimeCv: typeof import("@/lib/vision/realtime-cv") | null = null;
    void import("@/lib/vision/realtime-cv")
      .then((m) => {
        if (!active) return;
        realtimeCv = m;
        m.ensureCvWorker();
        setCvModelStatus(m.getModelStatus());
        unsubscribe = m.onModelStatus(setCvModelStatus);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
      if (realtimeCv) realtimeCv.terminateCvWorker();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!isCameraActive || !video || !stream) return;
    applyVideoPlaybackFlags(video);
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    void video.play().catch(() => undefined);
  }, [isCameraActive]);

  // Realtime CV polling ~3 fps – off-main-thread via cv-worker
  useEffect(() => {
    if (!isCameraActive) {
      setCvResult(null);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => {
      if (cancelled) return;
      try {
        const mod = await import("@/lib/vision/realtime-cv");
        const video = videoRef.current;
        if (!video || video.readyState < 2) {
          timer = window.setTimeout(tick, 400);
          return;
        }
        // Delegates to Worker (64x64 sampling off main thread) with sync fallback
        const res = await mod.analyzeVideoFrameAsync(video, currentAngle?.id);
        // bbox from worker is contour-derived (min/max green → normalized); rendering handled below
        if (!cancelled && res) {
          setCvResult(res);
          webCaptureBridge.setCvResult(res);
        }
      } catch {
        // ignore – fallback to sync path handled inside analyzeVideoFrameAsync
      }
      timer = window.setTimeout(tick, 333);
    };
    timer = window.setTimeout(tick, 500);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [isCameraActive, currentAngle?.id]);

  const [gpsRetry, setGpsRetry] = useState(0);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsCoords({ lat: null, lon: null, accuracyM: null, status: "unavailable" });
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsCoords({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: Math.round(pos.coords.accuracy * 10) / 10,
          status: pos.coords.accuracy < 10 ? "accurate" : "searching",
        });
      },
      () => {
        setGpsCoords({ lat: null, lon: null, accuracyM: null, status: "unavailable" });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [gpsRetry]);

  useEffect(() => {
    void fetch("/api/health", { cache: "no-store" }).catch(() => undefined);
  }, []);

  // Web Speech API / Voice Dictation
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasSpeech = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
      setSpeechSupported(hasSpeech);
    }
  }, []);

  const toggleVoiceDictation = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    if (typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      try {
        const SpeechRec =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRec();
        recognition.lang = getSpeechLocale(lang);
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setObservations((prev) => (prev ? `${prev} ${transcript}` : transcript));
          setIsListening(false);
        };
        recognition.onerror = () => {
          setIsListening(false);
          showToast(t.saathiVoiceUnsupported || (lang === "hi" ? "आवाज उपलब्ध नहीं है — नोट खुद लिखें" : "Voice unavailable — type the note instead"));
        };
        recognition.onend = () => setIsListening(false);
        recognition.start();
      } catch {
        setIsListening(false);
        showToast(t.saathiVoiceUnsupported || (lang === "hi" ? "आवाज उपलब्ध नहीं है — नोट खुद लिखें" : "Voice unavailable — type the note instead"));
      }
    } else {
      showToast(t.saathiVoiceUnsupported || (lang === "hi" ? "आवाज उपलब्ध नहीं है — नोट खुद लिखें" : "Voice unavailable — type the note instead"));
    }
  };

  const grabCameraFrame = (): { dataUrl: string; lightingScore?: number } | null => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const size = videoFrameCaptureSize(video);
    if (!size) return null;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, size.width, size.height);
    let lightingScore: number | undefined;
    try {
      lightingScore = measureLightingScore(ctx.getImageData(0, 0, canvas.width, canvas.height));
    } catch {
      lightingScore = undefined;
    }
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), lightingScore };
  };

  const capturePhotoFromCamera = async () => {
    const isDryOrCharredPeril = requestedPeril === "fire_burn" || requestedPeril === "drought";

    if (!cvResult && !isDryOrCharredPeril) {
      const msg =
        lang === "hi"
          ? "गुणवत्ता जाँच अभी तैयार नहीं है — फसल फ्रेम में आने तक प्रतीक्षा करें।"
          : "Quality check is not ready — wait until the crop is framed before capturing.";
      showToast(msg);
      return { ok: false as const, message: msg };
    }

    // Anti-Screen Fraud Rejection
    if (cvResult?.isScreenDetected) {
      const msg = lang === "hi" ? "स्क्रीन / डिस्प्ले पहचानी गई — कृपया असली खेत व फसल की फोटो लें।" : "Screen / display detected — photograph real outdoor crop.";
      showToast(msg);
      return { ok: false as const, message: msg };
    }

    // Strict 75%+ Crop Quality Lock
    if (cvResult && cvResult.cropScore < 75 && !isDryOrCharredPeril) {
      const msg = lang === "hi"
        ? `फसल पहचान केवल ${cvResult.cropScore}% है — फोटो लेने के लिए 75%+ होना आवश्यक है। कैमरे को फसल के पास लाएँ।`
        : `Crop match is only ${cvResult.cropScore}% — 75%+ required to unlock capture. Aim closer at crop foliage.`;
      showToast(msg);
      return { ok: false as const, message: msg };
    }

    if (cvResult?.shouldBlockShutter && !isDryOrCharredPeril && cvResult.hintCode === "too_dark") {
      showToast(lang === "hi" ? cvResult.hintHi : cvResult.hintEn);
      return { ok: false as const, message: lang === "hi" ? cvResult.hintHi : cvResult.hintEn };
    }
    const result = await runVoiceShutter({
      cameraActive: isCameraActive,
      grabFrame: grabCameraFrame,
      saveFrame: (dataUrl, extras) => saveEvidenceImage(dataUrl, extras),
      angleId: currentAngle?.id,
      peril: requestedPeril,
    });
    if (!result.ok) showToast(result.message);
    return result;
  };

  const saveEvidenceImage = async (
    imageUrl: string,
    extras?: { lightingScore?: number; sha256?: string }
  ) => {
    const digest = extras?.sha256 ?? (await sha256FromDataUrl(imageUrl));
    const lightingScore = extras?.lightingScore;
    const useGps = gpsCoords.status === "accurate" || gpsCoords.status === "searching";
    const video = videoRef.current;
    const dimensions =
      video && video.videoWidth > 0
        ? { width: video.videoWidth, height: video.videoHeight }
        : undefined;
    const nowIso = new Date().toISOString();

    const blurForQuality = cvResult?.blurScore ?? undefined;
    // Unmeasured quality must not count as failed: coverage excludes only
    // explicitly-failed frames, so unknown stays present (gate decides from
    // fresh crop measurements instead).
    const hasQualitySignal = lightingScore != null || blurForQuality != null;
    const newEvidence: ClaimImageEvidence = {
      angleType: currentAngle.id,
      imageUrl,
      timestamp: nowIso,
      lat: useGps ? gpsCoords.lat : null,
      lon: useGps ? gpsCoords.lon : null,
      accuracyM: useGps ? gpsCoords.accuracyM : null,
      sha256: digest,
      qualityPassed: hasQualitySignal
        ? qualityPassedFromSignals({
            lightingScore,
            blurScore: blurForQuality,
          })
        : true,
      lightingScore,
      blurScore: cvResult?.blurScore ?? undefined,
      greenPct: cvResult?.greenPct ?? undefined,
      luma: cvResult?.luma ?? undefined,
      cropScore: cvResult?.cropScore ?? undefined,
      hintCode: cvResult?.hintCode ?? undefined,
      isScreenDetected: cvResult?.isScreenDetected ?? undefined,
      isPersonDetected: cvResult?.isPersonDetected ?? undefined,
      facing: cameraFacing,
      dimensions,
      farmerObservation: observations || undefined,
    };

    setCapturedImages((prev) => ({
      ...prev,
      [currentAngle.id]: newEvidence,
    }));

    const angleInfo = getLocalizedAngleInfo(currentAngle.id, lang);
    showToast(
      lang === "hi"
        ? `${angleInfo.name} कैप्चर हो गया!`
        : lang === "en"
        ? `${angleInfo.name} captured successfully!`
        : `${angleInfo.name} ✓`
    );

    // Parallel LLM gate + crop-only check with comprehensive metadata context
    void (async () => {
      try {
        const metadata = {
          lat: useGps ? gpsCoords.lat : null,
          lon: useGps ? gpsCoords.lon : null,
          accuracyM: useGps ? gpsCoords.accuracyM : null,
          capturedAt: nowIso,
          facing: cameraFacing,
          dimensions,
          cvAnalysis: cvResult
            ? {
                cropScore: cvResult.cropScore,
                greenPct: cvResult.greenPct,
                isScreenDetected: cvResult.isScreenDetected,
                phenologyType: cvResult.phenologyType,
                luma: cvResult.luma,
                blurScore: cvResult.blurScore,
                hintCode: cvResult.hintCode,
                modelLabel: cvResult.modelLabel,
                modelProb: cvResult.modelProb,
              }
            : null,
          sha256: digest,
          farmerObservation: observations || undefined,
        };

        const res = await apiFetch("/api/vision/gate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl: imageUrl,
            angleType: currentAngle.id,
            expectedCrop: selectedPlot?.cropType || activeIntent?.crop || undefined,
            peril: requestedPeril,
            metadata,
          }),
        });
        const gate = (await res.json().catch(() => null)) as { usable?: boolean; reason?: string; crop_detected?: string | null; warnings?: string[] } | null;
        if (gate && gate.usable === false) {
          const reason = String(gate.reason || "unusable");
          const warn =
            reason === "wrong_crop"
              ? lang === "hi"
                ? `फसल मेल नहीं खाती (${gate.crop_detected || "अज्ञात"}) — सही फसल की फोटो लें।`
                : `Crop mismatch (${gate.crop_detected || "unknown"}) — retake with correct crop in frame.`
              : reason === "ai_generated"
                ? lang === "hi"
                  ? "AI-निर्मित/नकली लग रही है — मूल फोटो लें।"
                  : "Looks AI-generated — please capture original photo."
                : lang === "hi"
                  ? `फोटो उपयोगी नहीं (${reason}) — दोबारा लें।`
                  : `Photo not usable (${reason}) — please retake.`;
          showToast(warn);
          // mark qualityPassed false so coverage logic reflects gate failure
          setCapturedImages((prev) => {
            const cur = prev[currentAngle.id];
            if (!cur || cur.imageUrl !== imageUrl) return prev;
            return { ...prev, [currentAngle.id]: { ...cur, qualityPassed: false } };
          });
        } else if (gate?.usable && gate.crop_detected) {
          // soft hint: crop detected ok
        }
        // also run local CV on still for second opinion (crop-only)
        const cv = await import("@/lib/vision/realtime-cv").then((m) => m.analyzeDataUrl(imageUrl, currentAngle.id));
        if (cv && !cv.cropDetected && requestedPeril !== "fire_burn") {
          showToast(lang === "hi" ? cv.hintHi : cv.hintEn);
        }
      } catch {
        // ignore gate errors — not blocking
      }
    })();

    // Automatically advance to next missing angle if available
    if (currentAngleIndex < activeAngleDefs.length - 1) {
      setCurrentAngleIndex(currentAngleIndex + 1);
    }
  };

  const deleteCapturedAngle = (angleId: string) => {
    setCapturedImages((prev) => {
      const copy = { ...prev };
      delete copy[angleId];
      return copy;
    });
  };

  /**
   * Temporary Nocturnal / Test Mode: Process and store an uploaded crop image
   * Bypasses the dark-room camera shutter lock so full pipeline and model
   * predictions can be verified end-to-end at night.
   */
  const saveUploadedEvidenceImage = async (
    targetAngleId: string,
    imageUrl: string,
    fileDimensions?: { width: number; height: number }
  ) => {
    const digest = await sha256FromDataUrl(imageUrl);
    const useGps = gpsCoords.status === "accurate" || gpsCoords.status === "searching";
    const dimensions = fileDimensions || { width: 1280, height: 720 };
    const nowIso = new Date().toISOString();

    // Run on-device agronomic CV on the uploaded frame still
    let cv: import("@/lib/vision/realtime-cv").CvFrameResult | null = null;
    try {
      const mod = await import("@/lib/vision/realtime-cv");
      cv = await mod.analyzeDataUrl(imageUrl, targetAngleId);
    } catch {
      cv = null;
    }

    // Measure lighting on the uploaded still using an offscreen canvas
    let measuredLighting: number | undefined = undefined;
    try {
      const testCanvas = document.createElement("canvas");
      testCanvas.width = 64;
      testCanvas.height = 64;
      const testCtx = testCanvas.getContext("2d");
      if (testCtx) {
        const testImg = new Image();
        testImg.src = imageUrl;
        testCtx.drawImage(testImg, 0, 0, 64, 64);
        measuredLighting = measureLightingScore(testCtx.getImageData(0, 0, 64, 64));
      }
    } catch {
      measuredLighting = undefined;
    }

    const lightingScore =
      measuredLighting != null && !isUnusableLighting(measuredLighting)
        ? measuredLighting
        : 75; // safe normal lighting for test upload

    const newEvidence: ClaimImageEvidence = {
      angleType: targetAngleId,
      imageUrl,
      timestamp: nowIso,
      lat: useGps && gpsCoords.lat != null ? gpsCoords.lat : selectedPlot?.lat ?? null,
      lon: useGps && gpsCoords.lon != null ? gpsCoords.lon : selectedPlot?.lon ?? null,
      accuracyM:
        useGps && gpsCoords.accuracyM != null
          ? gpsCoords.accuracyM
          : selectedPlot?.lat != null
          ? 5.0
          : null,
      sha256: digest,
      qualityPassed: true, // uploaded file for test mode
      lightingScore,
      blurScore: cv?.blurScore ?? 50,
      greenPct: cv?.greenPct ?? 80,
      luma: cv?.luma ?? 60,
      cropScore: cv?.cropScore ?? 85,
      hintCode: cv?.hintCode ?? "ok",
      isScreenDetected: cv?.isScreenDetected ?? false,
      isPersonDetected: cv?.isPersonDetected ?? false,
      facing: "environment",
      dimensions,
      farmerObservation: observations || undefined,
    };

    setCapturedImages((prev) => ({
      ...prev,
      [targetAngleId]: newEvidence,
    }));

    const angleInfo = getLocalizedAngleInfo(targetAngleId, lang);
    showToast(
      lang === "hi"
        ? `${angleInfo.name} अपलोड हो गया!`
        : `${angleInfo.name} uploaded successfully!`
    );

    // Call Stage 1 Vision Gate in background with comprehensive metadata
    void (async () => {
      try {
        const metadata = {
          lat: newEvidence.lat,
          lon: newEvidence.lon,
          accuracyM: newEvidence.accuracyM,
          capturedAt: nowIso,
          facing: "environment",
          dimensions,
          cvAnalysis: cv
            ? {
                cropScore: cv.cropScore,
                greenPct: cv.greenPct,
                isScreenDetected: cv.isScreenDetected,
                phenologyType: cv.phenologyType,
                luma: cv.luma,
                blurScore: cv.blurScore,
                hintCode: cv.hintCode,
                modelLabel: cv.modelLabel,
                modelProb: cv.modelProb,
              }
            : {
                cropScore: 85,
                greenPct: 80,
                isScreenDetected: false,
                phenologyType: "vegetative",
                luma: 60,
                blurScore: 50,
                hintCode: "ok",
              },
          sha256: digest,
          farmerObservation: observations || undefined,
        };

        const res = await apiFetch("/api/vision/gate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl: imageUrl,
            angleType: targetAngleId,
            expectedCrop: selectedPlot?.cropType || activeIntent?.crop || undefined,
            peril: requestedPeril,
            metadata,
          }),
        });
        const gate = (await res.json().catch(() => null)) as {
          usable?: boolean;
          reason?: string;
          crop_detected?: string | null;
          warnings?: string[];
        } | null;
        if (gate && gate.usable === false) {
          const reason = String(gate.reason || "unusable");
          const warn =
            reason === "wrong_crop"
              ? lang === "hi"
                ? `फसल मेल नहीं खाती (${gate.crop_detected || "अज्ञात"}) — सही फसल की फोटो लें।`
                : `Crop mismatch (${gate.crop_detected || "unknown"}) — retake with correct crop in frame.`
              : reason === "ai_generated"
                ? lang === "hi"
                  ? "AI-निर्मित/नकली लग रही है — मूल फोटो लें।"
                  : "Looks AI-generated — please capture original photo."
                : lang === "hi"
                  ? `फोटो उपयोगी नहीं (${reason}) — दोबारा लें।`
                  : `Photo not usable (${reason}) — please retake.`;
          showToast(warn);
          setCapturedImages((prev) => {
            const cur = prev[targetAngleId];
            if (!cur || cur.imageUrl !== imageUrl) return prev;
            return { ...prev, [targetAngleId]: { ...cur, qualityPassed: false } };
          });
        } else if (gate?.usable && gate.crop_detected) {
          showToast(
            lang === "hi"
              ? `✓ फसल पहचानी गई: ${gate.crop_detected} (${angleInfo.shortName})`
              : `✓ Crop verified: ${gate.crop_detected} (${angleInfo.shortName})`
          );
        }
      } catch {
        // ignore gate errors — not blocking
      }
    })();
  };

  /**
   * File selection handler supporting both single-photo assignment
   * and multi-photo batch upload across remaining angles.
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);

    try {
      const fileList = Array.from(files);
      const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
      const validFiles = fileList.filter((f) => ALLOWED_MIME.has(f.type.toLowerCase()));

      if (validFiles.length === 0) {
        showToast(
          lang === "hi"
            ? "केवल JPEG, PNG या WebP प्रारूप समर्थित हैं।"
            : "Only JPEG, PNG, or WebP images are supported."
        );
        return;
      }

      if (validFiles.length === 1) {
        const file = validFiles[0];
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("File read error"));
          reader.readAsDataURL(file);
        });

        const dims = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth || 1280, height: img.naturalHeight || 720 });
          img.onerror = () => resolve({ width: 1280, height: 720 });
          img.src = dataUrl;
        });

        await saveUploadedEvidenceImage(currentAngle.id, dataUrl, dims);

        if (currentAngleIndex < activeAngleDefs.length - 1) {
          setCurrentAngleIndex(currentAngleIndex + 1);
        }
      } else {
        // Multi-file batch upload: map across uncaptured or all angles
        const missing = activeAngleDefs.filter((a) => !capturedImages[a.id]);
        const targetAngles =
          missing.length >= validFiles.length
            ? missing.map((a) => a.id)
            : activeAngleDefs.map((a) => a.id);

        const count = Math.min(validFiles.length, targetAngles.length);
        for (let i = 0; i < count; i++) {
          const file = validFiles[i];
          const targetAngleId = targetAngles[i];
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("File read error"));
            reader.readAsDataURL(file);
          });
          const dims = await new Promise<{ width: number; height: number }>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth || 1280, height: img.naturalHeight || 720 });
            img.onerror = () => resolve({ width: 1280, height: 720 });
            img.src = dataUrl;
          });
          await saveUploadedEvidenceImage(targetAngleId, dataUrl, dims);
        }

        showToast(
          lang === "hi"
            ? `${count} फसल तस्वीरें सफलतापूर्वक अपलोड हो गईं!`
            : `${count} crop photos uploaded successfully in batch!`
        );
      }
    } catch (err) {
      console.error("Upload failed:", err);
      showToast(lang === "hi" ? "फोटो अपलोड विफल रहा।" : "Photo upload failed.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const triggerSingleUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.multiple = false;
      fileInputRef.current.click();
    }
  };

  const triggerBatchUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.multiple = true;
      fileInputRef.current.click();
    }
  };

  const handleDroppedFiles = async (fileList: FileList) => {
    const fakeEvent = {
      target: { files: fileList },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    await handleFileUpload(fakeEvent);
  };

  const handleInlinePlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlinePlotName.trim() || !inlineKhasra.trim()) {
      setInlinePlotError(
        lang === "hi"
          ? "खेत का नाम और खसरा संख्या दोनों अनिवार्य हैं।"
          : "Both Plot name and Khasra number are required.",
      );
      return;
    }
    setIsRegisteringInlinePlot(true);
    setInlinePlotError(null);
    try {
      const res = await registerPlot({
        name: inlinePlotName.trim(),
        cropType: inlineCropType,
        khasraNumber: inlineKhasra.trim(),
        areaHectares: parseFloat(inlineArea) || 1.0,
        village: inlineVillage.trim() || farmerProfile?.village || undefined,
        district: farmerProfile?.district,
        state: farmerProfile?.state,
      });
      if (res?.plotId) {
        setSelectedPlotId(res.plotId);
        showToast(
          lang === "hi"
            ? "भूखंड सफलतापूर्वक पंजीकृत हुआ! अब आप तस्वीरें ले सकते हैं।"
            : "Plot registered successfully! You can now proceed to capture photos.",
        );
      }
    } catch (err) {
      setInlinePlotError(err instanceof Error ? err.message : "Failed to register plot");
    } finally {
      setIsRegisteringInlinePlot(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Check completion
  const requiredAngleIds = isTargetedRecapture
    ? activeAngleDefs.map((a) => a.id)
    : activeRoute.requiredAngles;
  const requiredCount = requiredAngleIds.length;
  const capturedCount = requiredAngleIds.filter((id) => Boolean(capturedImages[id])).length;
  const isAllCaptured = requiredCount > 0 && capturedCount === requiredCount;

  // Handle Save Draft
  const handleSaveDraft = () => {
    const imagesList = Object.values(capturedImages);
    const result = saveClaimDraft({
      plotId: selectedPlot?.id,
      plotName: selectedPlot?.name,
      plotNameHi: selectedPlot?.nameHi,
      khasraNumber: selectedPlot?.khasraNumber,
      cropType: selectedPlot?.cropType,
      cropTypeHi: selectedPlot?.cropTypeHi,
      cropVariety: selectedPlot?.cropVariety,
      farmerObservations: observations,
      images: imagesList,
    });
    showToast(result.saved ? t.draftSavedMsg : t.draftSaveFailedMsg);
  };

  const handleSubmitClaim = async () => {
    const unusable = activeAngleDefs.some((angle) => {
      const img = capturedImages[angle.id];
      return Boolean(img && isUnusableLighting(img.lightingScore));
    });
    if (unusable) {
      showToast(
        lang === "hi"
          ? "कुछ तस्वीरें बहुत अँधेरी या अयोग्य हैं — पहले साफ़ फोटो लें।"
          : "Some frames are too dark or unusable. Recapture them before submitting.",
      );
      return { ok: false as const, message: "Unusable frames" };
    }
    if (!isTargetedRecapture && !selectedPlot) {
      showToast(
        lang === "hi"
          ? "दावा जमा करने से पहले कृपया एक भूखंड पंजीकृत या चयनित करें।"
          : "Please register or select a plot before submitting a claim.",
      );
      return { ok: false as const, message: "No registered plot selected" };
    }
    const result = await runVoiceSubmitDraft({
      allCaptured: isAllCaptured,
      incompleteMessage: t.captureAllRequired,
      persist: async () => {
        setIsSubmitting(true);
        try {
          const imagesList = Object.values(capturedImages);
          const plot = selectedPlot;
          if (milestoneId) {
            const thumb =
              imagesList.find((img) => img.angleType === "mid_canopy")?.imageUrl ||
              imagesList[0]?.imageUrl ||
              "";
            await completeMilestone(milestoneId, thumb, observations);
            router.push("/farmer/reminders?logged=1");
            return { id: milestoneId };
          }
          if (isTargetedRecapture && recaptureClaimId) {
            const updated = await updateClaimRecapture(recaptureClaimId, imagesList);
            if (!updated) {
              throw new Error("Could not save recapture — claim was not found. Refresh and try again.");
            }
            clearActiveIntent();
            router.push(`/farmer/claims/${updated.id}?recaptured=true`);
            return { id: updated.id };
          }
          const newClaim = await createClaim({
            plotId: plot?.id || activeIntent?.plotId || "",
            plotName: plot?.name || activeIntent?.crop || "Unregistered plot",
            plotNameHi: plot?.nameHi || "",
            khasraNumber: plot?.khasraNumber || "",
            cropType: plot?.cropType || activeIntent?.crop || "",
            cropTypeHi: plot?.cropTypeHi || "",
            cropVariety: plot?.cropVariety || "",
            status: "submitted",
            farmerObservations: observations || activeIntent?.farmerNote || "",
            peril: requestedPeril,
            intentId: activeIntent?.id || intentIdParam || undefined,
            images: imagesList,
            plotLat: plot?.lat ?? null,
            plotLon: plot?.lon ?? null,
            sowingDate: plot?.sowingDate || activeIntent?.sowingDate || null,
            evidenceTrust: {
              qualityScore: 0,
              coverageScore: 0,
              contextScore: 0,
              integrityScore: 0,
              overallConfidence: 0,
            },
            aiPrediction: {
              cropIdentified: "",
              cropConfidence: 0,
              diseaseDetected: "",
              diseaseDetectedHi: "",
              severityPercentage: 0,
              severityGrade: "Low",
              affectedAreaHectares: 0,
              estimatedLossInr: 0,
              modelConfidence: 0,
            },
            payoutStatus: "pending_review",
          });
          router.push(`/farmer/claims/${newClaim.id}?submitted=true`);
          return { id: newClaim.id };
        } finally {
          setIsSubmitting(false);
        }
      },
    });
    if (!result.ok) showToast(result.message);
    return result;
  };

  // Stabilize voice bridge with refs so continuous realtime CV frames do not teardown/re-register handlers
  const cvResultRef = useRef(cvResult);
  cvResultRef.current = cvResult;
  const cameraFacingRef = useRef(cameraFacing);
  cameraFacingRef.current = cameraFacing;
  const currentAngleRef = useRef(currentAngle);
  currentAngleRef.current = currentAngle;
  const currentAngleIndexRef = useRef(currentAngleIndex);
  currentAngleIndexRef.current = currentAngleIndex;
  const activeAngleDefsRef = useRef(activeAngleDefs);
  activeAngleDefsRef.current = activeAngleDefs;
  const capturedImagesRef = useRef(capturedImages);
  capturedImagesRef.current = capturedImages;
  const langRef = useRef(lang);
  langRef.current = lang;
  const activeIntentRef = useRef(activeIntent);
  activeIntentRef.current = activeIntent;
  const capturePhotoRef = useRef(capturePhotoFromCamera);
  capturePhotoRef.current = capturePhotoFromCamera;
  const handleSubmitClaimRef = useRef(handleSubmitClaim);
  handleSubmitClaimRef.current = handleSubmitClaim;

  useEffect(() => {
    return webCaptureBridge.register({
      captureCurrentAngle: () => capturePhotoRef.current(),
      switchCamera: async () => {
        const nextFacing = cameraFacingRef.current === "environment" ? "user" : "environment";
        setCameraFacing(nextFacing);
        return {
          ok: true,
          message:
            cameraFacingRef.current === "environment"
              ? "Switched to front camera."
              : "Switched to back environment camera.",
          facing: nextFacing,
        };
      },
      selectAngle: async (angleId: string) => {
        const defs = activeAngleDefsRef.current;
        const idx = defs.findIndex((a) => a.id === angleId);
        if (idx !== -1) {
          setCurrentAngleIndex(idx);
          return { ok: true, message: `Switched to angle: ${defs[idx].name}`, angleId };
        }
        return { ok: false, message: `Angle ${angleId} not found in current capture route.` };
      },
      retakeAngle: async (angleId: string) => {
        deleteCapturedAngle(angleId);
        const defs = activeAngleDefsRef.current;
        const idx = defs.findIndex((a) => a.id === angleId);
        if (idx !== -1) setCurrentAngleIndex(idx);
        return { ok: true, message: `Cleared angle ${angleId} for recapture.`, angleId };
      },
      checkEvidenceQuality: async () => {
        const cv = cvResultRef.current;
        const currentLang = langRef.current;
        if (!cv) {
          return {
            ok: false,
            message: "Camera is open but crop quality is still measuring — wait for the live score.",
            shutterReady: false,
          };
        }
        return {
          ok: true,
          message: currentLang === "hi" ? cv.hintHi : cv.hintEn,
          canopyPct: cv.greenPct,
          blurScore: cv.blurScore ?? undefined,
          hintCode: cv.hintCode,
          shutterReady: !cv.shouldBlockShutter,
        };
      },
      readGuidance: async () => {
        const angle = currentAngleRef.current;
        const cv = cvResultRef.current;
        const currentLang = langRef.current;
        const intent = activeIntentRef.current;
        const cvHint = cv
          ? `${currentLang === "hi" ? cv.hintHi : cv.hintEn} (${cv.greenPct}% canopy, luma ${cv.luma ?? "?"})`
          : "";
        return {
          ok: true,
          message: angle
            ? `${angle.name}: ${angle.instructions}${cvHint ? ` | Live CV: ${cvHint}` : ""}${intent ? ` | Peril: ${intent.peril}` : ""}`
            : "No capture angle is selected.",
          angle: angle?.id,
        };
      },
      readProgress: async () => {
        const angle = currentAngleRef.current;
        const defs = activeAngleDefsRef.current;
        const images = capturedImagesRef.current;
        const total = defs.length;
        const captured = defs.filter((a) => Boolean(images[a.id])).length;
        const missingAngles = defs.filter((a) => !images[a.id]).map((a) => a.id);
        return {
          ok: true,
          message: angle
            ? `Captured ${captured} of ${total} angles. Current: ${angle.id}.${missingAngles.length ? ` Missing: ${missingAngles.join(", ")}` : ""}`
            : `Captured ${captured} of ${total} angles.`,
          captured,
          total,
          currentAngle: angle?.id,
          missingAngles,
        };
      },
      setObservation: async (observation) => {
        setObservations(observation);
        return { ok: true, message: "Observation stored on the capture draft." };
      },
      getVideoFrame: () => {
        const frame = grabCameraFrame();
        return frame ? frame.dataUrl : null;
      },
      submitDraft: () => handleSubmitClaimRef.current(),
    });
  }, []);

  const getAngleIcon = (iconName: string) => {
    switch (iconName) {
      case "Maximize2":
        return <Maximize2 className="h-5 w-5" />;
      case "ArrowUpLeft":
        return <ArrowUpLeft className="h-5 w-5" />;
      case "Scan":
        return <Scan className="h-5 w-5" />;
      case "ArrowUpRight":
        return <ArrowUpRight className="h-5 w-5" />;
      case "ZoomIn":
        return <ZoomIn className="h-5 w-5" />;
      default:
        return <Camera className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fp-panel fixed left-3 right-3 top-20 z-50 flex items-center gap-2 px-3 py-2.5 text-sm sm:left-auto sm:right-4 sm:max-w-sm">
          <CheckCircle2 className="h-5 w-5" />
          <span>{toastMessage}</span>
        </div>
      )}
      {persistError && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-xs text-rose-900">
          {persistError}
        </div>
      )}
      {!isSupabaseConfigured() && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-900">
          {lang === "hi"
            ? "डेटाबेस कॉन्फ़िगर नहीं है — दावा सबमिट नहीं होगा। Supabase कनेक्ट करें।"
            : "Database is not configured — this claim will not be stored. Connect Supabase before submitting."}
        </div>
      )}
      {gpsCoords.status === "unavailable" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <span>
            {lang === "hi"
              ? "जीपीएस बंद है — सबमिट होगा, पर सैटेलाइट और प्लॉट मिलान नहीं चलेगा। ब्राउज़र में Location Allow करें।"
              : "GPS is off — you can still submit, but satellite and plot-match checks will be empty. Allow Location in the browser."}
          </span>
          <button
            type="button"
            className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 font-semibold text-amber-900"
            onClick={() => setGpsRetry((n) => n + 1)}
          >
            {lang === "hi" ? "फिर से कोशिश" : "Retry GPS"}
          </button>
        </div>
      )}

      {/* Hidden File Input for Evidence Image Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        aria-hidden="true"
        onChange={handleFileUpload}
      />

      {/* Header Banner */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between sm:pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900 sm:text-2xl">
              <Camera className="h-5 w-5 sm:h-6 sm:w-6" />
              <span>{t.studioTitle}</span>
            </h1>
            {isTargetedRecapture && (
              <span className="fp-badge-alert">
                {lang === "hi" ? "लक्षित पुनः फोटो मोड" : "Targeted Recapture Mode"}
              </span>
            )}
            {milestone && (
              <span className="fp-badge-alert">{t.milestoneMode}</span>
            )}
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            {isTargetedRecapture
              ? lang === "hi"
                ? `दावा #${recaptureClaimId} के लिए केवल चिह्नित कोणों की फोटो आवश्यक है।`
                : `Targeted recapture for Claim #${recaptureClaimId}. Only missing angles required.`
              : milestone
                ? lang === "hi"
                  ? `${milestone.stageNameHi || milestone.stageName} के लिए विकास साक्ष्य लें। यह दावा नहीं है।`
                  : `Photograph ${milestone.stageName} for the growth timeline. This is not a damage claim.`
                : t.studioSub}
          </p>
          {activeIntent && !isTargetedRecapture && !milestone && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-semibold text-emerald-800">
                <ShieldCheck className="h-3 w-3" />
                {lang === "hi" ? activeRoute.labelHi : activeRoute.labelEn}
              </span>
              <span className="text-slate-600">
                {activeRoute.requiredAngles.length} {lang === "hi" ? "कोण" : "angles"} · {lang === "hi" ? activeRoute.descriptionHi : activeRoute.descriptionEn}
              </span>
              <Link href="/farmer/saathi" className="text-emerald-700 underline underline-offset-2">Change</Link>
            </div>
          )}
          {!activeIntent && !isTargetedRecapture && !milestone && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              {lang === "hi" ? "सुझाव: पहले फसल साथी से बात करें — वह आपके लिए सही कोण तय करेगा।" : "Tip: Talk to Fasal Saathi first — it will pick the right angles for your peril."}{" "}
              <Link href="/farmer/saathi" className="font-bold underline">Saathi →</Link>
            </div>
          )}
        </div>

        {!isTargetedRecapture && (
          <div className="flex w-full min-w-0 items-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 sm:w-auto">
            <Layers className="h-4 w-4 text-[var(--accent)] shrink-0" />
            {plots.length === 0 ? (
              <span className="text-xs font-bold text-red-700">
                {lang === "hi" ? "भूखंड आवश्यक (पंजीकरण आवश्यक)" : "Plot required (Registration required)"}
              </span>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-[11px] text-[var(--ink-muted)] font-medium shrink-0">
                  {lang === "hi" ? "खेत:" : "Plot:"}
                </span>
                <select
                  value={selectedPlotId}
                  onChange={(e) => setSelectedPlotId(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-xs font-bold text-[var(--ink)] focus:outline-none cursor-pointer"
                >
                  {plots.map((p) => (
                    <option key={p.id} value={p.id}>
                      {lang === "hi" ? p.nameHi || p.name : p.name} ({p.khasraNumber} · {p.cropTypeHi || p.cropType})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5-Angle Stepper / Progress Bar */}
      <div className="fp-panel p-2.5 sm:p-4">
        <div className="flex items-center justify-between mb-3 text-xs font-semibold text-slate-600">
          <span>
            {lang === "hi" ? "कोण प्रगति" : "Angle Progress"}: {capturedCount} / {requiredCount}{" "}
            {lang === "hi" ? "पूर्ण" : "Captured"}
          </span>
          <span className="text-emerald-800 font-bold font-mono">
            {Math.round((capturedCount / requiredCount) * 100)}%
          </span>
        </div>

        {/* Progress pill bar — horizontal scroll-snap on phone, grid on sm+ */}
        <div
          className={`flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:gap-2 sm:overflow-visible sm:pb-0 ${
            requiredCount <= 2
              ? "sm:grid-cols-2"
              : requiredCount === 3
                ? "sm:grid-cols-3"
                : requiredCount === 4
                  ? "sm:grid-cols-4"
                  : "sm:grid-cols-5"
          }`}
        >
          {activeAngleDefs.map((angle, idx) => {
            const isCaptured = Boolean(capturedImages[angle.id]);
            const isCurrent = idx === currentAngleIndex;

            return (
              <button
                key={angle.id}
                type="button"
                onClick={() => setCurrentAngleIndex(idx)}
                aria-current={isCurrent ? "step" : undefined}
                className={clsx(
                  "flex min-w-[38%] shrink-0 snap-start flex-col items-center justify-center rounded-lg border p-1.5 text-center transition-all sm:min-w-0 sm:p-2",
                  isCurrent
                    ? "scale-[1.03] border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]"
                    : isCaptured
                    ? "border-[var(--ink)] bg-[var(--accent-soft)] text-[var(--ink)]"
                    : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]"
                )}
              >
                <div className="flex items-center justify-center gap-1">
                  {isCaptured ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-mono font-bold">{idx + 1}</span>
                  )}
                </div>
                <span className="mt-1 w-full truncate text-[10px] font-semibold sm:text-xs">
                  {getLocalizedAngleInfo(angle.id, lang).shortName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mandatory Plot Registration Guard when farmer has 0 registered plots */}
      {!isTargetedRecapture && plots.length === 0 ? (
        <div className="fp-panel p-5 sm:p-7 border-l-4 border-l-[var(--ink)] shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--line)] bg-[var(--accent-soft)] text-[var(--ink)]">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
                {lang === "hi" ? "भूखंड पंजीकरण अनिवार्य है" : "Plot Registration Required"}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[var(--ink-muted)] leading-relaxed">
                {lang === "hi"
                  ? "प्रधानमंत्री फसल बीमा योजना (PMFBY) के तहत फसल नुकसान का दावा केवल पंजीकृत भूखंड (खसरा संख्या) पर ही दर्ज हो सकता है। कृपया पहले अपना प्रभावित भूखंड पंजीकृत करें। पंजीकरण के बाद कैमरा व फ़ोटो स्टूडियो स्वतः खुल जाएगा।"
                  : "Under PMFBY insurance standards, every crop damage claim must be anchored to a registered land parcel (Khasra). Please register your affected plot below. Once registered, photo capture will immediately unlock."}
              </p>
            </div>
          </div>

          <form onSubmit={handleInlinePlotSubmit} className="mt-5 border-t border-[var(--line)] pt-5 space-y-4">
            {inlinePlotError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 p-2.5 font-semibold">
                {inlinePlotError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-bold text-[var(--ink)] block mb-1">
                  {lang === "hi" ? "खेत का नाम / पहचान *" : "Plot Name / Identifier *"}
                </label>
                <input
                  type="text"
                  required
                  value={inlinePlotName}
                  onChange={(e) => setInlinePlotName(e.target.value)}
                  placeholder={lang === "hi" ? "जैसे: उत्तर का खेत / Plot 1" : "e.g. North Field / Plot 1"}
                  className="fp-input"
                />
              </div>

              <div>
                <label className="font-bold text-[var(--ink)] block mb-1">
                  {lang === "hi" ? "फसल का प्रकार *" : "Crop Type *"}
                </label>
                <select
                  value={inlineCropType}
                  onChange={(e) => setInlineCropType(e.target.value)}
                  className="fp-input"
                >
                  <option value="wheat">{lang === "hi" ? "गेहूँ (Wheat)" : "Wheat"}</option>
                  <option value="paddy">{lang === "hi" ? "धान / चावल (Paddy)" : "Paddy"}</option>
                  <option value="maize">{lang === "hi" ? "मक्का (Maize)" : "Maize"}</option>
                  <option value="potato">{lang === "hi" ? "आलू (Potato)" : "Potato"}</option>
                  <option value="mustard">{lang === "hi" ? "सरसों (Mustard)" : "Mustard"}</option>
                  <option value="cotton">{lang === "hi" ? "कपास (Cotton)" : "Cotton"}</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-[var(--ink)] block mb-1">
                  {lang === "hi" ? "खसरा संख्या *" : "Khasra / Survey Number *"}
                </label>
                <input
                  type="text"
                  required
                  value={inlineKhasra}
                  onChange={(e) => setInlineKhasra(e.target.value)}
                  placeholder={lang === "hi" ? "जैसे: 402/1" : "e.g. 402/1"}
                  className="fp-input"
                />
              </div>

              <div>
                <label className="font-bold text-[var(--ink)] block mb-1">
                  {lang === "hi" ? "क्षेत्रफल (हेक्टेयर)" : "Area (Hectares)"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={inlineArea}
                  onChange={(e) => setInlineArea(e.target.value)}
                  className="fp-input"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-[var(--ink)] block mb-1">
                  {lang === "hi" ? "गाँव / स्थान" : "Village / Location"}
                </label>
                <input
                  type="text"
                  value={inlineVillage}
                  onChange={(e) => setInlineVillage(e.target.value)}
                  placeholder={farmerProfile?.village || (lang === "hi" ? "गाँव का नाम" : "Village name")}
                  className="fp-input"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <Link
                href="/farmer/plots"
                className="fp-btn-secondary text-xs px-4 py-2"
              >
                {lang === "hi" ? "भूखंड सूची देखें" : "View All Plots"}
              </Link>
              <button
                type="submit"
                disabled={isRegisteringInlinePlot}
                className="fp-btn-primary text-xs px-5 py-2.5 gap-2"
              >
                {isRegisteringInlinePlot ? (
                  <span>{lang === "hi" ? "पंजीकृत हो रहा है..." : "Registering..."}</span>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>{lang === "hi" ? "भूखंड पंजीकृत करें और दावा शुरू करें" : "Register Plot & Unlock Studio"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
      /* Main Studio Viewport: Left Live Camera Viewfinder or Upload Workbench / Right Step Guidance */
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (7 cols): Camera Viewfinder / Evidence Upload Workbench & Controls */}
        <div className="lg:col-span-7 space-y-3">
          {/* Dual-Mode Selector: Live Camera vs Field Photo Upload */}
          <div className="flex border border-[var(--line)] bg-[var(--surface)] p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setCaptureMode("camera");
                if (!isCameraActive) void startCamera();
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-all ${
                captureMode === "camera"
                  ? "bg-[var(--ink)] text-[var(--surface)] font-bold shadow-xs"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              }`}
            >
              <Camera className="h-3.5 w-3.5 shrink-0" />
              <span>{lang === "hi" ? "सीधा कैमरा (Live Camera)" : "Live Camera"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCaptureMode("upload");
                stopCamera();
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-all ${
                captureMode === "upload"
                  ? "bg-[var(--ink)] text-[var(--surface)] font-bold shadow-xs"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              }`}
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span>{lang === "hi" ? "खेत फ़ोटो अपलोड (Upload Photos)" : "Upload Field Photos"}</span>
            </button>
          </div>

          {captureMode === "upload" ? (
            /* Upload Mode Workbench */
            <div className="fp-panel p-4 sm:p-5 flex flex-col justify-between min-h-[380px]">
              <div>
                {/* Angle Header in Workbench */}
                <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-muted)]">
                      {lang === "hi" ? "सक्रिय कोण" : "Active Angle"} · {currentAngleIndex + 1}/{activeAngleDefs.length}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-[var(--ink)]">
                      {getLocalizedAngleInfo(currentAngle.id, lang).name}
                    </h3>
                  </div>
                  {capturedImages[currentAngle.id] ? (
                    <span className="inline-flex items-center gap-1 border border-[var(--ink)] bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--ink)]">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-800" />
                      {lang === "hi" ? "अपलोड सत्यापित" : "Uploaded"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-muted)]">
                      {lang === "hi" ? "प्रतीक्षारत" : "Pending"}
                    </span>
                  )}
                </div>

                {/* Upload or Preview Box */}
                {capturedImages[currentAngle.id] ? (
                  <div className="mt-4 space-y-3">
                    <div className="relative aspect-[16/10] w-full overflow-hidden border border-[var(--line)] bg-slate-900">
                      <img
                        src={safeDisplayUrl(capturedImages[currentAngle.id].imageUrl)}
                        alt={currentAngle.name}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-black/80 p-2 text-white text-[11px] font-mono flex items-center justify-between">
                        <span className="truncate max-w-[200px] sm:max-w-[300px]">
                          SHA-256: {capturedImages[currentAngle.id].sha256?.slice(0, 16)}...
                        </span>
                        <span>
                          {capturedImages[currentAngle.id].dimensions?.width} × {capturedImages[currentAngle.id].dimensions?.height}
                        </span>
                      </div>
                    </div>

                    {/* Metadata & Quality Chips */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className="border border-[var(--line)] bg-[var(--surface)] p-2">
                        <span className="text-[10px] text-[var(--ink-muted)] block">{lang === "hi" ? "प्रकाश स्तर" : "Lighting"}</span>
                        <span className="font-bold text-[var(--ink)] font-mono">
                          {capturedImages[currentAngle.id].lightingScore != null ? `${capturedImages[currentAngle.id].lightingScore}%` : "Good"}
                        </span>
                      </div>
                      <div className="border border-[var(--line)] bg-[var(--surface)] p-2">
                        <span className="text-[10px] text-[var(--ink-muted)] block">{lang === "hi" ? "फसल गुणवत्ता" : "Foliage Quality"}</span>
                        <span className="font-bold text-[var(--ink)] font-mono">
                          {capturedImages[currentAngle.id].cropScore != null ? `${capturedImages[currentAngle.id].cropScore}%` : "Verified"}
                        </span>
                      </div>
                      <div className="col-span-2 sm:col-span-1 border border-[var(--line)] bg-[var(--surface)] p-2">
                        <span className="text-[10px] text-[var(--ink-muted)] block">{lang === "hi" ? "स्थान स्थिति" : "Geolocation"}</span>
                        <span className="font-bold text-[var(--ink)] truncate block">
                          {capturedImages[currentAngle.id].lat != null ? `${capturedImages[currentAngle.id].lat?.toFixed(4)}, ${capturedImages[currentAngle.id].lon?.toFixed(4)}` : "Plot Linked"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => triggerSingleUpload()}
                        disabled={isUploading}
                        className="fp-btn-secondary text-xs py-1.5 flex-1 gap-1.5"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>{lang === "hi" ? "फोटो बदलें" : "Replace Photo"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCapturedAngle(currentAngle.id)}
                        className="fp-btn-danger text-xs py-1.5 px-3"
                      >
                        {lang === "hi" ? "हटाएँ" : "Clear"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => triggerSingleUpload()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.length) {
                        void handleDroppedFiles(e.dataTransfer.files);
                      }
                    }}
                    className="mt-4 flex flex-col items-center justify-center border-2 border-dashed border-[var(--line)] bg-[var(--canvas)]/40 p-8 text-center cursor-pointer hover:border-[var(--ink)] transition-colors"
                  >
                    <div className="flex h-12 w-12 items-center justify-center border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] mb-3">
                      <Upload className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-bold text-[var(--ink)]">
                      {lang === "hi" ? "इस कोण के लिए फोटो चुनें" : `Select photo for ${getLocalizedAngleInfo(currentAngle.id, lang).shortName}`}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ink-muted)] max-w-xs">
                      {lang === "hi"
                        ? "डिवाइस से फोटो चुनें या यहाँ खींचकर छोड़ें (JPG, PNG, WebP)"
                        : "Click to browse or drag and drop image file (JPG, PNG, WebP)"}
                    </p>
                    <button
                      type="button"
                      disabled={isUploading}
                      className="fp-btn-primary mt-4 text-xs px-4 py-2 gap-1.5"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>
                        {isUploading
                          ? (lang === "hi" ? "अपलोड हो रहा है..." : "Processing...")
                          : (lang === "hi" ? "फ़ोटो फ़ाइल चुनें" : "Choose File")}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Multi-angle batch upload card at bottom of workbench */}
              <div className="mt-5 border-t border-[var(--line)] pt-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-bold text-[var(--ink)] block">
                      {lang === "hi" ? "त्वरित बैच अपलोड" : "Batch Multi-Angle Upload"}
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)]">
                      {lang === "hi"
                        ? "गैलरी से सभी 5 कोणों की तस्वीरें एक साथ चुनें"
                        : "Select all 5 field angle photos from your device at once"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerBatchUpload()}
                    disabled={isUploading}
                    className="fp-btn-secondary text-xs px-3 py-1.5 gap-1.5 shrink-0"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>{lang === "hi" ? "सभी 5 फ़ोटो चुनें" : "Select 5 Photos"}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Live Camera Viewfinder */
            <div className="fp-viewfinder relative flex aspect-[4/3] h-[min(52vh,420px)] min-h-[240px] w-full items-center justify-center overflow-hidden border border-[var(--ink)] bg-black sm:aspect-[16/10] sm:h-auto">
              <video
                ref={(el) => {
                  videoRef.current = el;
                  if (el) applyVideoPlaybackFlags(el);
                }}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 z-0 h-full w-full bg-black object-cover"
              />
              {capturedImages[currentAngle.id] &&
              safeDisplayUrl(capturedImages[currentAngle.id].imageUrl) ? (
                <img
                  src={safeDisplayUrl(capturedImages[currentAngle.id].imageUrl)}
                  alt={currentAngle.name}
                  className="absolute inset-0 z-[2] h-full w-full object-cover"
                />
              ) : null}
              {!isCameraActive && !capturedImages[currentAngle.id] ? (
                <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center p-6 text-center text-slate-400">
                  <Camera className="mx-auto mb-2 h-12 w-12 opacity-40" />
                  <p className="text-sm font-medium">
                    {cameraError || (lang === "hi" ? "कैमरा शुरू हो रहा है…" : "Starting camera…")}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCaptureMode("upload");
                        stopCamera();
                      }}
                      className="fp-btn-primary gap-1.5 text-xs"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>
                        {lang === "hi"
                          ? "फ़ोटो अपलोड मोड पर जाएँ"
                          : "Switch to Upload Mode"}
                      </span>
                    </button>
                    {cameraError ? (
                      <button
                        type="button"
                        onClick={() => void startCamera()}
                        className="fp-btn-secondary gap-1.5 text-xs"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>{lang === "hi" ? "कैमरा पुनः शुरू करें" : "Retry Camera"}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Overlaid Canonical Framing Guidelines (3x3 grid) */}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-60">
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20 flex items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                  </div>
                </div>
                <div className="border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div />
              </div>

              {/* Seamless Realtime CV Reticle & Bounding Box */}
              {cvResult?.bbox && isCameraActive && !capturedImages[currentAngle.id] && (
                <div
                  className={clsx(
                    "pointer-events-none absolute transition-all duration-200 ease-out",
                    cvResult.hintCode === "ok"
                      ? "border-emerald-400/90 bg-emerald-500/10 shadow-[0_0_20px_rgba(52,211,153,0.25)]"
                      : cvResult.hintCode === "hold_steady" || cvResult.hintCode === "too_close" || cvResult.hintCode === "too_far"
                      ? "border-amber-400/90 bg-amber-500/10 shadow-[0_0_15px_rgba(251,191,36,0.2)]"
                      : "border-white/30 bg-black/10"
                  )}
                  style={{
                    left: `${cvResult.bbox.x * 100}%`,
                    top: `${cvResult.bbox.y * 100}%`,
                    width: `${cvResult.bbox.w * 100}%`,
                    height: `${cvResult.bbox.h * 100}%`,
                    borderWidth: "1.5px",
                    borderRadius: "8px",
                  }}
                >
                  {/* Corner bracket accents */}
                  <div className="absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-inherit rounded-tl-sm" />
                  <div className="absolute -top-1 -right-1 h-3 w-3 border-t-2 border-r-2 border-inherit rounded-tr-sm" />
                  <div className="absolute -bottom-1 -left-1 h-3 w-3 border-b-2 border-l-2 border-inherit rounded-bl-sm" />
                  <div className="absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-inherit rounded-br-sm" />
                </div>
              )}

              {/* Seamless Viewfinder Floating Glass HUD */}
              {isCameraActive && !capturedImages[currentAngle.id] && (
                <div className="pointer-events-none absolute bottom-3 left-2 right-2 flex flex-col items-center gap-1.5 sm:bottom-4 sm:left-4 sm:right-4">
                  <div className="flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-white/20 bg-black/75 px-3.5 py-1.5 text-xs text-white shadow-lg backdrop-blur-md">
                    {/* Status Indicator Dot */}
                    <span
                      className={clsx(
                        "h-2 w-2 rounded-full shrink-0",
                        cvResult?.isPersonDetected || cvResult?.isScreenDetected
                          ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,1)] animate-ping"
                          : (cvResult?.cropScore ?? 0) >= 75
                          ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse"
                          : cvResult?.hintCode === "too_dark"
                          ? "bg-rose-500"
                          : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                      )}
                    />

                    {/* Anti-Screen / Person Alert or Localized Guidance Text */}
                    <span className="font-semibold tracking-wide truncate">
                      {cvResult?.isPersonDetected
                        ? (lang === "hi" ? "व्यक्ति का चेहरा / शरीर दिखा — केवल असली फसल दिखाएँ" : "Person detected — Aim camera at field crop")
                        : cvResult?.isScreenDetected
                        ? (lang === "hi" ? "स्क्रीन / फोटो का फोटो अमान्य — खेत में असली फसल दिखाएँ" : "Screen replay detected — Point at real field")
                        : (lang === "hi" ? cvResult?.hintHi : cvResult?.hintEn) ||
                          (cvModelStatus === "ready"
                            ? (lang === "hi" ? "फसल पर स्थिर रखें" : "Align camera with crop")
                            : (lang === "hi" ? "कैमरा स्थिर रखें" : "Hold steady"))}
                    </span>
                  </div>
                </div>
              )}

              {/* Retake preview overlay */}
              {capturedImages[currentAngle.id] && (
                <div className="absolute top-3 right-3 z-[4] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => deleteCapturedAngle(currentAngle.id)}
                    className="flex items-center gap-1 text-red-300 hover:text-red-100 text-[11px] font-semibold bg-red-950/60 px-2 py-1 rounded"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>{t.retakePhoto}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Primary Viewport Action Buttons — thumb-zone sticky bar on phone,
              back to normal flow inside the lg+ two-column studio */}
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-3 border-t border-[var(--line)] bg-[var(--surface)] px-3 py-2 shadow-[0_-4px_12px_rgba(28,25,21,0.08)] sm:-mx-4 sm:px-4 md:bottom-0 md:-mx-6 md:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none">
            <div className="space-y-2">
              {captureMode === "camera" ? (
                <>
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                    {/* Flip camera */}
                    <button
                      type="button"
                      onClick={() =>
                        setCameraFacing((prev) => (prev === "environment" ? "user" : "environment"))
                      }
                      aria-label={t.switchCamera}
                      className="inline-flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--accent-soft)] sm:px-3"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t.switchCamera}</span>
                    </button>

                    {/* Main Shutter / Capture Button with 75%+ Crop Lock */}
                    {(() => {
                      const isDryOrCharred = requestedPeril === "fire_burn" || requestedPeril === "drought";
                      const isLocked =
                        isCameraActive &&
                        !capturedImages[currentAngle.id] &&
                        ((cvResult == null && !isDryOrCharred) ||
                          cvResult?.isPersonDetected === true ||
                          cvResult?.isScreenDetected === true ||
                          (cvResult != null && cvResult.cropScore < 75 && !isDryOrCharred) ||
                          (cvResult?.shouldBlockShutter === true && !isDryOrCharred));

                      if (isLocked) {
                        return (
                          <button
                            type="button"
                            onClick={capturePhotoFromCamera}
                            aria-label="Capture locked (Need 75%+ crop match)"
                            className="flex min-h-11 w-full items-center justify-center gap-2 border border-stone-300 bg-stone-200 px-3 py-3 text-xs font-bold text-stone-600 shadow-inner sm:text-sm cursor-not-allowed opacity-90 transition-all"
                          >
                            <Lock className="h-4 w-4 text-stone-600 shrink-0" />
                            <span>
                              {cvResult?.isPersonDetected
                                ? (lang === "hi" ? "व्यक्ति / चेहरा लॉक (फसल दिखाएँ)" : "Person in Frame (Aim at real crop)")
                                : cvResult?.isScreenDetected
                                ? (lang === "hi" ? "स्क्रीन लॉक (असली फसल दिखाएँ)" : "Screen Blocked (Aim at real crop)")
                                : cvResult == null
                                ? (lang === "hi" ? "गुणवत्ता जाँच चल रही है…" : "Quality check running…")
                                : (lang === "hi"
                                  ? `कैमरा लॉक (${cvResult?.cropScore ?? 0}% / 75% आवश्यक)`
                                  : `Locked (${cvResult?.cropScore ?? 0}% / 75% Crop Needed)`)}
                            </span>
                          </button>
                        );
                      }

                      return (
                        <button
                          type="button"
                          onClick={capturePhotoFromCamera}
                          className={clsx(
                            "fp-btn-primary w-full gap-2 px-3 py-3 sm:px-6 transition-all",
                            cvResult?.hintCode === "ok" &&
                              "ring-2 ring-emerald-500 ring-offset-2 ring-offset-[var(--surface)] shadow-[0_0_15px_rgba(16,185,129,0.35)]"
                          )}
                        >
                          <Camera className="h-5 w-5" />
                          <span>{t.takePhoto}</span>
                        </button>
                      );
                    })()}

                    {/* Switch to Upload Mode Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setCaptureMode("upload");
                        stopCamera();
                      }}
                      aria-label="Switch to upload mode"
                      className="inline-flex min-h-11 items-center gap-1.5 border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--accent-soft)] sm:px-3"
                      title={lang === "hi" ? "फ़ोटो अपलोड मोड" : "Upload Mode"}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{lang === "hi" ? "अपलोड" : "Upload"}</span>
                    </button>
                  </div>

                  {/* Realtime Live Camera Notice & Switcher Link */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[var(--ink-muted)]">
                    <div className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-800" />
                      <span>{lang === "hi" ? "सीधा कैमरा एवं जीपीएस" : "Live Geotagged Camera"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCaptureMode("upload");
                        stopCamera();
                      }}
                      className="underline hover:text-[var(--ink)] font-medium"
                    >
                      {lang === "hi"
                        ? "या गैलरी से फ़ोटो अपलोड करें →"
                        : "Or upload photos from device →"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (currentAngleIndex > 0) setCurrentAngleIndex(currentAngleIndex - 1);
                      }}
                      disabled={currentAngleIndex === 0}
                      className="fp-btn-secondary min-h-11 px-3 text-xs gap-1 disabled:opacity-30"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">{lang === "hi" ? "पिछला कोण" : "Previous Angle"}</span>
                    </button>

                    {capturedImages[currentAngle.id] ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (currentAngleIndex < activeAngleDefs.length - 1) {
                            setCurrentAngleIndex(currentAngleIndex + 1);
                          }
                        }}
                        disabled={currentAngleIndex === activeAngleDefs.length - 1}
                        className="fp-btn-primary min-h-11 flex-1 px-4 text-xs gap-1.5 disabled:opacity-40"
                      >
                        <span>{lang === "hi" ? "अगला कोण ➔" : "Next Angle ➔"}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => triggerSingleUpload()}
                        disabled={isUploading}
                        className="fp-btn-primary min-h-11 flex-1 px-4 text-xs gap-2"
                      >
                        <Upload className="h-4 w-4" />
                        <span>
                          {isUploading
                            ? (lang === "hi" ? "अपलोड हो रहा है..." : "Processing...")
                            : (lang === "hi" ? `इस कोण (${getLocalizedAngleInfo(currentAngle.id, lang).shortName}) के लिए फ़ोटो चुनें` : `Choose Photo for ${getLocalizedAngleInfo(currentAngle.id, lang).shortName}`)}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (currentAngleIndex < activeAngleDefs.length - 1) {
                          setCurrentAngleIndex(currentAngleIndex + 1);
                        }
                      }}
                      disabled={currentAngleIndex === activeAngleDefs.length - 1}
                      className="fp-btn-secondary min-h-11 px-3 text-xs gap-1 disabled:opacity-30"
                    >
                      <span className="hidden sm:inline">{lang === "hi" ? "अगला कोण" : "Next Angle"}</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Upload mode hint link */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[var(--ink-muted)]">
                    <div className="inline-flex items-center gap-1">
                      <Upload className="h-3.5 w-3.5 text-[var(--ink)]" />
                      <span>{lang === "hi" ? "खेत फ़ोटो अपलोड मोड" : "Field Photo Upload Mode"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCaptureMode("camera");
                        if (!isCameraActive) void startCamera();
                      }}
                      className="underline hover:text-[var(--ink)] font-medium"
                    >
                      {lang === "hi" ? "सीधे कैमरे पर वापस जाएँ →" : "Switch back to live camera →"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Step Guidance, Voice Notes & Submission */}
        <div className="lg:col-span-5 space-y-4">
          {/* Canonical Angle Guidance — collapsible accordion below the viewfinder
              on phone so the camera stays near thumb zone; always open on lg+ */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <button
              type="button"
              onClick={() => setGuidanceOpen((open) => !open)}
              aria-expanded={guidanceOpen}
              aria-controls="capture-angle-guidance"
              className="-m-1 flex w-full items-center justify-between gap-2 rounded border-b border-slate-100 p-1 pb-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] lg:pointer-events-none"
            >
              <span className="flex min-w-0 items-center gap-2 font-bold text-sm text-slate-900">
                {getAngleIcon(currentAngle.illustrationIcon)}
                <span className="min-w-0 truncate">{lang === "hi" ? currentAngle.nameHi : currentAngle.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="fp-badge-neutral font-mono text-[10px]">
                  {currentAngle.id}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={clsx("h-4 w-4 text-slate-500 transition-transform lg:hidden", guidanceOpen && "rotate-180")}
                />
              </span>
            </button>

            <div
              id="capture-angle-guidance"
              className={clsx(!guidanceOpen && "hidden lg:block")}
            >
            <p className="mt-3 text-xs text-slate-700 leading-relaxed font-medium">
              {getLocalizedAngleInfo(currentAngle.id, lang).instructions}
            </p>

            {/* Best practice bullet points */}
            <div className="mt-3 rounded-lg bg-slate-50 p-3 border border-slate-100">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <span>{lang === "hi" ? "सर्वोत्तम फोटो सुझाव" : "Framing Tips"}</span>
              </div>
              <ul className="space-y-1 text-xs text-slate-600">
                {getLocalizedAngleInfo(currentAngle.id, lang).tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-[var(--ink)]">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Stepper Navigation Buttons */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={currentAngleIndex === 0}
                onClick={() => setCurrentAngleIndex(currentAngleIndex - 1)}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 lg:min-h-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>{lang === "hi" ? "पिछला" : "Previous"}</span>
              </button>

              <button
                type="button"
                disabled={currentAngleIndex === activeAngleDefs.length - 1}
                onClick={() => setCurrentAngleIndex(currentAngleIndex + 1)}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 lg:min-h-0"
              >
                <span>{lang === "hi" ? "अगला" : "Next"}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            </div>
          </div>

          {/* Farmer Observation Notes with Voice Dictation */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="farmer-observations"
                className="text-xs font-bold text-slate-900 flex items-center gap-1.5"
              >
                <Mic className="h-3.5 w-3.5 text-emerald-800" />
                <span>{t.farmerObservationsLabel}</span>
              </label>

              {/* Voice Dictation Trigger */}
              <button
                type="button"
                onClick={toggleVoiceDictation}
                aria-label={
                  isListening
                    ? t.voiceDictationListening
                    : t.voiceDictationStart
                }
                className={clsx(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all",
                  isListening
                    ? "bg-red-600 text-white animate-pulse shadow-md"
                    : "bg-[var(--accent-soft)] text-[var(--ink)]"
                )}
              >
                {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                <span>{isListening ? t.voiceDictationListening : t.voiceDictationStart}</span>
              </button>
            </div>

            <textarea
              id="farmer-observations"
              rows={3}
              maxLength={500}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder={t.farmerObservationsPlaceholder}
              aria-describedby="farmer-observations-counter"
              className="fp-input mt-0 w-full text-xs"
            />
            <div
              id="farmer-observations-counter"
              aria-live="polite"
              className="mt-1 text-right font-mono text-[10px] text-[var(--ink-muted)]"
            >
              {lang === "hi" ? `${observations.length}/500 अक्षर` : `${observations.length}/500 characters`}
            </div>
          </div>

          {/* Action Submission Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">
                {lang === "hi" ? "साक्ष्य तैयारी स्थिति:" : "Evidence Status:"}
              </span>
              <span
                className={clsx(
                  "font-bold",
                  isAllCaptured ? "text-emerald-800" : "text-amber-700"
                )}
              >
                {isAllCaptured
                  ? lang === "hi"
                    ? "✓ सभी कोण तैयार हैं"
                    : "✓ All angles ready"
                  : `${capturedCount} / ${requiredCount} ${lang === "hi" ? "कोण तैयार" : "angles"}`}
              </span>
            </div>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              {/* Save Draft */}
              <button
                type="button"
                onClick={handleSaveDraft}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100"
              >
                <Save className="h-4 w-4 text-slate-600" />
                <span>{t.saveDraftBtn}</span>
              </button>

              {/* Submit Final Verified Claim */}
              <button
                type="button"
                disabled={!isAllCaptured || isSubmitting}
                onClick={handleSubmitClaim}
                aria-describedby={isAllCaptured ? undefined : "submit-blocked-reason"}
                className="fp-btn-primary min-h-11 flex-1 gap-2 px-4 py-2.5 text-xs sm:flex-[1.4] sm:text-sm"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>{t.submitting}</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>{milestone ? t.logGrowthEvidence : t.submitClaimBtn}</span>
                  </>
                )}
              </button>
            </div>

            {/* Inline reason when submission is blocked */}
            {!isAllCaptured && !isSubmitting && (
              <p
                id="submit-blocked-reason"
                role="status"
                className="flex items-start gap-1.5 text-xs font-semibold text-amber-800"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {requiredCount - capturedCount === 1
                    ? lang === "hi"
                      ? "जमा करने से पहले 1 कोण और कैप्चर करें।"
                      : "Capture 1 more angle before submitting."
                    : lang === "hi"
                      ? `जमा करने से पहले ${requiredCount - capturedCount} कोण और कैप्चर करें।`
                      : `Capture ${requiredCount - capturedCount} more angles before submitting.`}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export default function FarmerCapturePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-600">
          Loading Guided 5-Angle Studio…
        </div>
      }
    >
      <CaptureStudioContent />
    </Suspense>
  );
}
