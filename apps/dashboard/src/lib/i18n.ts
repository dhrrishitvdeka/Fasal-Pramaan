export type Lang = "en" | "hi";

const dict = {
  en: {
    appName: "FasalPramaan Command Centre",
    tagline: "Capture. Verify. Protect.",
    login: "Sign in",
    email: "Email",
    password: "Password",
    overview: "Overview",
    map: "Live map",
    review: "Review queue",
    analytics: "Analytics",
    alerts: "Alerts",
    admin: "Administration",
    health: "System health",
    audit: "Audit logs",
    logout: "Sign out",
    pendingReview: "Pending review",
    highSeverity: "High severity",
    verified: "Verified",
    accept: "Accept AI result",
    correct: "Correct & verify",
    recapture: "Request recapture",
    inspection: "Physical inspection",
    overrideReason: "Override reason (required)",
    disclaimer:
      "AI predictions are assistive and non-production by default. Human review is required for insurance decisions.",
  },
  hi: {
    appName: "फसल प्रमाण कमांड सेंटर",
    tagline: "हर फसल का डिजिटल प्रमाण",
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
      "AI भविष्यवाणियाँ सहायक हैं और डिफ़ॉल्ट रूप से गैर-उत्पादन हैं। बीमा निर्णयों के लिए मानवीय समीक्षा आवश्यक है।",
  },
} as const;

export type DictKey = keyof (typeof dict)["en"];

export function t(lang: Lang, key: DictKey): string {
  return dict[lang][key] || dict.en[key];
}
