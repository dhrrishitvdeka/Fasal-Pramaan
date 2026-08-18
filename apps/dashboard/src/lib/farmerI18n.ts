import type { AppLang } from "./live-indian-languages";

export type FarmerLang = AppLang;

export interface AngleGuidance {
  id: string;
  name: string;
  nameHi: string;
  shortDesc: string;
  shortDescHi: string;
  instructions: string;
  instructionsHi: string;
  tips: string[];
  tipsHi: string[];
  illustrationIcon: string;
}

export const CANONICAL_ANGLES: AngleGuidance[] = [
  {
    id: "wide_field",
    name: "1. Wide Field View",
    nameHi: "1. पूरे खेत का व्यापक दृश्य",
    shortDesc: "Full plot panoramic view showing boundary & horizon",
    shortDescHi: "सीमा और क्षितिज दिखाते हुए पूरे भूखंड का विहंगम दृश्य",
    instructions:
      "Step back 15–20 meters from the damaged area. Capture the entire field plot showing boundaries, neighboring vegetation, and horizon for landscape context.",
    instructionsHi:
      "क्षतिग्रस्त क्षेत्र से 15-20 मीटर पीछे हटें। पूरे खेत की सीमाएं, आस-पास की फसल और क्षितिज को एक साथ दिखाएं।",
    tips: [
      "Keep horizon level in the upper third of frame",
      "Include field bunds or boundaries if visible",
      "Avoid strong direct sunlight into camera lens",
    ],
    tipsHi: [
      "क्षितिज को फ्रेम के ऊपरी तिहाई हिस्से में सीधा रखें",
      "खेत की मेड़ या सीमाएं स्पष्ट दिखाई दें",
      "कैमरे के लेंस पर सीधी धूप से बचें",
    ],
    illustrationIcon: "Maximize2",
  },
  {
    id: "left_context",
    name: "2. Left Context Angle",
    nameHi: "2. बायाँ संदर्भ कोण",
    shortDesc: "Left transition showing healthy vs affected zone",
    shortDescHi: "स्वस्थ बनाम प्रभावित क्षेत्र को दर्शाने वाला बायाँ कोण",
    instructions:
      "Stand at a 45° angle to the left of the damage. Frame both the healthy crop section and the damaged section to establish contrast.",
    instructionsHi:
      "क्षतिग्रस्त क्षेत्र के बाईं ओर 45° कोण पर खड़े हों। तुलना दिखाने के लिए स्वस्थ फसल और प्रभावित फसल दोनों को फ्रेम में लें।",
    tips: [
      "Show transition boundary clearly",
      "Hold camera at chest height (~1.2m)",
      "Ensure uniform natural lighting",
    ],
    tipsHi: [
      "स्वस्थ और प्रभावित क्षेत्र की सीमा स्पष्ट दिखाएं",
      "कैमरे को छाती की ऊंचाई (~1.2 मीटर) पर रखें",
      "प्राकृतिक रोशनी में फोटो लें",
    ],
    illustrationIcon: "ArrowUpLeft",
  },
  {
    id: "mid_canopy",
    name: "3. Mid Canopy Structure",
    nameHi: "3. मध्य छत्र दृश्य",
    shortDesc: "Top-down 45° canopy density and foliage structure",
    shortDescHi: "ऊपर से 45° कोण पर पत्तियों व फसल छत्र की संरचना",
    instructions:
      "Position camera 1 meter above the crop canopy looking down at a 45° angle. Frame multiple crop rows to assess foliage density and lodging.",
    instructionsHi:
      "कैमरे को फसल के ऊपर 1 मीटर की दूरी पर 45° कोण पर रखें। पत्तियों के फैलाव और झुकाव का आकलन करने के लिए कई कतारों को लें।",
    tips: [
      "Capture 3–4 plant rows in the frame",
      "Focus on the middle leaf tier",
      "Hold device steady to prevent motion blur",
    ],
    tipsHi: [
      "फ्रेम में 3-4 कतारों को शामिल करें",
      "मध्यम पत्तियों पर फोकस रखें",
      "धुंधलेपन से बचने के लिए फोन को स्थिर रखें",
    ],
    illustrationIcon: "Scan",
  },
  {
    id: "right_context",
    name: "4. Right Context Angle",
    nameHi: "4. दायाँ संदर्भ कोण",
    shortDesc: "Right angle showing row spacing and soil condition",
    shortDescHi: "कतारों की दूरी और मिट्टी की स्थिति दर्शाने वाला दायाँ कोण",
    instructions:
      "Stand at a 45° angle to the right of the damaged spot. Capture furrow lines, soil moisture, and rightward spread of the damage.",
    instructionsHi:
      "क्षतिग्रस्त स्थान के दाईं ओर 45° कोण पर खड़े हों। कतारों के बीच की जगह, मिट्टी की नमी और दाईं ओर क्षति के फैलाव को कैप्चर करें।",
    tips: [
      "Include furrow base and lower stem bases",
      "Check that ground is clearly focused",
      "Ensure no foot shadow casts over the plants",
    ],
    tipsHi: [
      "कतारों का निचला हिस्सा और तने का आधार दिखाएं",
      "सुनिश्चित करें कि जमीन स्पष्ट फोकस में है",
      "पौधों पर अपनी परछाई न आने दें",
    ],
    illustrationIcon: "ArrowUpRight",
  },
  {
    id: "closeup_damage",
    name: "5. Close-up Damage Macro",
    nameHi: "5. क्षति का नज़दीकी दृश्य (मैक्रो)",
    shortDesc: "Macro detail of lesions, pests, or broken stems",
    shortDescHi: "रोग के धब्बे, कीट या टूटे तनों का नज़दीकी विवरण",
    instructions:
      "Bring camera 15–30 cm close to the most severely damaged leaf, stem, or earhead. Ensure crisp focus on pathogen signs or pest bites.",
    instructionsHi:
      "कैमरे को सबसे अधिक प्रभावित पत्ती, तने या बाली से 15-30 सेमी की दूरी पर लाएं। रोग के लक्षणों या कीट क्षति पर स्पष्ट फोकस करें।",
    tips: [
      "Tap screen to lock focus on the infected spot",
      "Avoid touching or disturbing the plant",
      "Ensure bright, even light without harsh shadows",
    ],
    tipsHi: [
      "संक्रमित हिस्से पर फोकस लॉक करने के लिए स्क्रीन पर टैप करें",
      "पौधे को हिलाए बिना स्थिर रखकर फोटो लें",
      "पर्याप्त रोशनी में फोटो लें",
    ],
    illustrationIcon: "ZoomIn",
  },
];

export const farmerTranslations = {
  en: {
    // Nav & Shell
    appName: "FasalPramaan Farmer Portal",
    tagline: "Smart Crop Evidence & Insurance Protection",
    kisanId: "Kisan ID",
    home: "Home",
    claims: "My Claims",
    newClaim: "New Claim",
    reminders: "Timeline",
    captureStudio: "Guided 5-Angle Studio",
    switchLanguage: "हिन्दी",
    offlineNotice: "Working in Offline Mode. Captures will auto-sync when online.",
    onlineNotice: "Connected to PMFBY / State Insurance Network",

    // Dashboard Home
    greeting: "Welcome, Kisan Brother",
    dashboardSub: "Capture GPS-verified photo evidence for instant crop loss claims and 30-day growth verification.",
    quickActionNewClaim: "New Crop Damage Claim",
    quickActionNewClaimSub: "Guided 5-angle photo capture with instant AI loss estimate",
    registeredPlots: "Registered Farm Plots",
    activeClaims: "Active Insurance Claims",
    upcomingReminders: "30-Day Growth Reminders",
    attentionRequired: "Action Required: Evidence Recapture Requested",
    attentionSub: "An insurance reviewer has requested clear re-captures for specific angles.",
    startRecaptureNow: "Start Targeted Recapture",
    viewAllClaims: "View All Claims",
    viewTimeline: "View Growth Timeline",

    // Stat Cards
    statPlots: "Registered Plots",
    statClaims: "Claims Filed",
    statVerified: "Claims Verified",
    statPendingAction: "Needs Action",

    // Plot Card
    khasra: "Khasra",
    area: "Area",
    soil: "Soil",
    irrigation: "Irrigation",
    currentCrop: "Current Crop",
    growthStage: "Stage",
    reportDamageOnPlot: "Report Damage",
    addStagePhoto: "Add Stage Photo",

    // Claims List
    filterAll: "All Claims",
    filterReview: "Under Review",
    filterAction: "Needs Action",
    filterVerified: "Verified",
    filterDraft: "Drafts",
    searchClaims: "Search by Claim ID, crop, or plot...",
    noClaimsFound: "No claims match your filter.",
    submittedOn: "Submitted on",
    claimId: "Claim ID",
    crop: "Crop",
    damageType: "Damage Detected",
    lossEstimate: "Estimated Severity",
    viewDetails: "View Details",
    resumeDraft: "Resume Draft",

    // Claim Status Badges
    statusVerified: "Verified",
    statusNeedsRecapture: "Needs Recapture",
    statusUnderReview: "Under Review",
    statusDraft: "Draft Saved",
    statusSubmitted: "Submitted",

    // Claim Detail View
    backToClaims: "Back to My Claims",
    claimOverview: "Claim Assessment & Verification",
    reviewerFeedback: "Official Assessment Feedback",
    recaptureAlertTitle: "Targeted Recapture Requested",
    recaptureAlertDesc:
      "The reviewing officer requires fresh photos for the highlighted angles to complete your claim approval.",
    startTargetedRecaptureCTA: "Start Targeted Recapture Now",
    evidenceTrustScore: "Evidence Trust Confidence",
    trustQuality: "Image Quality",
    trustCoverage: "5-Angle Coverage",
    trustContext: "GPS & Plot Match",
    trustIntegrity: "Tamper Proof Hash",
    aiPredictionTitle: "AI Crop Damage Assessment",
    cropIdentified: "Crop Identified",
    variety: "Variety",
    detectedCondition: "Primary Condition",
    severityScore: "Loss Severity",
    affectedArea: "Estimated Affected Area",
    recommendedPayout: "Estimated Claim Eligibility",
    capturedEvidencePhotos: "Submitted 5-Angle Evidence",
    captureTimestamp: "Captured",
    sha256Hash: "SHA-256 Digest",
    gpsLocation: "GPS Coordinates",

    // 5-Angle Capture Studio
    studioTitle: "Guided 5-Angle Crop Capture Studio",
    studioSub: "Follow the 5 canonical camera angles for verifiable insurance evidence.",
    targetedModeNotice: "Targeted Recapture Mode active. Only requested angles need to be submitted.",
    switchCamera: "Flip Camera",
    takePhoto: "Capture Angle",
    retakePhoto: "Retake Photo",
    uploadFallback: "Upload from Gallery / File",
    cameraUnavailable: "Camera stream unavailable or permission denied. Please use file upload fallback below.",
    gpsStatus: "GPS Geofence Status",
    gpsAccurate: "High Accuracy GPS Fix",
    gpsLow: "Waiting for High Precision Fix...",
    gpsSimulated: "Field Centroid Geofenced",
    farmerObservationsLabel: "Farmer Voice / Written Observations",
    farmerObservationsPlaceholder: "Describe how damage occurred (e.g., sudden hailstorm on Thursday evening, pest attack spreading from east boundary)...",
    voiceDictationStart: "Speak in Hindi / English (Voice Note)",
    voiceDictationListening: "Listening... Speak now",
    voiceDictationSimulate: "Add Sample Voice Note",
    angleCaptured: "Angle Captured",
    saveDraftBtn: "Save Draft",
    submitClaimBtn: "Submit Verified Claim",
    submitting: "Submitting & Hashing Evidence...",
    captureAllRequired: "Please capture all required angles before final submission.",
    draftSavedMsg: "Draft saved to this device successfully!",

    // Reminders & Timeline
    remindersTitle: "30-Day Crop Growth Timeline",
    remindersSub: "Upload regular seasonal growth photos every 30 days to build a tamper-proof digital baseline for maximum insurance claim speed.",
    nextDueBadge: "Next Photo Due",
    daysRemaining: "days remaining",
    overdueBadge: "Overdue",
    completedBadge: "Completed",
    snoozeReminder: "Remind me in 3 days",
    captureMilestoneNow: "Take Growth Photo",
    cycleWheat: "Rabi Wheat 2025-26",
    cycleMustard: "Rabi Mustard 2025-26",
    reminderFrequency: "Reminder Frequency",
    reminderFrequency30: "Every 30 Days (Standard PMFBY)",
    reminderNotificationChannels: "Alert Channels",
    smsAlerts: "SMS Notifications",
    whatsappAlerts: "WhatsApp Reminders",
  },
  hi: {
    // Nav & Shell
    appName: "फसल प्रमाण किसान पोर्टल",
    tagline: "डिजिटल फसल साक्ष्य और पारदर्शी बीमा सुरक्षा",
    kisanId: "किसान आईडी",
    home: "मुख्य पृष्ठ",
    claims: "मेरे दावे",
    newClaim: "नया दावा",
    reminders: "समय सीमा",
    captureStudio: "मार्गदर्शित 5-कोण स्टूडियो",
    switchLanguage: "English",
    offlineNotice: "ऑफ़लाइन मोड में कार्य कर रहे हैं। इंटरनेट आने पर स्वचालित रूप से सिंक होगा।",
    onlineNotice: "पीएमएफबीवाई / राज्य बीमा नेटवर्क से जुड़ा हुआ है",

    // Dashboard Home
    greeting: "नमस्ते, किसान भाई",
    dashboardSub: "फसल क्षति का त्वरित दावा करने और 30-दिवसीय विकास साक्ष्य हेतु जीपीएस-सत्यापित 5-कोण फोटो लें।",
    quickActionNewClaim: "नया फसल क्षति दावा दर्ज करें",
    quickActionNewClaimSub: "मार्गदर्शित 5-कोण फोटो स्टूडियो द्वारा तुरंत AI क्षति अनुमान प्राप्त करें",
    registeredPlots: "पंजीकृत खेत (भूखंड)",
    activeClaims: "सक्रिय फसल बीमा दावे",
    upcomingReminders: "30-दिवसीय विकास साक्ष्य अनुस्मारक",
    attentionRequired: "कार्रवाई आवश्यक: पुनः फोटो अनुरोध",
    attentionSub: "बीमा अधिकारी ने दावे के सत्यापन हेतु कुछ विशिष्ट कोणों की पुनः फोटो मांगी है।",
    startRecaptureNow: "लक्षित पुनः फोटो लें",
    viewAllClaims: "सभी दावे देखें",
    viewTimeline: "विकास समय-सीमा देखें",

    // Stat Cards
    statPlots: "पंजीकृत खेत",
    statClaims: "कुल दावे",
    statVerified: "सत्यापित दावे",
    statPendingAction: "कार्रवाई लंबित",

    // Plot Card
    khasra: "खसरा नं.",
    area: "क्षेत्रफल",
    soil: "मिट्टी का प्रकार",
    irrigation: "सिंचाई",
    currentCrop: "वर्तमान फसल",
    growthStage: "अवस्था",
    reportDamageOnPlot: "क्षति दर्ज करें",
    addStagePhoto: "साक्ष्य फोटो जोड़ें",

    // Claims List
    filterAll: "सभी दावे",
    filterReview: "समीक्षाधीन",
    filterAction: "पुनः फोटो आवश्यक",
    filterVerified: "सत्यापित",
    filterDraft: "प्रारूप",
    searchClaims: "दावा संख्या, फसल या खेत से खोजें...",
    noClaimsFound: "इस फ़िल्टर में कोई दावा नहीं मिला।",
    submittedOn: "जमा करने की तिथि",
    claimId: "दावा संख्या",
    crop: "फसल",
    damageType: "पाई गई क्षति",
    lossEstimate: "अनुमानित गंभीरता",
    viewDetails: "विवरण देखें",
    resumeDraft: "प्रारूप पूरा करें",

    // Claim Status Badges
    statusVerified: "सत्यापित (स्वीकृत)",
    statusNeedsRecapture: "पुनः फोटो आवश्यक",
    statusUnderReview: "समीक्षा जारी",
    statusDraft: "प्रारूप सहेजा गया",
    statusSubmitted: "जमा किया गया",

    // Claim Detail View
    backToClaims: "दावों की सूची पर वापस जाएँ",
    claimOverview: "दावा मूल्यांकन एवं सत्यापन स्थिति",
    reviewerFeedback: "बीमा अधिकारी की समीक्षा टिप्पणी",
    recaptureAlertTitle: "लक्षित पुनः फोटो (रिकैप्चर) आवश्यक",
    recaptureAlertDesc:
      "अधिकारी को दावे को अंतिम स्वीकृति देने के लिए नीचे दिए गए विशिष्ट कोणों की स्पष्ट फोटो की आवश्यकता है।",
    startTargetedRecaptureCTA: "अभी लक्षित पुनः फोटो स्टूडियो खोलें",
    evidenceTrustScore: "साक्ष्य विश्वसनीयता व प्रामाणिकता",
    trustQuality: "फोटो गुणवत्ता",
    trustCoverage: "5-कोण कवरेज",
    trustContext: "जीपीएस व खेत मिलान",
    trustIntegrity: "डिजिटल अखंडता (हैश)",
    aiPredictionTitle: "AI फसल क्षति विश्लेषण",
    cropIdentified: "पहचानी गई फसल",
    variety: "किस्म",
    detectedCondition: "मुख्य रोग / आपदा",
    severityScore: "क्षति की गंभीरता",
    affectedArea: "प्रभावित क्षेत्रफल",
    recommendedPayout: "अनुमानित दावा पात्रता",
    capturedEvidencePhotos: "जमा किए गए 5-कोण साक्ष्य",
    captureTimestamp: "कैप्चर समय",
    sha256Hash: "SHA-256 हैश",
    gpsLocation: "जीपीएस निर्देशांक",

    // 5-Angle Capture Studio
    studioTitle: "मार्गदर्शित 5-कोण फसल फोटो स्टूडियो",
    studioSub: "बीमा स्वीकृति के लिए आवश्यक 5 प्रमाणिक कोणों से स्पष्ट फोटो लें।",
    targetedModeNotice: "लक्षित पुनः फोटो मोड सक्रिय है। केवल अनुरोधित कोणों की फोटो लेना आवश्यक है।",
    switchCamera: "कैमरा बदलें",
    takePhoto: "फोटो लें",
    retakePhoto: "दोबारा फोटो लें",
    uploadFallback: "गैलरी / फ़ाइल से अपलोड करें",
    cameraUnavailable: "कैमरा उपलब्ध नहीं है या अनुमति नहीं मिली। कृपया नीचे दिए गए फ़ाइल अपलोड का उपयोग करें।",
    gpsStatus: "जीपीएस सटीकता स्थिति",
    gpsAccurate: "उच्च सटीकता जीपीएस फिक्स",
    gpsLow: "जीपीएस सिग्नल प्राप्त हो रहा है...",
    gpsSimulated: "खेत का केंद्र जीपीएस सत्यापित",
    farmerObservationsLabel: "किसान की आवाज / लिखित विवरण",
    farmerObservationsPlaceholder: "बताएं कि नुकसान कैसे हुआ (जैसे: गुरुवार रात अचानक ओलावृष्टि, पत्तियों पर पीलापन फैलना)...",
    voiceDictationStart: "बोलकर दर्ज करें (वॉइस नोट)",
    voiceDictationListening: "सुन रहे हैं... कृपया बोलें",
    voiceDictationSimulate: "नमूना वॉइस नोट जोड़ें",
    angleCaptured: "कोण कैप्चर हो गया",
    saveDraftBtn: "प्रारूप सहेजें",
    submitClaimBtn: "सत्यापित दावा जमा करें",
    submitting: "साक्ष्य हैश व जमा हो रहा है...",
    captureAllRequired: "कृपया अंतिम सबमिशन से पहले सभी आवश्यक कोणों की फोटो लें।",
    draftSavedMsg: "प्रारूप इस डिवाइस पर सुरक्षित सहेज लिया गया है!",

    // Reminders & Timeline
    remindersTitle: "30-दिवसीय फसल विकास समय-सीमा",
    remindersSub: "प्रत्येक 30 दिन में फसल की प्रगति फोटो अपलोड करें ताकि आपदा के समय त्वरित दावा भुगतान प्राप्त हो सके।",
    nextDueBadge: "आगामी फोटो देय",
    daysRemaining: "दिन शेष",
    overdueBadge: "समय सीमा पार",
    completedBadge: "पूर्ण",
    snoozeReminder: "3 दिन बाद याद दिलाएं",
    captureMilestoneNow: "विकास साक्ष्य फोटो लें",
    cycleWheat: "रबी गेहूं 2025-26",
    cycleMustard: "रबी सरसों 2025-26",
    reminderFrequency: "अनुस्मारक आवृत्ति",
    reminderFrequency30: "प्रत्येक 30 दिन (पीएमएफबीवाई मानक)",
    reminderNotificationChannels: "सूचना माध्यम",
    smsAlerts: "एसएमएस संदेश",
    whatsappAlerts: "व्हाट्सएप अलर्ट",
  },
} as const;

export function getFarmerT(lang: FarmerLang) {
  if (lang === "hi") return farmerTranslations.hi;
  return farmerTranslations.en;
}
