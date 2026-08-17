"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera,
  Upload,
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
  Save,
  Send,
  Trash2,
  Sparkles,
  Info,
  Layers,
  HelpCircle,
  Compass,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useFarmerData, ClaimImageEvidence } from "@/lib/farmerStore";
import { getFarmerT, CANONICAL_ANGLES as ANGLE_DEFS } from "@/lib/farmerI18n";
import { measureLightingScore, qualityPassedFromSignals, sha256FromDataUrl, sha256Hex } from "@/lib/evidence";
import { isSupabaseConfigured } from "@/lib/supabase";
import { webCaptureBridge } from "@/lib/voice/capture-bridge";
import clsx from "clsx";

function CaptureStudioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    lang,
    plots,
    claims,
    createClaim,
    updateClaimRecapture,
    saveClaimDraft,
    loadClaimDraft,
    persistError,
  } = useFarmerData();
  const t = getFarmerT(lang);

  // URL query params
  const recaptureClaimId = searchParams.get("recapture");
  const requestedAnglesParam = searchParams.get("angles");
  const plotIdParam = searchParams.get("plotId");

  // Determine active angles to capture
  const isTargetedRecapture = Boolean(recaptureClaimId);
  const targetAngleIds = requestedAnglesParam
    ? requestedAnglesParam.split(",").map((s) => s.trim())
    : [];

  const activeAngleDefs = isTargetedRecapture && targetAngleIds.length > 0
    ? ANGLE_DEFS.filter((a) => targetAngleIds.includes(a.id))
    : ANGLE_DEFS;

  // Selected plot
  const [selectedPlotId, setSelectedPlotId] = useState<string>(plotIdParam || plots[0]?.id || "");
  const selectedPlot = plots.find((p) => p.id === selectedPlotId);

  // Active step in stepper
  const [currentAngleIndex, setCurrentAngleIndex] = useState<number>(0);
  const currentAngle = activeAngleDefs[currentAngleIndex] || activeAngleDefs[0];

  // Captured images storage keyed by angle id
  const [capturedImages, setCapturedImages] = useState<Record<string, ClaimImageEvidence>>({});

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);

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

  // File input ref for fallback
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load existing draft if not in recapture mode
  useEffect(() => {
    if (!isTargetedRecapture) {
      const draft = loadClaimDraft();
      if (draft) {
        if (draft.plotId) setSelectedPlotId(draft.plotId);
        if (draft.farmerObservations) setObservations(draft.farmerObservations);
        if (draft.images) {
          const map: Record<string, ClaimImageEvidence> = {};
          draft.images.forEach((img) => {
            map[img.angleType] = img;
          });
          setCapturedImages(map);
        }
      }
    }
  }, [isTargetedRecapture]);

  // Start / stop camera
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err) {
      console.warn("Camera access failed or unavailable:", err);
      setCameraError(t.cameraUnavailable);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [cameraFacing]);

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
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
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
        recognition.lang = lang === "hi" ? "hi-IN" : "en-IN";
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
          showToast(lang === "hi" ? "आवाज उपलब्ध नहीं है — नोट खुद लिखें" : "Voice unavailable — type the note instead");
        };
        recognition.onend = () => setIsListening(false);
        recognition.start();
      } catch {
        setIsListening(false);
        showToast(lang === "hi" ? "आवाज उपलब्ध नहीं है — नोट खुद लिखें" : "Voice unavailable — type the note instead");
      }
    } else {
      showToast(lang === "hi" ? "आवाज उपलब्ध नहीं है — नोट खुद लिखें" : "Voice unavailable — type the note instead");
    }
  };

  // Capture photo from live video stream
  const capturePhotoFromCamera = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let lightingScore: number | undefined;
    try {
      lightingScore = measureLightingScore(ctx.getImageData(0, 0, canvas.width, canvas.height));
    } catch {
      lightingScore = undefined;
    }
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    void saveEvidenceImage(dataUrl, { lightingScore });
  };

  // Handle file upload fallback
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const [dataUrl, hash] = await Promise.all([
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(String(event.target?.result || ""));
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      }),
      sha256Hex(await file.arrayBuffer()),
    ]);
    if (dataUrl) await saveEvidenceImage(dataUrl, { sha256: hash });
  };

  const saveEvidenceImage = async (
    imageUrl: string,
    extras?: { lightingScore?: number; sha256?: string }
  ) => {
    const digest = extras?.sha256 ?? (await sha256FromDataUrl(imageUrl));
    const lightingScore = extras?.lightingScore;
    const useGps = gpsCoords.status === "accurate" || gpsCoords.status === "searching";
    const newEvidence: ClaimImageEvidence = {
      angleType: currentAngle.id,
      imageUrl,
      timestamp: new Date().toISOString(),
      lat: useGps ? gpsCoords.lat : null,
      lon: useGps ? gpsCoords.lon : null,
      accuracyM: useGps ? gpsCoords.accuracyM : null,
      sha256: digest,
      qualityPassed: qualityPassedFromSignals({ lightingScore }),
      lightingScore,
    };

    setCapturedImages((prev) => ({
      ...prev,
      [currentAngle.id]: newEvidence,
    }));

    showToast(
      lang === "hi"
        ? `${currentAngle.nameHi} कैप्चर हो गया!`
        : `${currentAngle.name} captured successfully!`
    );

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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Check completion
  const requiredCount = activeAngleDefs.length;
  const capturedCount = activeAngleDefs.filter((a) => Boolean(capturedImages[a.id])).length;
  const isAllCaptured = capturedCount === requiredCount;

  // Handle Save Draft
  const handleSaveDraft = () => {
    const imagesList = Object.values(capturedImages);
    saveClaimDraft({
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
    showToast(t.draftSavedMsg);
  };

  // Handle Final Submission
  const handleSubmitClaim = async () => {
    if (!isAllCaptured) {
      showToast(t.captureAllRequired);
      return;
    }

    setIsSubmitting(true);

    try {
      const imagesList = Object.values(capturedImages);

      const plot = selectedPlot;
      if (isTargetedRecapture && recaptureClaimId) {
        const updated = await updateClaimRecapture(recaptureClaimId, imagesList);
        setIsSubmitting(false);
        router.push(`/farmer/claims/${updated?.id || recaptureClaimId}?recaptured=true`);
      } else {
        const newClaim = await createClaim({
          plotId: plot?.id || "",
          plotName: plot?.name || "Unregistered plot",
          plotNameHi: plot?.nameHi || "",
          khasraNumber: plot?.khasraNumber || "",
          cropType: plot?.cropType || "",
          cropTypeHi: plot?.cropTypeHi || "",
          cropVariety: plot?.cropVariety || "",
          status: "submitted",
          farmerObservations: observations,
          images: imagesList,
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
        setIsSubmitting(false);
        router.push(`/farmer/claims/${newClaim.id}?submitted=true`);
      }
    } catch (err) {
      console.error("Submission failed:", err);
      setIsSubmitting(false);
      showToast("Submission failed. Please try again.");
      throw err;
    }
  };

  useEffect(() => {
    return webCaptureBridge.register({
      captureCurrentAngle: async () => {
        if (!isCameraActive) {
          return { ok: false, message: "Camera is not active. Open capture first." };
        }
        capturePhotoFromCamera();
        return {
          ok: true,
          message: `Captured ${currentAngle?.id || "angle"}.`,
          angle: currentAngle?.id,
        };
      },
      readGuidance: async () => ({
        ok: true,
        message: currentAngle
          ? `${currentAngle.name}: ${currentAngle.instructions}`
          : "No capture angle is selected.",
        angle: currentAngle?.id,
      }),
      setObservation: async (observation) => {
        setObservations(observation);
        return { ok: true, message: "Observation stored on the capture draft." };
      },
      submitDraft: async () => {
        await handleSubmitClaim();
        return { ok: true, message: "Claim submitted for review." };
      },
    });
  }, [isCameraActive, currentAngle, handleSubmitClaim]);

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
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 space-y-5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50 rounded-xl border border-emerald-500 bg-emerald-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl animate-fade-in flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}
      {persistError && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-xs text-rose-900">
          {persistError}
        </div>
      )}
      {!isSupabaseConfigured() && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          {lang === "hi"
            ? "डेटाबेस कॉन्फ़िगर नहीं है — दावा इस सत्र में ही रहेगा।"
            : "Database is not configured — this claim will stay in the current session only."}
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Camera className="h-6 w-6 text-emerald-800" />
              <span>{t.studioTitle}</span>
            </h1>
            {isTargetedRecapture && (
              <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-xs font-bold text-amber-900 animate-pulse">
                {lang === "hi" ? "लक्षित पुनः फोटो मोड" : "Targeted Recapture Mode"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            {isTargetedRecapture
              ? lang === "hi"
                ? `दावा #${recaptureClaimId} के लिए केवल चिह्नित कोणों की फोटो आवश्यक है।`
                : `Targeted recapture for Claim #${recaptureClaimId}. Only missing angles required.`
              : t.studioSub}
          </p>
        </div>

        {!isTargetedRecapture && (
          <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-300 px-3 py-1.5 shadow-2xs">
            <Layers className="h-4 w-4 text-emerald-800 shrink-0" />
            {plots.length === 0 ? (
              <span className="text-xs text-slate-600">
                {lang === "hi" ? "कोई पंजीकृत भूखंड नहीं — बिना भूखंड जमा होगा" : "No registered plots — claim will be unregistered"}
              </span>
            ) : (
              <select
                value={selectedPlotId}
                onChange={(e) => setSelectedPlotId(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none"
              >
                {plots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {lang === "hi" ? p.nameHi || p.name : p.name} ({p.khasraNumber})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* 5-Angle Stepper / Progress Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3 text-xs font-semibold text-slate-600">
          <span>
            {lang === "hi" ? "कोण प्रगति" : "Angle Progress"}: {capturedCount} / {requiredCount}{" "}
            {lang === "hi" ? "पूर्ण" : "Captured"}
          </span>
          <span className="text-emerald-800 font-bold font-mono">
            {Math.round((capturedCount / requiredCount) * 100)}%
          </span>
        </div>

        {/* Progress pill bar */}
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {activeAngleDefs.map((angle, idx) => {
            const isCaptured = Boolean(capturedImages[angle.id]);
            const isCurrent = idx === currentAngleIndex;

            return (
              <button
                key={angle.id}
                type="button"
                onClick={() => setCurrentAngleIndex(idx)}
                className={clsx(
                  "flex flex-col items-center justify-center rounded-lg p-2 text-center transition-all border",
                  isCurrent
                    ? "border-emerald-700 bg-emerald-800 text-white shadow-sm ring-2 ring-emerald-300"
                    : isCaptured
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                )}
              >
                <div className="flex items-center justify-center gap-1">
                  {isCaptured ? (
                    <CheckCircle2
                      className={clsx("h-4 w-4", isCurrent ? "text-emerald-300" : "text-emerald-700")}
                    />
                  ) : (
                    <span className="text-xs font-mono font-bold">{idx + 1}</span>
                  )}
                </div>
                <span className="mt-1 text-[10px] sm:text-xs font-semibold truncate w-full">
                  {lang === "hi" ? angle.nameHi.split(". ")[1] : angle.name.split(". ")[1]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Studio Viewport: Left Live Camera Viewfinder / Right Step Guidance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (7 cols): Camera Viewfinder & Controls */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative overflow-hidden rounded-2xl border-2 border-slate-800 bg-black aspect-4/3 sm:aspect-16/10 shadow-lg flex items-center justify-center">
            {/* Live Video Feed */}
            {isCameraActive ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            ) : capturedImages[currentAngle.id] ? (
              <img
                src={capturedImages[currentAngle.id].imageUrl}
                alt={currentAngle.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="p-6 text-center text-slate-400">
                <Camera className="mx-auto h-12 w-12 opacity-40 mb-2" />
                <p className="text-sm font-medium">{cameraError || t.cameraUnavailable}</p>
                <button
                  type="button"
                  onClick={startCamera}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{lang === "hi" ? "कैमरा पुनः शुरू करें" : "Retry Camera"}</span>
                </button>
              </div>
            )}

            {/* Overlaid Canonical Framing Guidelines */}
            <div className="pointer-events-none absolute inset-0 border border-white/20 grid grid-cols-3 grid-rows-3">
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20 flex items-center justify-center">
                <div className="h-10 w-10 rounded-full border border-emerald-400/60 flex items-center justify-center">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                </div>
              </div>
              <div className="border-b border-white/20" />
              <div className="border-r border-white/20" />
              <div className="border-r border-white/20" />
              <div />
            </div>

            {/* Top Overlay: Active Angle Badge & GPS Meter */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              <span className="rounded-md bg-black/75 backdrop-blur-md px-2.5 py-1 text-xs font-bold text-white border border-white/20 flex items-center gap-1.5">
                {getAngleIcon(currentAngle.illustrationIcon)}
                <span>{lang === "hi" ? currentAngle.nameHi : currentAngle.name}</span>
              </span>

              {/* GPS accuracy badge */}
              <span className="rounded-md bg-emerald-950/85 backdrop-blur-md px-2.5 py-1 text-[11px] font-mono text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <Compass className="h-3.5 w-3.5 text-emerald-400 animate-spin-slow" />
                <span>
                  {gpsCoords.status === "unavailable" || gpsCoords.lat == null
                    ? "GPS unavailable"
                    : `±${gpsCoords.accuracyM}m · ${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lon?.toFixed(4)}`}
                </span>
              </span>
            </div>

            {/* If current angle is already captured, show overlay banner */}
            {capturedImages[currentAngle.id] && (
              <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-emerald-950/90 backdrop-blur-md p-2.5 text-xs text-white border border-emerald-500 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="font-semibold">{t.angleCaptured}</span>
                </div>
                <div className="flex items-center gap-2 pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => deleteCapturedAngle(currentAngle.id)}
                    className="flex items-center gap-1 text-red-300 hover:text-red-100 text-[11px] font-semibold bg-red-950/60 px-2 py-1 rounded"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>{t.retakePhoto}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Primary Viewport Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-1">
            {/* Flip camera */}
            <button
              type="button"
              onClick={() =>
                setCameraFacing((prev) => (prev === "environment" ? "user" : "environment"))
              }
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{t.switchCamera}</span>
            </button>

            {/* Main Shutter / Capture Button */}
            <button
              type="button"
              onClick={capturePhotoFromCamera}
              className="flex-1 max-w-xs flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-6 py-3.5 text-sm sm:text-base font-bold text-white shadow-md hover:bg-emerald-900 active:scale-98 transition-all"
            >
              <Camera className="h-5 w-5" />
              <span>{t.takePhoto}</span>
            </button>

            {/* Gallery Upload Fallback */}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
              title="Upload existing photo"
            >
              <Upload className="h-3.5 w-3.5 text-slate-600" />
              <span className="hidden sm:inline">{t.uploadFallback}</span>
              <span className="sm:hidden">{lang === "hi" ? "अपलोड" : "Upload"}</span>
            </button>
          </div>
        </div>

        {/* Right Column (5 cols): Step Guidance, Voice Notes & Submission */}
        <div className="lg:col-span-5 space-y-4">
          {/* Canonical Angle Guidance Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                {getAngleIcon(currentAngle.illustrationIcon)}
                <span>{lang === "hi" ? currentAngle.nameHi : currentAngle.name}</span>
              </div>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 font-mono">
                {currentAngle.id}
              </span>
            </div>

            <p className="mt-3 text-xs text-slate-700 leading-relaxed font-medium">
              {lang === "hi" ? currentAngle.instructionsHi : currentAngle.instructions}
            </p>

            {/* Best practice bullet points */}
            <div className="mt-3 rounded-lg bg-slate-50 p-3 border border-slate-100">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-emerald-700" />
                <span>{lang === "hi" ? "सर्वोत्तम फोटो सुझाव" : "Framing Tips"}</span>
              </div>
              <ul className="space-y-1 text-xs text-slate-600">
                {(lang === "hi" ? currentAngle.tipsHi : currentAngle.tips).map((tip, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-emerald-700 font-bold">•</span>
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
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>{lang === "hi" ? "पिछला" : "Previous"}</span>
              </button>

              <button
                type="button"
                disabled={currentAngleIndex === activeAngleDefs.length - 1}
                onClick={() => setCurrentAngleIndex(currentAngleIndex + 1)}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <span>{lang === "hi" ? "अगला" : "Next"}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Farmer Observation Notes with Voice Dictation */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5 text-emerald-800" />
                <span>{t.farmerObservationsLabel}</span>
              </label>

              {/* Voice Dictation Trigger */}
              <button
                type="button"
                onClick={toggleVoiceDictation}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all",
                  isListening
                    ? "bg-red-600 text-white animate-pulse shadow-md"
                    : "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                )}
              >
                {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                <span>{isListening ? t.voiceDictationListening : t.voiceDictationStart}</span>
              </button>
            </div>

            <textarea
              rows={3}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder={t.farmerObservationsPlaceholder}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
            />
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

            <div className="flex items-center gap-2 pt-1">
              {/* Save Draft */}
              <button
                type="button"
                onClick={handleSaveDraft}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100 shadow-2xs transition-colors"
              >
                <Save className="h-4 w-4 text-slate-600" />
                <span>{t.saveDraftBtn}</span>
              </button>

              {/* Submit Final Verified Claim */}
              <button
                type="button"
                disabled={!isAllCaptured || isSubmitting}
                onClick={handleSubmitClaim}
                className="flex-2 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md hover:bg-emerald-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>{t.submitting}</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>{t.submitClaimBtn}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
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
