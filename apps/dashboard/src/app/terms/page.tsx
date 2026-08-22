"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/LanguageContext";
import { ShieldCheck, Scale, CheckSquare, AlertOctagon, UserCheck, HelpCircle, HardDrive } from "lucide-react";

const SECTIONS = [
  {
    icon: Scale,
    enTitle: "1. Acceptance of Terms & Eligibility",
    hiTitle: "1. नियमों की स्वीकृति एवं पात्रता",
    en: [
      "Binding Agreement: By accessing the Fasal-Pramaan platform, using the Fasal Saathi conversational assistant, or submitting field evidence, you agree to be bound by these Terms of Use and our Privacy Policy.",
      "Eligible Farmers & Users: This portal is intended for registered agricultural cultivators, landholders, tenant farmers, and authorized insurance/survey officers participating in the Pradhan Mantri Fasal Bima Yojana (PMFBY) or state crop relief programs.",
      "Representative Authority: If you are submitting on behalf of another farmer (e.g., via Common Service Centres / Kisan Mitras), you warrant that you hold legitimate consent and that all photographic evidence is captured directly at the farmer's registered parcel.",
    ],
    hi: [
      "बाध्यकारी समझौता: फसल-प्रमाण पोर्टल का उपयोग करने, फसल साथी से संवाद करने अथवा खेत साक्ष्य जमा करने पर आप इन उपयोग की शर्तों और गोपनीयता नीति से कानूनी रूप से बंधे हैं।",
      "पात्र किसान एवं उपयोगकर्ता: यह पोर्टल प्रधानमंत्री फसल बीमा योजना (PMFBY) अथवा राज्य फसल राहत योजनाओं में पंजीकृत किसानों, काश्तकारों, बटाईदारों एवं अधिकृत अधिकारियों के लिए है।",
      "प्रतिनिधि अधिकार: यदि आप किसी अन्य किसान की ओर से (जैसे सीएससी या किसान मित्र द्वारा) साक्ष्य जमा कर रहे हैं, तो आप प्रमाणित करते हैं कि आपके पास वैध सहमति है और तस्वीरें उसी किसान के वास्तविक खेत से ली गई हैं।",
    ],
  },
  {
    icon: AlertOctagon,
    enTitle: "2. Evidence Authenticity & Anti-Fraud Obligations",
    hiTitle: "2. साक्ष्य प्रामाणिकता एवं धोखाधड़ी-रोधी दायित्व",
    en: [
      "Genuine Field Evidence: All photographs, video frames, and geolocation coordinates must be captured live from the applicant's registered agricultural field at the time of crop peril occurrence.",
      "Strict Prohibition of Fake Imagery: You may not upload AI-generated/synthetic images, screenshots, recycled photos from previous seasons, images from other plots, or digitally manipulated files.",
      "Legal Repercussions of Fraud: Submitting fabricated, tampered, or staged evidence constitutes insurance fraud under the Bharatiya Nyaya Sanhita, 2023 / Indian Penal Code, 1860, and the Information Technology Act, 2000, and will result in immediate claim forfeiture and formal legal prosecution.",
      "Cryptographic Auditing: Every uploaded photo generates a client-side SHA-256 hash and immutable timestamp, creating an auditable chain of custody for statutory investigation.",
    ],
    hi: [
      "सच्चा मैदानी साक्ष्य: सभी तस्वीरें और GPS निर्देशांक नुकसान के समय आवेदक के अपने पंजीकृत खेत से सीधे कैमरे द्वारा लिए जाने चाहिए।",
      "नकली या भ्रामक तस्वीरों पर पूर्ण प्रतिबंध: एआई-जनित (सिंथेटिक) फ़ोटो, स्क्रीनशॉट, पिछले सीज़न की पुरानी तस्वीरें या संपादित फ़ाइलें अपलोड करना सख्त वर्जित है।",
      "धोखाधड़ी पर कानूनी कार्रवाई: जानबूझकर गलत, पुरानी या मंचित साक्ष्य जमा करना बीमा धोखाधड़ी है। ऐसा करने पर दावा तुरंत निरस्त होगा और भारतीय न्याय संहिता तथा आईटी एक्ट के तहत कानूनी कार्रवाई की जाएगी।",
      "क्रिप्टोग्राफ़िक ऑडिट: प्रत्येक फ़ोटो का SHA-256 हैश और समय-मुद्रांक तैयार होता है, जिससे किसी भी प्रकार की छेड़छाड़ तुरंत पकड़ी जाती है।",
    ],
  },
  {
    icon: UserCheck,
    enTitle: "3. Assistive AI & Human-in-the-Loop Adjudication",
    hiTitle: "3. सहायक AI एवं मानवीय निर्णय शासन",
    en: [
      "Advisory Decision Support: Computer vision models (MobileNet, DINOv2), the Gemini vision gate, multi-signal weather indices, and composite confidence scores operate strictly as assistive decision support for insurance assessors.",
      "No Fully Automated Claim Denial or Payout: AI algorithms do not possess independent authority to approve or deny insurance claims. Every final decision—acceptance, loss assessment adjustment, or field survey dispatch—is executed by an authorized human claim officer.",
      "Officer Override: Authorized reviewers retain full legal discretion to inspect high-resolution photographs, override automated authenticity gate flags with auditable rationale, or order physical Joint Committee field inspections.",
    ],
    hi: [
      "सलाहकारी निर्णय सहायता: कंप्यूटर विज़न मॉडल, जेमिनी विज़न गेट, उपग्रह सूचकांक और कॉन्फिडेंस स्कोर केवल बीमा अधिकारियों की सहायता हेतु तकनीकी उपकरण हैं।",
      "कोई स्वचालित अस्वीकृति या भुगतान नहीं: एआई प्रणाली अपने स्तर पर दावों को स्वीकृत या निरस्त नहीं करती। प्रत्येक अंतिम निर्णय अधिकृत मानवीय बीमा अधिकारी द्वारा ही लिया जाता है।",
      "अधिकारी का विशेषाधिकार: अधिकारियों के पास तस्वीरों की विस्तृत जाँच करने, कारण दर्ज करते हुए तकनीकी चेतावनी को बदलने, या भौतिक फील्ड निरीक्षण भेजने का पूर्ण अधिकार है।",
    ],
  },
  {
    icon: CheckSquare,
    enTitle: "4. Adaptive Recapture & Farmer Cooperation",
    hiTitle: "4. अनुकूल पुनः फोटो एवं किसान सहयोग",
    en: [
      "Targeted Recapture Requests: If initial evidence is deemed incomplete, blurry, or missing mandatory angles (e.g., close-up of pest lesion or standing flood water line), the platform will generate a targeted recapture request.",
      "Timely Submission: Farmers agree to capture and submit requested supplementary angles within the stipulated intimation window (typically within 72 hours of damage occurrence under PMFBY guidelines).",
      "Status Preservation: Fulfilling a recapture request updates the existing claim record without resetting priority in the review queue.",
    ],
    hi: [
      "लक्षित पुनः फोटो का अनुरोध: यदि शुरुआती साक्ष्य में कोई कोण धुंधला या गायब पाया जाता है (जैसे कीट का नज़दीकी घाव या खड़ा पानी), तो पोर्टल पुनः फोटो का स्पष्ट अनुरोध भेजेगा।",
      "समय पर पुनः प्रस्तुति: किसान को समय-सीमा (पीएमएफबीवाई नियमों के अनुसार क्षति के 72 घंटे के भीतर) में मांगे गए कोण अपलोड करने चाहिए।",
      "रिकॉर्ड निरंतरता: पुनः फोटो जमा करने पर पुराने दावे की प्राथमिकता सुरक्षित रहती है और वह उसी रिकॉर्ड में अद्यतन हो जाता है।",
    ],
  },
  {
    icon: HardDrive,
    enTitle: "5. Platform Availability, Offline Sync & Disclaimers",
    hiTitle: "5. पोर्टल उपलब्धता, ऑफ़लाइन कार्यप्रणाली एवं अस्वीकरण",
    en: [
      "Progressive Web App & Offline Mode: The platform supports local offline caching of evidence when cellular connectivity is intermittent. Captures sync automatically once a network connection is re-established.",
      "Alternative Support: In the event of device malfunction or connectivity loss, evidence collection should be performed as soon as device functionality is restored.",
      "No Warranty of Payout: Submission of evidence through this platform serves as verified assessment documentation and does not guarantee insurance indemnity or claim approval.",
    ],
    hi: [
      "ऑफ़लाइन कार्यप्रणाली: नेटवर्क न होने पर भी तस्वीरें और GPS डेटा फ़ोन में सुरक्षित रहता है और इंटरनेट आते ही स्वतः सर्वर पर अपलोड हो जाता है।",
      "वैकल्पिक सहायता: यदि किसी कारणवश तकनीकी समस्या आए, तो उपकरण ठीक होते ही साक्ष्य संकलन पूरा किया जाना चाहिए।",
      "दावा स्वीकृति की गारंटी नहीं: केवल साक्ष्य जमा करने से दावा स्वीकृति की गारंटी नहीं होती; निर्णय सत्यापन और नुकसान के नियमों के अनुसार ही तय होता है।",
    ],
  },
  {
    icon: ShieldCheck,
    enTitle: "6. Governing Law & Dispute Resolution",
    hiTitle: "6. लागू कानून एवं विवाद समाधान",
    en: [
      "Jurisdiction: These Terms of Use shall be governed by and construed in accordance with applicable laws and standard crop insurance operational practices.",
      "Grievance Redressal Mechanism: Disputed findings or technical inquiries may be directed to our grievance desk via stellarie@duck.com.",
    ],
    hi: [
      "न्यायाधिकार: ये शर्तें लागू कानूनों और फसल बीमा परिचालन दिशानिर्देशों के अधीन हैं।",
      "विवाद निवारण: साक्ष्य मूल्यांकन या तकनीकी प्रक्रिया से संबंधित किसी भी प्रश्न के लिए stellarie@duck.com पर संपर्क किया जा सकता है।",
    ],
  },
];

export default function TermsPage() {
  const { lang } = useLanguage();
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Header */}
      <header className="border-b border-[var(--line)] pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="fp-kicker text-xs font-mono">Operational &amp; Evidence Governance</span>
          <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
            Evidence Standards
          </span>
          <span className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--ink-muted)]">
            Updated: August 2026
          </span>
        </div>

        <h1 className="mt-4 text-3xl font-serif tracking-tight text-[var(--ink)] sm:text-4xl">
          {lang === "hi" ? "उपयोग की शर्तें एवं नियम" : "Terms of Use & Adjudication Rules"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)] sm:text-base">
          {lang === "hi"
            ? "फसल-प्रमाण पोर्टल के उपयोग, साक्ष्य की प्रामाणिकता, धोखाधड़ी-रोधी नियमों और मानवीय समीक्षा प्रक्रिया से संबंधित परिचालन शर्तें।"
            : "Binding terms governing agricultural evidence collection, farmer anti-fraud duties, assistive AI decision support, and human-in-the-loop claim adjudication."}
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

      {/* Anti-Fraud Warning Box */}
      <section className="mt-10 border border-amber-300 bg-amber-50/60 p-6 text-xs text-amber-950 sm:text-sm">
        <div className="flex items-center gap-2 font-semibold text-amber-900">
          <AlertOctagon className="h-4 w-4" />
          <span>{lang === "hi" ? "महत्वपूर्ण कानूनी सूचना: धोखाधड़ी रोकथाम" : "Notice: Anti-Fraud & Evidence Integrity"}</span>
        </div>
        <p className="mt-2 leading-relaxed text-amber-900/90">
          {lang === "hi"
            ? "सभी अपलोड की गई तस्वीरों की सैटेलाइट, मौसम डेटा और क्रिप्टोग्राफिक हैश द्वारा स्वतंत्र जाँच की जाती है। जाली या मंचित साक्ष्य प्रस्तुत करने पर संबंधित दावा तुरंत निरस्त होगा और कानूनी दंडात्मक कार्रवाई की जाएगी।"
            : "All evidence submissions undergo multi-signal triangulation against satellite remote sensing archives and cryptographic integrity logs. Submission of manipulated or staged imagery constitutes an offense subject to immediate claim disqualification and investigation."}
        </p>
      </section>

      {/* Navigation Links */}
      <div className="mt-10 flex flex-wrap items-center justify-between border-t border-[var(--line)] pt-6 text-sm text-[var(--ink-muted)]">
        <Link href="/" className="fp-link font-medium">
          ← {lang === "hi" ? "होम पेज पर लौटें" : "Return to Home"}
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="fp-link font-medium">
            {lang === "hi" ? "गोपनीयता नीति →" : "Privacy Policy →"}
          </Link>
        </div>
      </div>
    </div>
  );
}
