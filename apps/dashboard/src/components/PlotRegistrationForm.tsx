"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Compass,
  Landmark,
  MapPin,
  RotateCcw,
} from "lucide-react";
import clsx from "clsx";
import { useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { todayIsoDate } from "@/lib/farmer-timeline";
import {
  getAreaBreakdown,
  toKattha,
  type AreaUnit,
} from "@/lib/land-units";
import {
  CROP_SEASONS,
  INDIAN_STATES,
  IRRIGATION_TYPES,
  SOIL_TYPES,
  SUPPORTED_CROPS,
  TENANCY_TYPES,
} from "@/lib/plot-metadata";

export interface PlotRegistrationFormProps {
  id?: string;
  mode?: "timeline" | "inline_capture";
  onSuccess?: (plotId: string) => void;
  onCancel?: () => void;
  cancelHref?: string;
  title?: string;
  description?: string;
  submitLabel?: string;
  className?: string;
}

export default function PlotRegistrationForm({
  id = "register-plot",
  mode = "timeline",
  onSuccess,
  onCancel,
  cancelHref,
  title,
  description,
  submitLabel,
  className,
}: PlotRegistrationFormProps) {
  const { lang, registerPlot, farmerProfile } = useFarmerData();
  const t = getFarmerT(lang);

  const defaultState = useMemo(() => {
    if (farmerProfile?.state && (INDIAN_STATES as readonly string[]).includes(farmerProfile.state)) {
      return farmerProfile.state;
    }
    return "Bihar";
  }, [farmerProfile?.state]);

  const [plotForm, setPlotForm] = useState({
    name: "",
    state: defaultState,
    district: farmerProfile?.district || "",
    tehsil: "",
    village: farmerProfile?.village || "",
    khataNumber: "",
    khasraNumber: "",
    hissaNumber: "",
    ownershipType: "owner",
    areaValue: "10",
    areaUnit: "kattha" as AreaUnit,
    soilType: "",
    irrigationType: "",
    season: "Rabi",
    cropType: "wheat",
    cropVariety: "",
    sowingDate: todayIsoDate(),
    lat: "",
    lon: "",
  });

  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  // Live Kattha & metric conversions
  const currentKattha = useMemo(() => {
    const raw = parseFloat(plotForm.areaValue) || 0;
    return toKattha(raw, plotForm.areaUnit);
  }, [plotForm.areaValue, plotForm.areaUnit]);

  const areaBreakdown = useMemo(() => getAreaBreakdown(currentKattha), [currentKattha]);

  const handleDetectGps = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setFormError(
        lang === "hi"
          ? "इस डिवाइस / ब्राउज़र में जीपीएस सेवा उपलब्ध नहीं है।"
          : "GPS is not supported on this device/browser.",
      );
      return;
    }
    setLocating(true);
    setFormError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPlotForm((prev) => ({
          ...prev,
          lat: pos.coords.latitude.toFixed(6),
          lon: pos.coords.longitude.toFixed(6),
        }));
        setGpsAccuracy(Math.round(pos.coords.accuracy));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setFormError(
          lang === "hi"
            ? `जीपीएस त्रुटि: ${err.message || "स्थान प्राप्त करने में असमर्थ"}`
            : `GPS capture error: ${err.message || "Unable to acquire fix"}`,
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const name = plotForm.name.trim();
    const khasra = plotForm.khasraNumber.trim();
    const areaVal = parseFloat(plotForm.areaValue);

    if (!name) {
      setFormError(lang === "hi" ? "कृपया भूखंड / खेत का नाम दर्ज करें।" : "Please enter a plot / field name.");
      return;
    }
    if (!khasra) {
      setFormError(
        lang === "hi"
          ? "पीएमएफबीवाई मानक अनुसार खसरा संख्या अनिवार्य है।"
          : "Khasra number is required under PMFBY cadastral rules.",
      );
      return;
    }
    if (!areaVal || areaVal <= 0) {
      setFormError(
        lang === "hi" ? "कृपया मान्य क्षेत्रफल (Area) दर्ज करें।" : "Please enter a valid area greater than zero.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedCrop = SUPPORTED_CROPS.find((c) => c.value === plotForm.cropType);
      const res = await registerPlot({
        name,
        nameHi: name,
        khasraNumber: khasra,
        khataNumber: plotForm.khataNumber.trim(),
        hissaNumber: plotForm.hissaNumber.trim(),
        tehsil: plotForm.tehsil.trim(),
        village: plotForm.village.trim() || farmerProfile?.village || undefined,
        district: plotForm.district.trim() || farmerProfile?.district || undefined,
        state: plotForm.state.trim() || farmerProfile?.state || undefined,
        ownershipType: plotForm.ownershipType,
        season: plotForm.season,
        areaValue: areaVal,
        areaUnit: plotForm.areaUnit,
        areaKattha: currentKattha,
        cropType: plotForm.cropType,
        cropTypeHi: selectedCrop?.labelHi || plotForm.cropType,
        cropVariety: plotForm.cropVariety.trim(),
        soilType: plotForm.soilType,
        soilTypeHi: SOIL_TYPES.find((s) => s.value === plotForm.soilType)?.labelHi || plotForm.soilType,
        irrigationType: plotForm.irrigationType,
        irrigationTypeHi:
          IRRIGATION_TYPES.find((i) => i.value === plotForm.irrigationType)?.labelHi || plotForm.irrigationType,
        sowingDate: plotForm.sowingDate || todayIsoDate(),
        lat: plotForm.lat ? parseFloat(plotForm.lat) : undefined,
        lon: plotForm.lon ? parseFloat(plotForm.lon) : undefined,
      });

      if (mode === "timeline") {
        setPlotForm({
          name: "",
          state: defaultState,
          district: farmerProfile?.district || "",
          tehsil: "",
          village: farmerProfile?.village || "",
          khataNumber: "",
          khasraNumber: "",
          hissaNumber: "",
          ownershipType: "owner",
          areaValue: "10",
          areaUnit: "kattha",
          soilType: "",
          irrigationType: "",
          season: "Rabi",
          cropType: "wheat",
          cropVariety: "",
          sowingDate: todayIsoDate(),
          lat: "",
          lon: "",
        });
        setGpsAccuracy(null);
      }

      if (onSuccess && res?.plotId) {
        onSuccess(res.plotId);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to register plot");
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerTitle =
    title ||
    (mode === "inline_capture"
      ? lang === "hi"
        ? "भूखंड पंजीकरण · राजस्व भूलेख विवरण"
        : "Plot Registration · Land Revenue Record"
      : `${t.registerPlot} · ${lang === "hi" ? "राजस्व भूलेख विवरण" : "Land Revenue Record"}`);

  const headerDescription =
    description ||
    (mode === "inline_capture"
      ? lang === "hi"
        ? "पीएमएफबीवाई मानक अनुसार दावा दर्ज करने से पहले प्रभावित भूखंड का आधिकारिक विवरण दर्ज करें। पंजीकरण के बाद फोटो कैप्चर तुरंत खुल जाएगा।"
        : "Under PMFBY insurance standards, every claim must be anchored to a registered land parcel (Khasra). Once registered, photo capture will immediately unlock."
      : lang === "hi"
        ? "PMFBY एवं राज्य भूलेख (Bhulekh / RoR) मानक अनुसार आधिकारिक विवरण भरें। पंजीकरण करते ही विकास समय-सीमा सक्रिय हो जाएगी।"
        : "Official cadastral and crop details as per PMFBY & State Bhulekh (RoR) standards.");

  return (
    <form
      id={id}
      onSubmit={handleSubmit}
      className={clsx(
        "fp-panel rounded-xl sm:rounded-2xl p-5 sm:p-7 border border-[var(--line)] space-y-6 transition-all shadow-xs",
        className,
      )}
    >
      {/* Header - Minimalist Civic Style */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-900 bg-emerald-100/70 border border-emerald-300 px-2 py-0.5 rounded">
              {lang === "hi" ? "राजस्व भूलेख (RoR)" : "PMFBY RoR Registry"}
            </span>
            <span className="text-[11px] text-[var(--ink-muted)]">·</span>
            <span className="text-xs text-[var(--ink-muted)]">
              {lang === "hi" ? "आधिकारिक भूखंड रिकॉर्ड" : "Official Cadastral Record"}
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--ink)] tracking-tight">
            {headerTitle}
          </h2>
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed max-w-2xl">
            {headerDescription}
          </p>
        </div>
      </div>

      {/* Error Callout */}
      {formError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-800 flex items-center justify-between">
          <span>{formError}</span>
          <button
            type="button"
            onClick={() => setFormError(null)}
            className="text-red-700 hover:text-red-900 ml-2 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Clean, spacious primary form fields */}
      <div className="space-y-5">
        {/* Row 1: Plot Name & Khasra Number (Essential Cadastral Identity) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-semibold text-xs text-[var(--ink)] block mb-1">
              {t.addPlotName} <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={plotForm.name}
              onChange={(e) => setPlotForm((p) => ({ ...p, name: e.target.value }))}
              placeholder={lang === "hi" ? "उदा. उत्तर वाला खेत / ट्यूबवेल प्लॉट" : "e.g. North Field / Canal Plot"}
              className="fp-input rounded-lg text-xs sm:text-sm font-medium"
            />
          </div>

          <div>
            <label className="font-semibold text-xs text-[var(--ink)] block mb-1">
              {t.addPlotKhasra} <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={plotForm.khasraNumber}
              onChange={(e) => setPlotForm((p) => ({ ...p, khasraNumber: e.target.value }))}
              placeholder={lang === "hi" ? "उदा. 125/2 / गाटा 340" : "e.g. 125/2 / Survey 340"}
              className="fp-input rounded-lg text-xs sm:text-sm font-medium"
            />
          </div>
        </div>

        {/* Row 2: Khata Number & Area with integrated unit conversion */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div>
            <label className="font-semibold text-xs text-[var(--ink)] block mb-1">
              {t.addPlotKhata} <span className="text-[11px] font-normal text-[var(--ink-muted)]">({lang === "hi" ? "वैकल्पिक" : "Optional"})</span>
            </label>
            <input
              type="text"
              value={plotForm.khataNumber}
              onChange={(e) => setPlotForm((p) => ({ ...p, khataNumber: e.target.value }))}
              placeholder={lang === "hi" ? "उदा. खाता नं. 42 / 108" : "e.g. Khata 42 / 108"}
              className="fp-input rounded-lg text-xs sm:text-sm font-medium"
            />
          </div>

          <div>
            <label className="font-semibold text-xs text-[var(--ink)] block mb-1">
              {t.addPlotArea} <span className="text-red-600">*</span>
            </label>
            <div className="flex rounded-lg overflow-hidden border border-[var(--line)] focus-within:border-[var(--ink)] bg-[var(--surface)]">
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={plotForm.areaValue}
                onChange={(e) => setPlotForm((p) => ({ ...p, areaValue: e.target.value }))}
                placeholder="10"
                className="w-full px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 bg-transparent focus:outline-none"
              />
              <select
                value={plotForm.areaUnit}
                onChange={(e) => setPlotForm((p) => ({ ...p, areaUnit: e.target.value as AreaUnit }))}
                className="border-l border-[var(--line)] bg-[var(--canvas)] px-3 py-2 text-xs sm:text-sm font-semibold text-[var(--ink)] focus:outline-none cursor-pointer shrink-0"
              >
                <option value="kattha">{lang === "hi" ? "कट्ठा (Kattha)" : "Kattha"}</option>
                <option value="bigha">{lang === "hi" ? "बीघा (Bigha)" : "Bigha"}</option>
                <option value="acre">{lang === "hi" ? "एकड़ (Acre)" : "Acre"}</option>
                <option value="hectare">{lang === "hi" ? "हेक्टेयर (Ha)" : "Hectare"}</option>
              </select>
            </div>

            {/* Subtle, clean single-line conversion preview */}
            <div className="mt-1.5 text-[11px] text-[var(--ink-muted)] font-mono flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>≈ {areaBreakdown.hectares} Ha</span>
              <span>·</span>
              <span>{areaBreakdown.bigha} Bigha</span>
              <span>·</span>
              <span>{areaBreakdown.acres} Acre</span>
              <span>·</span>
              <span>{areaBreakdown.sqFt.toLocaleString()} sq ft</span>
            </div>
          </div>
        </div>

        {/* Row 3: Crop Sown, Season & Sowing Date (3 Clean Columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="font-semibold text-xs text-[var(--ink)] block mb-1">
              {t.addPlotCrop} <span className="text-red-600">*</span>
            </label>
            <select
              value={plotForm.cropType}
              onChange={(e) => setPlotForm((p) => ({ ...p, cropType: e.target.value }))}
              className="fp-input rounded-lg text-xs sm:text-sm font-semibold text-slate-900"
            >
              {SUPPORTED_CROPS.map((c) => (
                <option key={c.value} value={c.value}>
                  {lang === "hi" ? c.labelHi : `${c.labelEn} (${c.labelHi.split(" ")[0]})`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-xs text-[var(--ink)] block mb-1">
              {t.addPlotSeason}
            </label>
            <select
              value={plotForm.season}
              onChange={(e) => setPlotForm((p) => ({ ...p, season: e.target.value }))}
              className="fp-input rounded-lg text-xs sm:text-sm"
            >
              {CROP_SEASONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {lang === "hi" ? s.labelHi : s.labelEn}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-xs text-[var(--ink)] block mb-1">
              {t.addPlotSowing} <span className="text-red-600">*</span>
            </label>
            <input
              type="date"
              required
              value={plotForm.sowingDate}
              onChange={(e) => setPlotForm((p) => ({ ...p, sowingDate: e.target.value }))}
              className="fp-input rounded-lg text-xs sm:text-sm"
            />
          </div>
        </div>

        {/* Row 4: Village/Location & Field GPS Geotag */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div>
            <label className="font-semibold text-xs text-[var(--ink)] block mb-1">
              {t.addPlotVillage}
            </label>
            <input
              type="text"
              value={plotForm.village}
              onChange={(e) => setPlotForm((p) => ({ ...p, village: e.target.value }))}
              placeholder={farmerProfile?.village || (lang === "hi" ? "उदा. जगदीशपुर" : "e.g. Jagdishpur")}
              className="fp-input rounded-lg text-xs sm:text-sm font-medium"
            />
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
              <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
              <span>
                {[plotForm.village || farmerProfile?.village, plotForm.district || farmerProfile?.district, plotForm.state || farmerProfile?.state]
                  .filter(Boolean)
                  .join(", ") || (lang === "hi" ? "स्थान दर्ज करें" : "Location profile")}
              </span>
              <button
                type="button"
                onClick={() => setShowMoreDetails(true)}
                className="underline hover:text-[var(--ink)] ml-1 font-semibold"
              >
                {lang === "hi" ? "बदलें" : "Edit"}
              </button>
            </div>
          </div>

          <div>
            <label className="font-semibold text-xs text-[var(--ink)] block mb-1">
              {lang === "hi" ? "खेत का जीपीएस भू-स्थान (Geo-Tag)" : "Field GPS Coordinates"}
            </label>
            {plotForm.lat && plotForm.lon ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/50 p-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 font-mono text-xs text-emerald-950 font-bold truncate">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span className="truncate">
                    {parseFloat(plotForm.lat).toFixed(5)}°N, {parseFloat(plotForm.lon).toFixed(5)}°E
                    {gpsAccuracy !== null && (
                      <span className="text-[11px] text-slate-500 font-normal ml-1">
                        (±{gpsAccuracy}m)
                      </span>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDetectGps}
                  disabled={locating}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-900 hover:text-emerald-950 underline shrink-0"
                >
                  <RotateCcw className={clsx("h-3 w-3", locating && "animate-spin")} />
                  <span>{lang === "hi" ? "पुनः लें" : "Refresh"}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={handleDetectGps}
                  disabled={locating}
                  className="fp-btn-secondary rounded-lg text-xs gap-1.5 py-2 px-3 justify-center min-h-10"
                >
                  <Compass className={clsx("h-3.5 w-3.5 text-emerald-800", locating && "animate-spin")} />
                  <span>
                    {locating
                      ? lang === "hi"
                        ? "जीपीएस प्राप्त हो रहा है…"
                        : "Detecting GPS…"
                      : lang === "hi"
                        ? "डिवाइस से लाइव जीपीएस लें"
                        : "Detect Live GPS"}
                  </span>
                </button>
                <span className="text-[11px] text-[var(--ink-muted)]">
                  {lang === "hi"
                    ? "(खेत पर खड़े होकर दबाएँ)"
                    : "(Direct from device sensors)"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Supplementary Cadastral Details */}
        <div className="pt-2 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={() => setShowMoreDetails((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors py-1"
          >
            <ChevronDown className={clsx("h-3.5 w-3.5 transition-transform", showMoreDetails && "rotate-180")} />
            <span>
              {showMoreDetails
                ? lang === "hi"
                  ? "अतिरिक्त विवरण छुपाएँ"
                  : "Hide additional details"
                : lang === "hi"
                  ? "+ अतिरिक्त राजस्व विवरण (जिला, राज्य, तहसील, हिस्सा, किस्म, मिट्टी, सिंचाई)"
                  : "+ Additional revenue details (District, State, Tehsil, Hissa, Variety, Soil, Irrigation)"}
            </span>
          </button>

          {showMoreDetails && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-3 text-xs">
              <div>
                <label className="font-semibold text-[var(--ink)] block mb-1">
                  {t.addPlotDistrict}
                </label>
                <input
                  type="text"
                  value={plotForm.district}
                  onChange={(e) => setPlotForm((p) => ({ ...p, district: e.target.value }))}
                  placeholder={farmerProfile?.district || (lang === "hi" ? "उदा. पटना / रोहतास" : "e.g. Patna / Rohtas")}
                  className="fp-input rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--ink)] block mb-1">
                  {t.addPlotState}
                </label>
                <select
                  value={plotForm.state}
                  onChange={(e) => setPlotForm((p) => ({ ...p, state: e.target.value }))}
                  className="fp-input rounded-lg"
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-[var(--ink)] block mb-1">
                  {t.addPlotTehsil}
                </label>
                <input
                  type="text"
                  value={plotForm.tehsil}
                  onChange={(e) => setPlotForm((p) => ({ ...p, tehsil: e.target.value }))}
                  placeholder={lang === "hi" ? "उदा. बिक्रम / दानापुर" : "e.g. Bikram / Danapur"}
                  className="fp-input rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--ink)] block mb-1">
                  {t.addPlotHissa}
                </label>
                <input
                  type="text"
                  value={plotForm.hissaNumber}
                  onChange={(e) => setPlotForm((p) => ({ ...p, hissaNumber: e.target.value }))}
                  placeholder={lang === "hi" ? "उदा. हिस्सा 1 / 2A" : "e.g. 1 / 2A"}
                  className="fp-input rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--ink)] block mb-1">
                  {lang === "hi" ? "फसल किस्म (Variety)" : "Crop Variety"}
                </label>
                <input
                  type="text"
                  value={plotForm.cropVariety}
                  onChange={(e) => setPlotForm((p) => ({ ...p, cropVariety: e.target.value }))}
                  placeholder={lang === "hi" ? "उदा. HD-2967 / PB-1509" : "e.g. HD-2967 / PB-1509"}
                  className="fp-input rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--ink)] block mb-1">
                  {t.addPlotTenancy}
                </label>
                <select
                  value={plotForm.ownershipType}
                  onChange={(e) => setPlotForm((p) => ({ ...p, ownershipType: e.target.value }))}
                  className="fp-input rounded-lg"
                >
                  {TENANCY_TYPES.map((ten) => (
                    <option key={ten.value} value={ten.value}>
                      {lang === "hi" ? ten.labelHi : ten.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-[var(--ink)] block mb-1">
                  {t.addPlotSoil}
                </label>
                <select
                  value={plotForm.soilType}
                  onChange={(e) => setPlotForm((p) => ({ ...p, soilType: e.target.value }))}
                  className="fp-input rounded-lg"
                >
                  <option value="">{lang === "hi" ? "चुनें (वैकल्पिक)" : "Not set (Optional)"}</option>
                  {SOIL_TYPES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {lang === "hi" ? st.labelHi : st.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-[var(--ink)] block mb-1">
                  {t.addPlotIrrigation}
                </label>
                <select
                  value={plotForm.irrigationType}
                  onChange={(e) => setPlotForm((p) => ({ ...p, irrigationType: e.target.value }))}
                  className="fp-input rounded-lg"
                >
                  <option value="">{lang === "hi" ? "चुनें (वैकल्पिक)" : "Not set (Optional)"}</option>
                  {IRRIGATION_TYPES.map((it) => (
                    <option key={it.value} value={it.value}>
                      {lang === "hi" ? it.labelHi : it.labelEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer / Submit Actions */}
      <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--line)]">
        <p className="text-xs text-[var(--ink-muted)]">
          {mode === "inline_capture"
            ? lang === "hi"
              ? "✓ पंजीकरण करते ही दावा स्टूडियो स्वतः खुल जाएगा।"
              : "✓ Submitting will instantly unlock your photo capture studio."
            : lang === "hi"
              ? "✓ पंजीकरण करते ही 30, 60, 90 दिन एवं कटाई समय-सीमा सक्रिय हो जाएगी।"
              : "✓ Submitting will activate your 30, 60, 90 day and harvest growth timeline."}
        </p>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {cancelHref && (
            <Link href={cancelHref} className="fp-btn-secondary rounded-lg text-xs px-4 py-2">
              {lang === "hi" ? "समय-सीमा देखें" : "View Timeline"}
            </Link>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="fp-btn-secondary rounded-lg text-xs px-4 py-2"
            >
              {lang === "hi" ? "रद्द करें" : "Cancel"}
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="fp-btn-primary rounded-lg min-h-11 w-full sm:w-auto px-6 py-2.5 text-xs sm:text-sm font-bold shadow-xs transition-all active:scale-95 gap-1.5"
          >
            {isSubmitting ? (
              <span>{lang === "hi" ? "पंजीकृत हो रहा है…" : "Registering…"}</span>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>
                  {submitLabel ||
                    (mode === "inline_capture"
                      ? lang === "hi"
                        ? "भूखंड पंजीकृत करें और दावा शुरू करें"
                        : "Register Plot & Unlock Studio"
                      : lang === "hi"
                        ? "भूखंड एवं समय-सीमा पंजीकृत करें"
                        : "Register Plot & Start Timeline")}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
