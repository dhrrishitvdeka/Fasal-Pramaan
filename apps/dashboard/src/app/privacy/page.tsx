"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/LanguageContext";
import { ShieldCheck, Lock, Eye, FileText, Database, Server, RefreshCw } from "lucide-react";

const SECTIONS = [
  {
    icon: Database,
    enTitle: "1. Information We Collect",
    hiTitle: "1. एकत्र की जाने वाली जानकारी",
    en: [
      "Field Photographic Evidence: High-resolution multi-angle photographs captured during claim submission, including wide-field, canopy, and close-up views.",
      "Cryptographic Signatures: Client-side SHA-256 integrity hashes computed for every image at capture time to guarantee non-tampering.",
      "Geolocation & Cadastral Mapping: Precise GPS coordinates (latitude, longitude, horizontal accuracy radius in meters), capture timestamp, and cadastral plot boundary correlations.",
      "Farmer & Claim Declarations: Farmer profile name, contact credentials, plot ID, crop genus (e.g., Wheat, Paddy, Mustard), sowing date, peril category (e.g., Flood, Fire, Drought), and conversational notes recorded via Fasal Saathi (voice/text).",
      "Triangulation Telemetry: Independent remote sensing data (Copernicus Sentinel-2 NDVI indices), IMD meteorological archives (precipitation, wind speed, hail codes), and ISRO Bhuvan land use datasets.",
    ],
    hi: [
      "खेत साक्ष्य तस्वीरें: दावा जमा करते समय लिए गए विभिन्न कोणों के उच्च-रिज़ॉल्यूशन फ़ोटो (विस्तृत खेत, छत्र और नज़दीकी क्षति कोण)।",
      "क्रिप्टोग्राफ़िक हस्ताक्षर: फ़ोटो लेते ही क्लाइंट-साइड गणना किया गया SHA-256 हैश, जिससे डेटा छेड़छाड़ से सुरक्षित रहता है।",
      "GPS एवं भू-स्थानिक डेटा: सटीक GPS निर्देशांक (अक्षांश, देशांतर, सटीकता त्रिज्या), समय-मुद्रांक और पंजीकृत खसरा/खेत सीमा मिलान।",
      "किसान एवं फसल घोषणाएँ: किसान का नाम, संपर्क विवरण, प्लॉट संख्या, फसल प्रकार, बुवाई तिथि, आपदा श्रेणी (बाढ़, सूखा, आग आदि), और फसल साथी के माध्यम से दर्ज विवरण।",
      "स्वतंत्र सत्यापन डेटा: कोपरनिकस सेंटिनल-2 उपग्रह सूचकांक (NDVI/जले निशान), मौसम विभाग (IMD) का वर्षा/हवा डेटा और इसरो भुवन भूमि उपयोग डेटा।",
    ],
  },
  {
    icon: Eye,
    enTitle: "2. Purpose of Data Processing",
    hiTitle: "2. डेटा प्रसंस्करण का उद्देश्य",
    en: [
      "Insurance Claim Adjudication: Verifying crop damage authenticity, assessing peril severity, and assisting authorized PMFBY insurance officers in making fair loss determinations.",
      "Multi-Signal Triangulation: Corroborating ground-level photographic evidence against meteorological weather anomalies and satellite remote sensing ground truth.",
      "Anti-Fraud & Quality Assurance: Detecting synthetic/AI-generated images, recycled photos, incorrect crop species, and out-of-boundary submissions.",
      "Farmer Guidance: Providing real-time camera framing feedback and generating targeted recapture requests when evidence is incomplete or blurry.",
    ],
    hi: [
      "बीमा दावा निपटान: फसल क्षति की सत्यता जांचना, नुकसान का स्तर मापना और बीमा अधिकारियों को त्वरित व न्यायसंगत निर्णय लेने में सहायता करना।",
      "बहु-संकेत मिलान: मैदानी तस्वीरों की पुष्टि स्वतंत्र मौसम आंकड़ों और उपग्रह चित्रों के माध्यम से करना।",
      "धोखाधड़ी रोकथाम एवं गुणवत्ता: एआई-जनित नकली तस्वीरों, पुराने फ़ोटो, गलत फसल या खेत के बाहर की तस्वीरों की समय पर पहचान करना।",
      "किसान सहायता: फोटो लेते समय ऑन-डिवाइस मार्गदर्शन देना और आवश्यक होने पर लक्षित पुनः फोटो का स्वतः अनुरोध करना।",
    ],
  },
  {
    icon: Server,
    enTitle: "3. Artificial Intelligence & Automated Processing",
    hiTitle: "3. कृत्रिम बुद्धिमत्ता (AI) एवं स्वचालित प्रसंस्करण",
    en: [
      "On-Device Vision Analysis: Lightweight neural models (MobileNet) and image processing heuristics run locally in your browser's Web Worker to evaluate blur and lighting at capture time. Real-time preview frames are never uploaded to any server.",
      "Authenticity Vision Gate: Final submitted photographs are screened via secure API using Google Gemini to verify crop presence and reject non-agricultural, synthetic, or indoor imagery.",
      "Neural Crop Model: Deep vision networks (DINOv2 / ViT) hosted on secure cloud infrastructure screen for crop genus classification and compute damage severity percentages.",
      "Assistive AI Principle: AI scores and confidence metrics operate solely as assistive decision-support for human claim officers. No claim is ever automatically rejected or approved by AI without human authorization.",
    ],
    hi: [
      "ऑन-डिवाइस विज़न विश्लेषण: कैमरे के रीयल-टाइम पूर्वावलोकन की जाँच आपके फ़ोन/ब्राउज़र पर स्थानीय रूप से होती है। पूर्वावलोकन तस्वीरें सर्वर पर नहीं भेजी जातीं।",
      "प्रामाणिकता विज़न गेट: अंतिम रूप से जमा की गई फ़ोटो की जाँच गूगल जेमिनी एपीआई द्वारा की जाती है ताकि गैर-कृषि, नकली या अत्यधिक धुंधली फ़ोटो को रोका जा सके।",
      "न्यूरल क्रॉप मॉडल: सुरक्षित सर्वर पर होस्ट किए गए मॉडल फसल की प्रजाति और क्षति के प्रतिशत का तकनीकी आकलन करते हैं।",
      "सहायक एआई सिद्धांत: एआई केवल सहायक के रूप में कार्य करता है। किसी भी दावे को बिना अधिकृत मानवीय अधिकारी की अनुमति के स्वतः अस्वीकार या स्वीकृत नहीं किया जाता।",
    ],
  },
  {
    icon: Lock,
    enTitle: "4. Data Storage, Security & Sovereignty",
    hiTitle: "4. डेटा संग्रहण, सुरक्षा एवं संप्रभुता",
    en: [
      "Encrypted Storage: All uploaded evidence is stored in private, access-controlled cloud object storage with Row Level Security (RLS) policies enforcing role-based isolation.",
      "No Third-Party Advertising: We do not sell, rent, monetize, or share your personal information with commercial advertisers. No behavioral ad trackers or third-party marketing beacons are installed.",
      "Data Sovereignty: User data is hosted within secure cloud infrastructure compliant with Indian Data Residency requirements and ISO/IEC 27001 security standards.",
    ],
    hi: [
      "एन्क्रिप्टेड सुरक्षित संग्रहण: सभी साक्ष्य तस्वीरें निजी और सुरक्षित क्लाउड स्टोरेज में रो-लेवल सिक्योरिटी (RLS) के साथ सुरक्षित रहती हैं।",
      "विज्ञापन-मुक्त नीति: हम आपका डेटा किसी भी व्यावसायिक विज्ञापनदाता को नहीं बेचते और न ही कोई ट्रैकिंग कुकीज़ चलाते हैं।",
      "डेटा संप्रभुता: सभी डेटा भारत के डेटा सुरक्षा नियमों और मानकों के अनुरूप सुरक्षित डाटा केंद्रों में संग्रहीत किए जाते हैं।",
    ],
  },
  {
    icon: RefreshCw,
    enTitle: "5. Data Retention & Archival",
    hiTitle: "5. डेटा संरक्षण एवं प्रतिधारण अवधि",
    en: [
      "Active Claim Lifecycle: Evidence is retained during the active insurance assessment and dispute resolution window for the respective agricultural season.",
      "Statutory Audit Retention: As mandated by PMFBY guidelines and public audit norms, claim records and cryptographic hashes are archived for audit compliance (minimum 3 years).",
      "Account Deletion: Farmers may request profile data deletion or rectification of inaccurate land records through authorized portal administrators, subject to statutory insurance audit laws.",
    ],
    hi: [
      "सक्रिय दावा अवधि: संबंधित कृषि मौसम के दौरान दावा निपटारे और अपील अवधि तक साक्ष्य सक्रिय रूप से सुरक्षित रहता है।",
      "वैधानिक ऑडिट प्रतिधारण: पीएमएफबीवाई और सरकारी ऑडिट नियमों के तहत, दावा रिकॉर्ड कम से कम 3 वर्ष की वैधानिक अवधि के लिए सुरक्षित रखे जाते हैं।",
      "खाता व डेटा सुधार: किसान अपने प्रोफाइल विवरण में सुधार या विलोपन का अनुरोध अधिकृत पोर्टल प्रशासक के माध्यम से कर सकते हैं।",
    ],
  },
  {
    icon: ShieldCheck,
    enTitle: "6. Farmer Rights (DPDP Act, 2023)",
    hiTitle: "6. किसान अधिकार (डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम)",
    en: [
      "Right to Information: You have the right to access your submitted claim dossier, confidence scores, and review timeline.",
      "Right to Correction: You may correct inaccuracies in your registered land, crop, or personal details prior to final adjudication.",
      "Right to Grievance Redressal: If you have concerns regarding data privacy or automated screening findings, you may contact the grievance redressal officer.",
    ],
    hi: [
      "जानकारी का अधिकार: आपको अपने जमा किए गए दावे, स्कोर और समीक्षा स्थिति देखने का पूर्ण अधिकार है।",
      "सुधार का अधिकार: आप अंतिम निर्णय से पूर्व अपनी जमीन या फसल विवरण में त्रुटि सुधार करवा सकते हैं।",
      "शिकायत निवारण का अधिकार: डेटा गोपनीयता या तकनीकी निष्कर्षों पर किसी भी आपत्ति के लिए आप शिकायत निवारण अधिकारी से संपर्क कर सकते हैं।",
    ],
  },
];

export default function PrivacyPage() {
  const { lang } = useLanguage();
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Header */}
      <header className="border-b border-[var(--line)] pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="fp-kicker text-xs font-mono">Data Privacy &amp; Security</span>
          <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
            Privacy Focused
          </span>
          <span className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--ink-muted)]">
            Updated: August 2026
          </span>
        </div>

        <h1 className="mt-4 text-3xl font-serif tracking-tight text-[var(--ink)] sm:text-4xl">
          {lang === "hi" ? "गोपनीयता नीति" : "Privacy Policy & Data Protection"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)] sm:text-base">
          {lang === "hi"
            ? "यह नीति स्पष्ट करती है कि फसल-प्रमाण पोर्टल फसल साक्ष्य, जीपीएस स्थिति, एआई स्क्रीनिंग और दावा रिकॉर्ड को किस प्रकार सुरक्षित और पारदर्शी रूप से संसाधित करता है।"
            : "This policy details how the Fasal-Pramaan platform collects, processes, and protects photographic evidence, geolocation data, multimodal AI analytics, and claim records in compliance with digital privacy and data protection standards."}
        </p>
      </header>

      {/* Sections */}
      <div className="mt-10 space-y-10">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <section
              key={section.enTitle}
              className="border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7 shadow-2xs"
            >
              <div className="flex items-center gap-3 border-b border-[var(--line)] pb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[var(--canvas)] text-[var(--ink)]">
                  <Icon className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-[var(--ink)]">
                  {lang === "hi" ? section.hiTitle : section.enTitle}
                </h2>
              </div>

              <ul className="mt-5 space-y-3 pl-2 text-xs leading-relaxed text-[var(--ink-muted)] sm:text-sm">
                {(lang === "hi" ? section.hi : section.en).map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Grievance Redressal Footer */}
      <section className="mt-10 rounded-sm border border-[var(--line)] bg-[var(--canvas)] p-6 text-xs text-[var(--ink-muted)] sm:text-sm">
        <h3 className="font-semibold text-[var(--ink)]">
          {lang === "hi" ? "शिकायत निवारण एवं संपर्क" : "Grievance Redressal & Contact"}
        </h3>
        <p className="mt-2 leading-relaxed">
          {lang === "hi"
            ? "डेटा संरक्षण अथवा तकनीकी साक्ष्य से संबंधित किसी भी प्रश्न हेतु, कृपया संपर्क करें:"
            : "For any questions regarding personal data protection, audit integrity, or grievance redressal, contact:"}
        </p>
        <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-[var(--ink)]">
          <span>Email: stellarie@duck.com</span>
        </div>
      </section>

      {/* Navigation Links */}
      <div className="mt-10 flex flex-wrap items-center justify-between border-t border-[var(--line)] pt-6 text-sm text-[var(--ink-muted)]">
        <Link href="/" className="fp-link font-medium">
          ← {lang === "hi" ? "होम पेज पर लौटें" : "Return to Home"}
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/terms" className="fp-link font-medium">
            {lang === "hi" ? "उपयोग की शर्तें →" : "Terms of Use →"}
          </Link>
        </div>
      </div>
    </div>
  );
}
