"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { FarmerLang } from "./farmerI18n";

export interface FarmerPlot {
  id: string;
  name: string;
  nameHi: string;
  khasraNumber: string;
  areaHectares: number;
  cropType: string;
  cropTypeHi: string;
  cropVariety: string;
  currentStage: string;
  currentStageHi: string;
  sowingDate: string;
  soilType: string;
  soilTypeHi: string;
  irrigationType: string;
  irrigationTypeHi: string;
  lat: number;
  lon: number;
  village: string;
  district: string;
  state: string;
}

export interface ClaimImageEvidence {
  angleType: "wide_field" | "left_context" | "mid_canopy" | "right_context" | "closeup_damage" | string;
  imageUrl: string;
  timestamp: string;
  lat: number;
  lon: number;
  accuracyM: number;
  sha256: string;
  qualityPassed: boolean;
  blurScore?: number;
  lightingScore?: number;
}

export interface ClaimEvidenceTrust {
  qualityScore: number; // 0-100
  coverageScore: number; // 0-100
  contextScore: number; // 0-100
  integrityScore: number; // 0-100
  overallConfidence: number; // 0-100
  qualityNotes?: string;
  coverageNotes?: string;
  contextNotes?: string;
  integrityNotes?: string;
}

export interface ClaimAiPrediction {
  cropIdentified: string;
  cropConfidence: number;
  diseaseDetected: string;
  diseaseDetectedHi: string;
  severityPercentage: number;
  severityGrade: "Low" | "Medium" | "High" | "Severe";
  affectedAreaHectares: number;
  estimatedLossInr: number;
  modelConfidence: number;
}

export type ClaimStatus = "verified" | "needs_recapture" | "under_review" | "draft" | "submitted";

export interface FarmerClaim {
  id: string;
  plotId: string;
  plotName: string;
  plotNameHi: string;
  khasraNumber: string;
  cropType: string;
  cropTypeHi: string;
  cropVariety: string;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
  farmerObservations: string;
  voiceNoteAudioUrl?: string;
  images: ClaimImageEvidence[];
  missingAngles?: string[];
  recaptureReason?: string;
  recaptureReasonHi?: string;
  reviewerNotes?: string;
  evidenceTrust: ClaimEvidenceTrust;
  aiPrediction: ClaimAiPrediction;
  payoutStatus?: "approved" | "pending_review" | "needs_action" | "processing";
  payoutAmountInr?: number;
}

export interface GrowthTimelineMilestone {
  id: string;
  plotId: string;
  cropName: string;
  cropNameHi: string;
  stageName: string;
  stageNameHi: string;
  dayNumber: number;
  dueDate: string;
  completed: boolean;
  completedDate?: string;
  evidenceImageUrl?: string;
  notes?: string;
  isOverdue: boolean;
}

// Initial Realistic Demo Data
export const INITIAL_PLOTS: FarmerPlot[] = [
  {
    id: "plot-101",
    name: "Khasra #241 - North Wheat Basin",
    nameHi: "खसरा #241 - उत्तरी गेहूं खेत",
    khasraNumber: "241/14",
    areaHectares: 2.4,
    cropType: "Wheat",
    cropTypeHi: "गेहूं",
    cropVariety: "Sharbati PBW-550",
    currentStage: "Flowering & Grain Filling",
    currentStageHi: "फूल व दाना भराव अवस्था",
    sowingDate: "2025-11-15",
    soilType: "Alluvial Clay Loam",
    soilTypeHi: "जलोढ़ दोमट",
    irrigationType: "Tube well / Drip",
    irrigationTypeHi: "नलकूप / ड्रिप",
    lat: 27.8924,
    lon: 76.2819,
    village: "Behror",
    district: "Alwar",
    state: "Rajasthan",
  },
  {
    id: "plot-102",
    name: "Khasra #118 - East Mustard Basin",
    nameHi: "खसरा #118 - पूर्वी सरसों भूखंड",
    khasraNumber: "118/03",
    areaHectares: 1.8,
    cropType: "Mustard",
    cropTypeHi: "सरसों",
    cropVariety: "Pusa Bold RH-749",
    currentStage: "Pod Development",
    currentStageHi: "फली विकास अवस्था",
    sowingDate: "2025-10-28",
    soilType: "Sandy Loam",
    soilTypeHi: "बलुई दोमट",
    irrigationType: "Sprinkler",
    irrigationTypeHi: "फव्वारा सिंचाई",
    lat: 27.8961,
    lon: 76.2884,
    village: "Behror",
    district: "Alwar",
    state: "Rajasthan",
  },
  {
    id: "plot-103",
    name: "Khasra #305 - South Gram Field",
    nameHi: "खसरा #305 - दक्षिणी चना भूखंड",
    khasraNumber: "305/09",
    areaHectares: 1.2,
    cropType: "Chickpea (Gram)",
    cropTypeHi: "चना",
    cropVariety: "GNG-1581 (Gangaur)",
    currentStage: "Vegetative Branching",
    currentStageHi: "शाखा वृद्धि अवस्था",
    sowingDate: "2025-11-05",
    soilType: "Clay Loam",
    soilTypeHi: "दोमट मिट्टी",
    irrigationType: "Canal Fed",
    irrigationTypeHi: "नहरी सिंचाई",
    lat: 27.8879,
    lon: 76.2765,
    village: "Behror",
    district: "Alwar",
    state: "Rajasthan",
  },
];

export const INITIAL_CLAIMS: FarmerClaim[] = [
  {
    id: "FP-2026-8812",
    plotId: "plot-101",
    plotName: "Khasra #241 - North Wheat Basin",
    plotNameHi: "खसरा #241 - उत्तरी गेहूं खेत",
    khasraNumber: "241/14",
    cropType: "Wheat",
    cropTypeHi: "गेहूं",
    cropVariety: "Sharbati PBW-550",
    status: "needs_recapture",
    createdAt: "2026-08-14T10:30:00Z",
    updatedAt: "2026-08-16T14:20:00Z",
    farmerObservations:
      "Severe yellow rust foliar damage following heavy unseasonal rain. Yellow pustules spreading rapidly across north boundary.",
    missingAngles: ["closeup_damage", "mid_canopy"],
    recaptureReason:
      "Close-up damage image had motion blur and over-exposure from direct sunlight. Mid canopy angle was taken from too far away. Please re-shoot these 2 angles with sharp focus.",
    recaptureReasonHi:
      "नज़दीकी फोटो में गति धुंधलापन और सीधी धूप की चमक थी। मध्य छत्र फोटो बहुत दूर से ली गई थी। कृपया इन 2 कोणों की स्पष्ट फोटो दोबारा लें।",
    reviewerNotes: "Awaiting targeted 2-angle retake for final 68% severity payout verification.",
    images: [
      {
        angleType: "wide_field",
        imageUrl: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-14T10:32:10Z",
        lat: 27.89241,
        lon: 76.28192,
        accuracyM: 2.4,
        sha256: "8e9f1a23cb49a710e20f18837190d74a29ef10c7dae92b810938f6154b20a112",
        qualityPassed: true,
      },
      {
        angleType: "left_context",
        imageUrl: "https://images.unsplash.com/photo-1530507629858-e4977d30e9e0?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-14T10:33:05Z",
        lat: 27.89244,
        lon: 76.28189,
        accuracyM: 2.1,
        sha256: "3d410f9a21b34c891e0a293847561829afc01928475610293847561029384756",
        qualityPassed: true,
      },
      {
        angleType: "mid_canopy",
        imageUrl: "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-14T10:33:45Z",
        lat: 27.89242,
        lon: 76.28195,
        accuracyM: 4.8,
        sha256: "5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b",
        qualityPassed: false,
        blurScore: 42,
      },
      {
        angleType: "right_context",
        imageUrl: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-14T10:34:20Z",
        lat: 27.89239,
        lon: 76.28198,
        accuracyM: 2.8,
        sha256: "9f8e7d6c5b4a3928170f1e2d3c4b5a6978879685746352413243546576879809",
        qualityPassed: true,
      },
      {
        angleType: "closeup_damage",
        imageUrl: "https://images.unsplash.com/photo-1597916829826-02e5bb4a54e0?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-14T10:35:02Z",
        lat: 27.89243,
        lon: 76.28193,
        accuracyM: 3.1,
        sha256: "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
        qualityPassed: false,
        blurScore: 35,
        lightingScore: 40,
      },
    ],
    evidenceTrust: {
      qualityScore: 58,
      coverageScore: 60,
      contextScore: 94,
      integrityScore: 98,
      overallConfidence: 77,
      qualityNotes: "2 of 5 frames require retake due to blur and lighting.",
      coverageNotes: "Wide context and right angles good. Close-up & Mid canopy need refresh.",
      contextNotes: "GPS location matches Khasra #241 centroid within 3.2 meters.",
      integrityNotes: "SHA-256 signatures and EXIF metadata verified intact.",
    },
    aiPrediction: {
      cropIdentified: "Wheat (Triticum aestivum)",
      cropConfidence: 97.4,
      diseaseDetected: "Yellow Rust (Puccinia striiformis)",
      diseaseDetectedHi: "पीला रतुआ (पक्सीनिया स्ट्राइफोर्मिस)",
      severityPercentage: 68,
      severityGrade: "High",
      affectedAreaHectares: 1.63,
      estimatedLossInr: 45200,
      modelConfidence: 91.8,
    },
    payoutStatus: "needs_action",
    payoutAmountInr: 45200,
  },
  {
    id: "FP-2026-8804",
    plotId: "plot-102",
    plotName: "Khasra #118 - East Mustard Basin",
    plotNameHi: "खसरा #118 - पूर्वी सरसों भूखंड",
    khasraNumber: "118/03",
    cropType: "Mustard",
    cropTypeHi: "सरसों",
    cropVariety: "Pusa Bold RH-749",
    status: "verified",
    createdAt: "2026-08-10T09:15:00Z",
    updatedAt: "2026-08-12T16:45:00Z",
    farmerObservations:
      "White rust lesions and aphid clustering on lower leaves following temperature drop.",
    reviewerNotes:
      "Claim Verified. High visual clarity across all 5 canonical angles. GPS geotag confirmed inside registered parcel. Payout of ₹32,400 sanctioned under PMFBY direct bank transfer.",
    images: [
      {
        angleType: "wide_field",
        imageUrl: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-10T09:16:12Z",
        lat: 27.89612,
        lon: 76.28841,
        accuracyM: 1.8,
        sha256: "aa11bb22cc33dd44ee55ff667788990011223344556677889900aabbccddeeff",
        qualityPassed: true,
      },
      {
        angleType: "left_context",
        imageUrl: "https://images.unsplash.com/photo-1530507629858-e4977d30e9e0?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-10T09:16:50Z",
        lat: 27.89614,
        lon: 76.28839,
        accuracyM: 2.0,
        sha256: "bb22cc33dd44ee55ff667788990011223344556677889900aabbccddeeffaa11",
        qualityPassed: true,
      },
      {
        angleType: "mid_canopy",
        imageUrl: "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-10T09:17:30Z",
        lat: 27.89611,
        lon: 76.28845,
        accuracyM: 2.2,
        sha256: "cc33dd44ee55ff667788990011223344556677889900aabbccddeeffaa11bb22",
        qualityPassed: true,
      },
      {
        angleType: "right_context",
        imageUrl: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-10T09:18:10Z",
        lat: 27.89615,
        lon: 76.28848,
        accuracyM: 1.9,
        sha256: "dd44ee55ff667788990011223344556677889900aabbccddeeffaa11bb22cc33",
        qualityPassed: true,
      },
      {
        angleType: "closeup_damage",
        imageUrl: "https://images.unsplash.com/photo-1597916829826-02e5bb4a54e0?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-10T09:18:55Z",
        lat: 27.89613,
        lon: 76.28842,
        accuracyM: 1.7,
        sha256: "ee55ff667788990011223344556677889900aabbccddeeffaa11bb22cc33dd44",
        qualityPassed: true,
      },
    ],
    evidenceTrust: {
      qualityScore: 94,
      coverageScore: 100,
      contextScore: 98,
      integrityScore: 99,
      overallConfidence: 97.7,
      qualityNotes: "Crystal clear macro focus and balanced daylight across all 5 views.",
      coverageNotes: "Complete 5 canonical angles captured in order.",
      contextNotes: "Exact geofence match with plot cadastral boundary.",
      integrityNotes: "Device tamper check passed, valid SHA-256 certificate.",
    },
    aiPrediction: {
      cropIdentified: "Mustard (Brassica juncea)",
      cropConfidence: 98.9,
      diseaseDetected: "White Rust (Albugo candida)",
      diseaseDetectedHi: "सफेद रतुआ (एल्बुगो कैंडिडा)",
      severityPercentage: 45,
      severityGrade: "Medium",
      affectedAreaHectares: 0.81,
      estimatedLossInr: 32400,
      modelConfidence: 96.2,
    },
    payoutStatus: "approved",
    payoutAmountInr: 32400,
  },
  {
    id: "FP-2026-8791",
    plotId: "plot-103",
    plotName: "Khasra #305 - South Gram Field",
    plotNameHi: "खसरा #305 - दक्षिणी चना भूखंड",
    khasraNumber: "305/09",
    cropType: "Chickpea (Gram)",
    cropTypeHi: "चना",
    cropVariety: "GNG-1581 (Gangaur)",
    status: "under_review",
    createdAt: "2026-08-16T11:00:00Z",
    updatedAt: "2026-08-16T11:05:00Z",
    farmerObservations:
      "Pod borer caterpillar holes observed on developing pods. Leaf defoliation on border rows.",
    images: [
      {
        angleType: "wide_field",
        imageUrl: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-16T11:01:10Z",
        lat: 27.88791,
        lon: 76.27651,
        accuracyM: 2.5,
        sha256: "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
        qualityPassed: true,
      },
      {
        angleType: "left_context",
        imageUrl: "https://images.unsplash.com/photo-1530507629858-e4977d30e9e0?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-16T11:01:45Z",
        lat: 27.88794,
        lon: 76.27649,
        accuracyM: 2.3,
        sha256: "1112131415161718191a1b1c1d1e1f200102030405060708090a0b0c0d0e0f10",
        qualityPassed: true,
      },
      {
        angleType: "mid_canopy",
        imageUrl: "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-16T11:02:20Z",
        lat: 27.88792,
        lon: 76.27654,
        accuracyM: 2.7,
        sha256: "2122232425262728292a2b2c2d2e2f301112131415161718191a1b1c1d1e1f20",
        qualityPassed: true,
      },
      {
        angleType: "right_context",
        imageUrl: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-16T11:03:00Z",
        lat: 27.88789,
        lon: 76.27658,
        accuracyM: 2.1,
        sha256: "3132333435363738393a3b3c3d3e3f402122232425262728292a2b2c2d2e2f30",
        qualityPassed: true,
      },
      {
        angleType: "closeup_damage",
        imageUrl: "https://images.unsplash.com/photo-1597916829826-02e5bb4a54e0?w=600&auto=format&fit=crop&q=80",
        timestamp: "2026-08-16T11:03:40Z",
        lat: 27.88793,
        lon: 76.27652,
        accuracyM: 2.0,
        sha256: "4142434445464748494a4b4c4d4e4f503132333435363738393a3b3c3d3e3f40",
        qualityPassed: true,
      },
    ],
    evidenceTrust: {
      qualityScore: 89,
      coverageScore: 100,
      contextScore: 95,
      integrityScore: 97,
      overallConfidence: 95.2,
      qualityNotes: "High visual clarity, sharp focus on pod damage.",
      coverageNotes: "All 5 required angles present.",
      contextNotes: "Geofence verified in Khasra #305.",
      integrityNotes: "Signatures verified without tampering.",
    },
    aiPrediction: {
      cropIdentified: "Chickpea / Gram (Cicer arietinum)",
      cropConfidence: 96.5,
      diseaseDetected: "Pod Borer (Helicoverpa armigera)",
      diseaseDetectedHi: "फली छेदक कीट (हेलिकोवर्पा आर्मिगेरा)",
      severityPercentage: 35,
      severityGrade: "Medium",
      affectedAreaHectares: 0.42,
      estimatedLossInr: 18500,
      modelConfidence: 93.4,
    },
    payoutStatus: "pending_review",
    payoutAmountInr: 18500,
  },
];

export const INITIAL_MILESTONES: GrowthTimelineMilestone[] = [
  {
    id: "m-1",
    plotId: "plot-101",
    cropName: "Wheat",
    cropNameHi: "गेहूं",
    stageName: "Sowing & Germination (Day 0–15)",
    stageNameHi: "बुवाई व अंकुरण (दिन 0-15)",
    dayNumber: 15,
    dueDate: "2025-11-30",
    completed: true,
    completedDate: "2025-11-28",
    evidenceImageUrl: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=400&auto=format&fit=crop&q=80",
    notes: "Healthy 98% seedling germination. Soil moisture adequate.",
    isOverdue: false,
  },
  {
    id: "m-2",
    plotId: "plot-101",
    cropName: "Wheat",
    cropNameHi: "गेहूं",
    stageName: "Crown Root & Tillering (Day 30)",
    stageNameHi: "मुकुट जड़ व कल्ले फूटना (दिन 30)",
    dayNumber: 30,
    dueDate: "2025-12-15",
    completed: true,
    completedDate: "2025-12-14",
    evidenceImageUrl: "https://images.unsplash.com/photo-1530507629858-e4977d30e9e0?w=400&auto=format&fit=crop&q=80",
    notes: "First irrigation completed with urea top-dressing. 5-7 tillers per plant.",
    isOverdue: false,
  },
  {
    id: "m-3",
    plotId: "plot-101",
    cropName: "Wheat",
    cropNameHi: "गेहूं",
    stageName: "Jointing & Booting Stage (Day 60)",
    stageNameHi: "गांठ बनना व बाली निकलना (दिन 60)",
    dayNumber: 60,
    dueDate: "2026-01-15",
    completed: true,
    completedDate: "2026-01-15",
    evidenceImageUrl: "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400&auto=format&fit=crop&q=80",
    notes: "Canopy fully closed. Uniform green foliage.",
    isOverdue: false,
  },
  {
    id: "m-4",
    plotId: "plot-101",
    cropName: "Wheat",
    cropNameHi: "गेहूं",
    stageName: "Flowering & Milking (Day 90) - CURRENT",
    stageNameHi: "फूल व दुग्ध अवस्था (दिन 90) - वर्तमान",
    dayNumber: 90,
    dueDate: "2026-08-20",
    completed: false,
    notes: "Scheduled 30-day baseline evidence photo due in 3 days.",
    isOverdue: false,
  },
  {
    id: "m-5",
    plotId: "plot-101",
    cropName: "Wheat",
    cropNameHi: "गेहूं",
    stageName: "Physiological Maturity & Harvest (Day 120)",
    stageNameHi: "परिपक्वता व कटाई (दिन 120)",
    dayNumber: 120,
    dueDate: "2026-09-20",
    completed: false,
    notes: "Pre-harvest yield estimation photo.",
    isOverdue: false,
  },
];

interface FarmerContextType {
  lang: FarmerLang;
  setLang: (lang: FarmerLang) => void;
  plots: FarmerPlot[];
  claims: FarmerClaim[];
  milestones: GrowthTimelineMilestone[];
  getClaimById: (id: string) => FarmerClaim | undefined;
  createClaim: (claim: Omit<FarmerClaim, "id" | "createdAt" | "updatedAt">) => FarmerClaim;
  updateClaimRecapture: (claimId: string, recapturedImages: ClaimImageEvidence[]) => FarmerClaim | undefined;
  saveClaimDraft: (draft: Partial<FarmerClaim>) => string;
  loadClaimDraft: (draftId?: string) => Partial<FarmerClaim> | null;
  snoozeMilestone: (id: string, days: number) => void;
  completeMilestone: (id: string, imageUrl: string, notes?: string) => void;
  farmerProfile: {
    name: string;
    nameHi: string;
    kisanId: string;
    phone: string;
    village: string;
    district: string;
    state: string;
  };
}

const FarmerContext = createContext<FarmerContextType | null>(null);

const STORAGE_KEY_CLAIMS = "fp_farmer_claims_v1";
const STORAGE_KEY_LANG = "fp_farmer_lang_v1";
const STORAGE_KEY_MILESTONES = "fp_farmer_milestones_v1";
const STORAGE_KEY_DRAFT = "fp_farmer_active_draft_v1";

export function FarmerProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<FarmerLang>("hi");
  const [plots] = useState<FarmerPlot[]>(INITIAL_PLOTS);
  const [claims, setClaims] = useState<FarmerClaim[]>(INITIAL_CLAIMS);
  const [milestones, setMilestones] = useState<GrowthTimelineMilestone[]>(INITIAL_MILESTONES);

  useEffect(() => {
    try {
      const storedLang = localStorage.getItem(STORAGE_KEY_LANG) as FarmerLang | null;
      if (storedLang === "en" || storedLang === "hi") {
        setLangState(storedLang);
      }
      const storedClaims = localStorage.getItem(STORAGE_KEY_CLAIMS);
      if (storedClaims) {
        setClaims(JSON.parse(storedClaims));
      }
      const storedMilestones = localStorage.getItem(STORAGE_KEY_MILESTONES);
      if (storedMilestones) {
        setMilestones(JSON.parse(storedMilestones));
      }
    } catch {
      // fallback to initial state
    }
  }, []);

  const setLang = (newLang: FarmerLang) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY_LANG, newLang);
    } catch {
      // ignore
    }
  };

  const getClaimById = (id: string) => {
    return claims.find((c) => c.id.toLowerCase() === id.toLowerCase());
  };

  const createClaim = (claimData: Omit<FarmerClaim, "id" | "createdAt" | "updatedAt">): FarmerClaim => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const newClaim: FarmerClaim = {
      ...claimData,
      id: `FP-2026-${randomNum}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [newClaim, ...claims];
    setClaims(updated);
    try {
      localStorage.setItem(STORAGE_KEY_CLAIMS, JSON.stringify(updated));
      localStorage.removeItem(STORAGE_KEY_DRAFT);
    } catch {
      // ignore
    }
    return newClaim;
  };

  const updateClaimRecapture = (
    claimId: string,
    recapturedImages: ClaimImageEvidence[]
  ): FarmerClaim | undefined => {
    const existing = claims.find((c) => c.id.toLowerCase() === claimId.toLowerCase());
    if (!existing) return undefined;

    // Merge or replace images
    const imageMap = new Map<string, ClaimImageEvidence>();
    existing.images.forEach((img) => imageMap.set(img.angleType, img));
    recapturedImages.forEach((img) => imageMap.set(img.angleType, img));

    const updatedClaim: FarmerClaim = {
      ...existing,
      status: "under_review",
      missingAngles: [],
      updatedAt: new Date().toISOString(),
      images: Array.from(imageMap.values()),
      evidenceTrust: {
        ...existing.evidenceTrust,
        qualityScore: 92,
        coverageScore: 100,
        contextScore: 96,
        integrityScore: 99,
        overallConfidence: 96.5,
        qualityNotes: "Targeted retake passed all visual clarity and focus metrics.",
        coverageNotes: "All 5 angles complete and verified.",
      },
      payoutStatus: "pending_review",
      reviewerNotes: "Targeted recapture received. AI verified resolution of previous blur/coverage issues. In final reviewer queue.",
    };

    const updatedList = claims.map((c) => (c.id === existing.id ? updatedClaim : c));
    setClaims(updatedList);
    try {
      localStorage.setItem(STORAGE_KEY_CLAIMS, JSON.stringify(updatedList));
    } catch {
      // ignore
    }
    return updatedClaim;
  };

  const saveClaimDraft = (draft: Partial<FarmerClaim>): string => {
    const draftId = draft.id || `DRAFT-${Date.now()}`;
    const payload = { ...draft, id: draftId, status: "draft" as const, updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(payload));
    } catch {
      // ignore
    }
    return draftId;
  };

  const loadClaimDraft = (): Partial<FarmerClaim> | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_DRAFT);
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    return null;
  };

  const snoozeMilestone = (id: string, days: number) => {
    const updated = milestones.map((m) => {
      if (m.id === id) {
        const d = new Date(m.dueDate);
        d.setDate(d.getDate() + days);
        return { ...m, dueDate: d.toISOString().split("T")[0], isOverdue: false };
      }
      return m;
    });
    setMilestones(updated);
    try {
      localStorage.setItem(STORAGE_KEY_MILESTONES, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const completeMilestone = (id: string, imageUrl: string, notes?: string) => {
    const updated = milestones.map((m) => {
      if (m.id === id) {
        return {
          ...m,
          completed: true,
          completedDate: new Date().toISOString().split("T")[0],
          evidenceImageUrl: imageUrl,
          notes: notes || m.notes,
          isOverdue: false,
        };
      }
      return m;
    });
    setMilestones(updated);
    try {
      localStorage.setItem(STORAGE_KEY_MILESTONES, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const farmerProfile = {
    name: "Rameshwar Prasad Kumar",
    nameHi: "रामेश्वर प्रसाद कुमार",
    kisanId: "PMFBY-RJ-ALW-94821",
    phone: "+91 98290 44120",
    village: "Behror",
    district: "Alwar",
    state: "Rajasthan",
  };

  return (
    <FarmerContext.Provider
      value={{
        lang,
        setLang,
        plots,
        claims,
        milestones,
        getClaimById,
        createClaim,
        updateClaimRecapture,
        saveClaimDraft,
        loadClaimDraft,
        snoozeMilestone,
        completeMilestone,
        farmerProfile,
      }}
    >
      {children}
    </FarmerContext.Provider>
  );
}

export function useFarmerData() {
  const ctx = useContext(FarmerContext);
  if (!ctx) {
    throw new Error("useFarmerData must be used within a FarmerProvider");
  }
  return ctx;
}
