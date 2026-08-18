import type { AppLang } from "./live-indian-languages";

export type Lang = AppLang;

const dict = {
  en: {
    appName: "FasalPramaan Command Centre",
    farmerAppName: "FasalPramaan Farmer Portal",
    tagline: "Capture. Verify. Protect.",
    hindiBrand: "फसल प्रमाण",
    portalReviewer: "Reviewer Centre",
    portalFarmer: "Farmer Portal",
    portalShowcase: "Home",
    login: "Sign in",
    email: "Official Email",
    password: "Password",
    overview: "Overview",
    map: "Live Map",
    review: "Review Queue",
    analytics: "Analytics",
    alerts: "Alerts",
    admin: "Administration",
    health: "System Health",
    audit: "Audit Logs",
    logout: "Sign out",
    pendingReview: "Pending Review",
    highSeverity: "High Severity",
    verified: "Verified",
    accept: "Accept AI Result",
    correct: "Correct & Verify",
    recapture: "Request Recapture",
    inspection: "Physical Inspection",
    overrideReason: "Override Reason (required)",
    disclaimer:
      "AI predictions are assistive and non-production by default. Human review is required for insurance decisions under PMFBY guidelines.",
    
    // Showcase & Landing Page
    heroHeadline: "Verifiable Crop Evidence. Explainable AI Assessment. Instant Human Triage.",
    heroSubheadline:
      "A next-generation PMFBY crop loss assessment ecosystem combining 5-angle structured evidence capture, cryptographic integrity verification, multi-modal Vision AI, and adaptive single-photo recapture protocols.",
    launchFarmer: "Launch Farmer Web Portal",
    launchReviewer: "Launch Reviewer Command Centre",
    exploreScenarios: "Explore 6 Canonical Demo Scenarios",
    architectureTitle: "Autonomous Evidence Verification Architecture",
    architectureSub: "From farmer smartphone to PMFBY insurance settlement without black-box opacity",
    canonicalTitle: "6 Canonical MUN Interactive Scenarios",
    canonicalSub: "One-click interactive test scenarios representing real-world field situations and edge cases",
    inspectInReviewer: "Inspect in Reviewer Centre →",
    inspectInFarmer: "Experience as Farmer →",
    launchAllQueue: "View All in Review Queue →",

    // Farmer Portal
    farmerWelcome: "Farmer Self-Service Claim Portal",
    farmerSub: "File claims, view 5-angle photo guidelines, track AI verification, and resolve targeted recaptures.",
    fileNewClaim: "File New Crop Claim",
    myClaims: "My Land Parcels & Claims",
    recaptureTasks: "Pending Recapture Tasks",
    cropDoctor: "AI Crop Doctor & Advisory",
    captureStep1: "1. Wide Field View",
    captureStep2: "2. Left Plot Context",
    captureStep3: "3. Mid-Canopy View",
    captureStep4: "4. Right Plot Context",
    captureStep5: "5. Close-up Macro Damage",
    uploadSimulate: "Simulate 5-Angle Capture",
    submitClaim: "Submit Claim with Cryptographic Seal",
  },
  hi: {
    appName: "फसल प्रमाण कमांड सेंटर",
    farmerAppName: "फसल प्रमाण किसान पोर्टल",
    tagline: "हर फसल का डिजिटल प्रमाण · पारदर्शी दावा निपटान",
    hindiBrand: "फसल प्रमाण",
    portalReviewer: "समीक्षक केंद्र",
    portalFarmer: "किसान पोर्टल",
    portalShowcase: "होम",
    login: "साइन इन",
    email: "ईमेल",
    password: "पासवर्ड",
    overview: "सारांश",
    map: "मानचित्र",
    review: "समीक्षा कतार",
    analytics: "विश्लेषण",
    alerts: "अलर्ट",
    admin: "प्रशासन",
    health: "सिस्टम स्वास्थ्य",
    audit: "ऑडिट लॉग",
    logout: "साइन आउट",
    pendingReview: "समीक्षा लंबित",
    highSeverity: "उच्च गंभीरता",
    verified: "सत्यापित",
    accept: "AI परिणाम स्वीकारें",
    correct: "सुधारें और सत्यापित करें",
    recapture: "पुनः कैप्चर अनुरोध",
    inspection: "भौतिक निरीक्षण",
    overrideReason: "ओवरराइड कारण (आवश्यक)",
    disclaimer:
      "AI भविष्यवाणियाँ सहायक हैं और डिफ़ॉल्ट रूप से गैर-उत्पादन हैं। PMFBY दिशानिर्देशों के तहत बीमा निर्णयों के लिए मानवीय समीक्षा आवश्यक है।",

    // Showcase & Landing Page
    heroHeadline: "सत्यापन योग्य फसल प्रमाण। पारदर्शी AI आकलन। त्वरित मानवीय समीक्षा।",
    heroSubheadline:
      "PMFBY फसल बीमा के लिए आधुनिक समाधान: 5-कोण संरचित साक्ष्य कैप्चर, क्रिप्टोग्राफिक सत्यनिष्ठा सुरक्षा, मल्टी-मॉडल विज़न AI और लक्षित एकल-फोटो पुनः कैप्चर प्रोटोकॉल।",
    launchFarmer: "किसान वेब पोर्टल खोलें",
    launchReviewer: "समीक्षक कमांड सेंटर खोलें",
    exploreScenarios: "6 प्रामाणिक डेमो परिदृश्य देखें",
    architectureTitle: "स्वायत्त साक्ष्य सत्यापन आर्किटेक्चर",
    architectureSub: "किसान के स्मार्टफोन से PMFBY बीमा निपटान तक पूर्ण पारदर्शिता",
    canonicalTitle: "6 प्रामाणिक MUN इंटरैक्टिव परिदृश्य",
    canonicalSub: "वास्तविक क्षेत्रीय स्थितियों और मामलों का 1-क्लिक इंटरैक्टिव परीक्षण",
    inspectInReviewer: "समीक्षक केंद्र में जांचें →",
    inspectInFarmer: "किसान के रूप में अनुभव करें →",
    launchAllQueue: "सभी समीक्षा कतार में देखें →",

    // Farmer Portal
    farmerWelcome: "किसान स्व-सेवा दावा पोर्टल",
    farmerSub: "दावा दर्ज करें, 5-कोण फोटो गाइड देखें, AI सत्यापन ट्रैक करें और पुनः कैप्चर कार्य पूरा करें।",
    fileNewClaim: "नया फसल नुकसान दावा दर्ज करें",
    myClaims: "मेरे भूखंड एवं दावे",
    recaptureTasks: "लंबित पुनः कैप्चर कार्य",
    cropDoctor: "AI किसान सलाहकार (फसल डॉक्टर)",
    captureStep1: "1. विस्तृत क्षेत्र दृश्य (Wide)",
    captureStep2: "2. बायां भूखंड संदर्भ (Left)",
    captureStep3: "3. मध्य कैनोपी दृश्य (Mid)",
    captureStep4: "4. दायां भूखंड संदर्भ (Right)",
    captureStep5: "5. क्लोज़-अप सूक्ष्म क्षति (Closeup)",
    uploadSimulate: "5-कोण फोटो कैप्चर सिमुलेशन",
    submitClaim: "क्रिप्टोग्राफिक मुहर के साथ दावा जमा करें",
  },
} as const;

export type DictKey = keyof (typeof dict)["en"];

export function t(lang: Lang, key: DictKey): string {
  const table = lang === "hi" ? dict.hi : dict.en;
  return table[key] || dict.en[key];
}
