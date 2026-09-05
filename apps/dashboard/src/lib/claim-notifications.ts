import type { AppLang } from "./live-indian-languages";

export type NotificationType = "success" | "warning" | "error" | "info";

export type NotificationCode =
  | "invalid_session"
  | "submission_failed"
  | "duplicate_images"
  | "unusable_lighting"
  | "blurry_image"
  | "no_plot_selected"
  | "missing_angles"
  | "draft_saved"
  | "draft_save_failed"
  | "photo_upload_failed"
  | "camera_switched"
  | "retake_cleared"
  | "claim_submitted"
  | "supabase_not_configured"
  | "gps_unavailable"
  | "voice_unavailable";

export interface ClaimNotificationItem {
  id: string;
  type: NotificationType;
  code?: NotificationCode;
  title: string;
  message: string;
  actionHint?: string;
  timestamp: number;
}

export interface LocalizedNotificationText {
  type: NotificationType;
  title: string;
  message: string;
  actionHint?: string;
}

type NotificationDictionary = Record<NotificationCode, LocalizedNotificationText>;

const EN_NOTIFICATIONS: NotificationDictionary = {
  invalid_session: {
    type: "error",
    title: "Session Expired",
    message: "Your login session has expired. Your current photos and notes are saved locally.",
    actionHint: "Please sign in again to submit your claim without losing your progress.",
  },
  submission_failed: {
    type: "error",
    title: "Submission Failed",
    message: "Could not submit your claim due to a network or server issue.",
    actionHint: "Your draft is safe. Please check your connection and try submitting again.",
  },
  duplicate_images: {
    type: "warning",
    title: "Duplicate Photos Detected",
    message: "Identical or repeated angle photos were detected.",
    actionHint: "Please take 3 distinct photos from different distances or viewpoints.",
  },
  unusable_lighting: {
    type: "warning",
    title: "Unusable Lighting",
    message: "Some photos are too dark or have strong glare, hiding crop damage.",
    actionHint: "Avoid direct sunlight on the lens and retake in natural daylight.",
  },
  blurry_image: {
    type: "warning",
    title: "Blurry Photo",
    message: "Camera movement caused motion blur on the crop photo.",
    actionHint: "Hold your phone steady with both hands, tap to focus, and retake.",
  },
  no_plot_selected: {
    type: "warning",
    title: "Plot Selection Required",
    message: "A registered agricultural plot must be selected before submitting.",
    actionHint: "Choose your plot from the dropdown or tap '+ Add Plot' to register one.",
  },
  missing_angles: {
    type: "warning",
    title: "Missing Required Photos",
    message: "Not all mandatory evidence photo angles have been captured yet.",
    actionHint: "Please capture all required angles before submitting.",
  },
  draft_saved: {
    type: "success",
    title: "Draft Saved",
    message: "Your claim notes and details have been safely stored on this device.",
    actionHint: "You can resume this claim at any time from this browser.",
  },
  draft_save_failed: {
    type: "error",
    title: "Could Not Save Draft",
    message: "Browser storage is full or restricted on this device.",
    actionHint: "Clear some browser storage or proceed directly with submission.",
  },
  photo_upload_failed: {
    type: "error",
    title: "Photo Upload Failed",
    message: "Could not process or upload the selected photo file.",
    actionHint: "Please try selecting or capturing the photo again.",
  },
  camera_switched: {
    type: "info",
    title: "Camera Switched",
    message: "Camera viewpoint has been flipped successfully.",
  },
  retake_cleared: {
    type: "info",
    title: "Photo Cleared for Retake",
    message: "Previous capture cleared. The camera is ready to capture a fresh photo.",
    actionHint: "Align the crop in the viewfinder and tap the shutter.",
  },
  claim_submitted: {
    type: "success",
    title: "Claim Submitted Successfully",
    message: "Your crop damage claim and evidence hashes have been securely recorded.",
    actionHint: "You can track AI verification and review status in My Claims.",
  },
  supabase_not_configured: {
    type: "warning",
    title: "Database Not Configured",
    message: "Cloud database connection is not active — claim cannot be saved to cloud.",
    actionHint: "Connect Supabase or proceed in local offline demonstration mode.",
  },
  gps_unavailable: {
    type: "warning",
    title: "GPS Location Unavailable",
    message: "Could not acquire precise GPS coordinates for your field parcel.",
    actionHint: "Turn ON Location (GPS) in phone settings and allow browser access.",
  },
  voice_unavailable: {
    type: "info",
    title: "Voice Dictation Unavailable",
    message: "Microphone speech recognition is not supported in this browser.",
    actionHint: "You can type your field observation notes directly in the box.",
  },
};

const HI_NOTIFICATIONS: NotificationDictionary = {
  invalid_session: {
    type: "error",
    title: "सत्र समाप्त (लॉगिन आवश्यक)",
    message: "आपका लॉगिन सत्र समाप्त हो गया है। आपका भरा हुआ डेटा सुरक्षित है।",
    actionHint: "कृपया दोबारा लॉगिन करें, आपकी तस्वीरें और ड्राफ्ट नहीं खोएंगे।",
  },
  submission_failed: {
    type: "error",
    title: "दावा जमा विफल",
    message: "नेटवर्क या सर्वर समस्या के कारण दावा जमा नहीं हो सका।",
    actionHint: "आपका ड्राफ्ट सुरक्षित है। इंटरनेट जांचें और कुछ देर बाद पुनः प्रयास करें।",
  },
  duplicate_images: {
    type: "warning",
    title: "समान फोटो पहचानी गई",
    message: "एक ही फ़ोटो या कोण बार-बार अपलोड किया गया है।",
    actionHint: "कृपया 2-3 कदम आगे-पीछे होकर अलग कोण से 3 अलग-अलग तस्वीरें लें।",
  },
  unusable_lighting: {
    type: "warning",
    title: "अपर्याप्त या खराब रोशनी",
    message: "तस्वीरें बहुत अँधेरी या अत्यधिक धूप वाली हैं, क्षति साफ़ नहीं दिख रही।",
    actionHint: "लेंस पर सीधी धूप से बचें और अच्छी प्राकृतिक रोशनी में दोबारा फोटो लें।",
  },
  blurry_image: {
    type: "warning",
    title: "धुंधली फोटो (मोशन ब्लर)",
    message: "हाथ हिलने से फसल की फोटो धुंधली हो गई है।",
    actionHint: "फोन को दोनों हाथों से स्थिर रखें, स्क्रीन पर टैप करें और पुनः फोटो लें।",
  },
  no_plot_selected: {
    type: "warning",
    title: "खेत (भूखंड) चुनना आवश्यक",
    message: "दावा जमा करने से पहले पंजीकृत खेत चुनना अनिवार्य है।",
    actionHint: "ऊपर सूची से खेत चुनें या '+ नया खेत जोड़ें' पर क्लिक करें।",
  },
  missing_angles: {
    type: "warning",
    title: "सभी 3 तस्वीरें आवश्यक",
    message: "बीमा सत्यापन के लिए सभी आवश्यक कोणों की तस्वीरें जरूरी हैं।",
    actionHint: "कृपया बाकी बचे कोणों की भी स्पष्ट तस्वीरें लें।",
  },
  draft_saved: {
    type: "success",
    title: "प्रारूप सुरक्षित सहेजा गया",
    message: "आपके द्वारा लिखे गए नोट और विवरण इस फोन में सुरक्षित हैं।",
    actionHint: "आप कभी भी इसी पेज पर आकर दावा पूरा कर सकते हैं।",
  },
  draft_save_failed: {
    type: "error",
    title: "ड्राफ्ट सहेजा नहीं जा सका",
    message: "डिवाइस का स्टोरेज भर जाने के कारण ड्राफ्ट सहेजा नहीं गया।",
    actionHint: "ब्राउज़र स्टोरेज खाली करें या सीधे दावा जमा करें।",
  },
  photo_upload_failed: {
    type: "error",
    title: "फोटो अपलोड विफल",
    message: "तस्वीर अपलोड नहीं हो सकी। नेटवर्क या फ़ाइल में रुकावट है।",
    actionHint: "कृपया कैमरे से दोबारा फोटो खींचने का प्रयास करें।",
  },
  camera_switched: {
    type: "info",
    title: "कैमरा बदला गया",
    message: "कैमरा लेंस सफलतापूर्वक बदल दिया गया है।",
  },
  retake_cleared: {
    type: "info",
    title: "पुनः फोटो लेने के लिए तैयार",
    message: "पुरानी तस्वीर हटा दी गई है। अब नए कोण से स्पष्ट फोटो लें।",
    actionHint: "फसल को फ्रेम में रखें और शटर बटन दबाएँ।",
  },
  claim_submitted: {
    type: "success",
    title: "दावा सफलतापूर्वक दर्ज हुआ",
    message: "आपका फसल नुकसान दावा और फोटो साक्ष्य सुरक्षित रूप से दर्ज कर लिए गए हैं।",
    actionHint: "समीक्षा और AI सत्यापन की प्रगति 'मेरे दावे' पेज पर देखें।",
  },
  supabase_not_configured: {
    type: "warning",
    title: "क्लाउड डेटाबेस कनेक्ट नहीं",
    message: "डेटाबेस कॉन्फ़िगर नहीं है — यह दावा क्लाउड में सुरक्षित नहीं होगा।",
    actionHint: "Supabase कनेक्ट करें या स्थानीय डेमो मोड में जांचें।",
  },
  gps_unavailable: {
    type: "warning",
    title: "GPS लोकेशन नहीं मिली",
    message: "खेत की सही स्थिति दर्ज करने के लिए GPS सिग्नल नहीं मिला।",
    actionHint: "फोन सेटिंग्स में लोकेशन (GPS) चालू करें और ब्राउज़र को अनुमति दें।",
  },
  voice_unavailable: {
    type: "info",
    title: "आवाज इनपुट उपलब्ध नहीं",
    message: "इस ब्राउज़र में बोलकर नोट लिखने की सुविधा उपलब्ध नहीं है।",
    actionHint: "कृपया नोट खुद टाइप करके लिखें।",
  },
};

// Complete localized overlays for all other 13 Indian languages
const REGIONAL_NOTIFICATION_OVERLAYS: Record<Exclude<AppLang, "en" | "hi">, Partial<NotificationDictionary>> = {
  as: {
    invalid_session: {
      type: "error",
      title: "অধিবেশন সমাপ্ত (লগইন প্ৰয়োজন)",
      message: "আপোনাৰ লগইন অধিবেশন সমাপ্ত হৈছে। তথ্য সংৰক্ষিত আছে।",
      actionHint: "অনুগ্ৰহ কৰি পুনৰ লগইন কৰক, কোনো তথ্য নষ্ট নহয়।",
    },
    submission_failed: {
      type: "error",
      title: "দাখিল বিফল হ'ল",
      message: "নেটৱৰ্ক বা চাৰ্ভাৰৰ সমস্যাৰ বাবে দাবী জমা নহ'ল।",
      actionHint: "খচৰা সুৰক্ষিত আছে। অনুগ্ৰহ কৰি কিছু সময় পিছত পুনৰ চেষ্টা কৰক।",
    },
    duplicate_images: {
      type: "warning",
      title: "একে ছবি চিনাক্ত কৰা হৈছে",
      message: "একেখন ফটো বা একেটা কোণ বাৰে বাৰে আপলোড কৰা হৈছে।",
      actionHint: "অনুগ্ৰহ কৰি পৃথক কোণৰ পৰা ৩ খন সুকীয়া ফটো তোলক।",
    },
    unusable_lighting: {
      type: "warning",
      title: "অনুপযুক্ত পোহৰ",
      message: "ফটোখন অতি অন্ধকাৰ বা ৰ'দ বেছি, শস্যৰ ক্ষতি স্পষ্ট নহয়।",
      actionHint: "প্ৰাকৃতিক পোহৰত পুনৰ ফটো তোলক।",
    },
    blurry_image: {
      type: "warning",
      title: "অস্পষ্ট ফটো",
      message: "কেমেৰা লৰচৰ হোৱাৰ বাবে ফটোখন অস্পষ্ট হৈছে।",
      actionHint: "ফোনটো স্থিৰকৈ ধৰি পুনৰ ফটো তোলক।",
    },
    no_plot_selected: {
      type: "warning",
      title: "ভূখণ্ড বাছনি কৰক",
      message: "দাবী দাখিল কৰাৰ আগতে পঞ্জীকৃত ভূখণ্ড বাছনি কৰাটো বাধ্যতামূলক।",
      actionHint: "ওপৰৰ তালিকাৰ পৰা ভূখণ্ড বাছক বা নতুন যোগ কৰক।",
    },
    missing_angles: {
      type: "warning",
      title: "সকলো ফটো প্ৰয়োজন",
      message: "সকলো প্ৰয়োজনীয় কোণৰ ফটো তোলা হোৱা নাই।",
      actionHint: "অনুগ্ৰহ কৰি বাকী থকা কোণসমূহৰ ফটো তোলক।",
    },
    draft_saved: {
      type: "success",
      title: "খচৰা সংৰক্ষিত",
      message: "আপোনাৰ তথ্য এই ডিভাইচত সুৰক্ষিতভাৱে সংৰক্ষণ কৰা হৈছে।",
    },
    claim_submitted: {
      type: "success",
      title: "দাবী সফলভাৱে দাখিল কৰা হ'ল",
      message: "আপোনাৰ শস্য ক্ষতিৰ দাবী সুৰক্ষিতভাৱে সংৰক্ষণ কৰা হৈছে।",
      actionHint: "'মোৰ দাবী' পৃষ্ঠাত পৰীক্ষণ স্থিতি চাওক।",
    },
  },
  bn: {
    invalid_session: {
      type: "error",
      title: "সেশন মেয়াদোত্তীর্ণ (লগইন প্রয়োজন)",
      message: "আপনার লগইন সেশনের মেয়াদ শেষ হয়েছে। আপনার খসড়া নিরাপদ আছে।",
      actionHint: "অনুগ্রহ করে আবার লগইন করুন এবং জমা দিন।",
    },
    submission_failed: {
      type: "error",
      title: "জমা দেওয়া ব্যর্থ হয়েছে",
      message: "নেটওয়ার্ক বা সার্ভার সমস্যার কারণে দাবি জমা দেওয়া যায়নি।",
      actionHint: "আপনার খসড়া সুরক্ষিত আছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।",
    },
    duplicate_images: {
      type: "warning",
      title: "একই ছবি শনাক্ত হয়েছে",
      message: "একই ছবি বা কোণ বারবার আপলোড করা হয়েছে।",
      actionHint: "অনুগ্রহ করে আলাদা কোণ থেকে ৩টি স্পষ্ট ছবি তুলুন।",
    },
    unusable_lighting: {
      type: "warning",
      title: "অনুপযুক্ত আলো",
      message: "ছবি অতিরিক্ত অন্ধকার বা চড়া আলোর কারণে ক্ষতি স্পষ্ট দেখা যাচ্ছে না।",
      actionHint: "প্রাকৃতিক আলোতে ক্যামেরা স্থির রেখে আবার ছবি তুলুন।",
    },
    blurry_image: {
      type: "warning",
      title: "ঝাপসা ছবি",
      message: "ক্যামেরা নড়ে যাওয়ার কারণে ছবি ঝাপসা হয়েছে।",
      actionHint: "ফোনটি স্থির রাখুন এবং পুনরায় ছবি তুলুন।",
    },
    no_plot_selected: {
      type: "warning",
      title: "জমি নির্বাচন প্রয়োজন",
      message: "দাবি জমা দেওয়ার আগে একটি নিবন্ধিত জমি নির্বাচন করা আবশ্যক।",
      actionHint: "ড্রপডাউন থেকে আপনার জমি বেছে নিন।",
    },
    missing_angles: {
      type: "warning",
      title: "সকল ছবি প্রয়োজন",
      message: "প্রয়োজনীয় সব কোণের ছবি এখনও তোলা হয়নি।",
      actionHint: "অনুগ্রহ করে অবশিষ্ট কোণগুলির ছবি তুলুন।",
    },
    draft_saved: {
      type: "success",
      title: "খসড়া সংরক্ষিত",
      message: "আপনার নোট ও তথ্য এই ডিভাইসে সুরক্ষিতভাবে সংরক্ষিত হয়েছে।",
    },
    claim_submitted: {
      type: "success",
      title: "দাবি সফলভাবে জমা দেওয়া হয়েছে",
      message: "আপনার শস্য ক্ষতির দাবি ও প্রমাণ নিরাপদে সংরক্ষিত হয়েছে।",
      actionHint: "'আমার দাবি' পেজে যাচাইকরণের অবস্থা দেখুন।",
    },
  },
  gu: {
    invalid_session: {
      type: "error",
      title: "સત્ર સમાપ્ત (લૉગિન જરૂરી)",
      message: "તમારું લૉગિન સત્ર સમાપ્ત થઈ ગયું છે. તમારી વિગતો સુરક્ષિત છે.",
      actionHint: "કૃપા કરીને ફરીથી લૉગિન કરો અને સબમિટ કરો.",
    },
    submission_failed: {
      type: "error",
      title: "સબમિશન નિષ્ફળ",
      message: "નેટવર્ક અથવા સર્વર સમસ્યાને કારણે દાવો જમા થઈ શક્યો નથી.",
      actionHint: "ડ્રાફ્ટ સુરક્ષિત છે. કૃપા કરીને થોડી વાર પછી ફરી પ્રયાસ કરો.",
    },
    duplicate_images: {
      type: "warning",
      title: "સમાન ફોટો મળ્યો",
      message: "એક જ ફોટો વારંવાર અપલોડ કરવામાં આવ્યો છે.",
      actionHint: "કૃપા કરીને અલગ-અલગ ખૂણામાંથી 3 જુદા ફોટા લો.",
    },
    unusable_lighting: {
      type: "warning",
      title: "નબળી રોશની",
      message: "ફોટો ખૂબ અંધારામાં અથવા વધુ પડતા તડકામાં લેવાયો છે.",
      actionHint: "કુદરતી પ્રકાશમાં ફરીથી ફોટો લો.",
    },
    blurry_image: {
      type: "warning",
      title: "ઝાંખો ફોટો",
      message: "હાથ હલવાથી ફોટો ઝાંખો આવ્યો છે.",
      actionHint: "ફોનને સ્થિર પકડીને ફરીથી ફોટો લો.",
    },
    no_plot_selected: {
      type: "warning",
      title: "ખેતર પસંદ કરવું જરૂરી",
      message: "દાવો જમા કરતા પહેલાં નોંધાયેલ ખેતર પસંદ કરવું ફરજિયાત છે.",
      actionHint: "ઉપરની યાદીમાંથી ખેતર પસંદ કરો.",
    },
    missing_angles: {
      type: "warning",
      title: "બધા ફોટા જરૂરી",
      message: "બધા જરૂરી ખૂણાના ફોટા હજુ લેવાયા નથી.",
      actionHint: "કૃપા કરીને બાકી રહેલા ખૂણાના ફોટા પૂર્ણ કરો.",
    },
    draft_saved: {
      type: "success",
      title: "ડ્રાફ્ટ સચવાયો",
      message: "તમારી વિગતો આ ડિવાઇસમાં સુરક્ષિત રીતે સચવાઈ છે.",
    },
    claim_submitted: {
      type: "success",
      title: "દાવો સફળતાપૂર્વક જમા થયો",
      message: "તમારો પાક નુકસાન દાવો સુરક્ષિત રીતે નોંધાઈ ગયો છે.",
      actionHint: "'મારા દાવા' પેજ પર ચકાસણી સ્થિતિ જુઓ.",
    },
  },
  kn: {
    invalid_session: {
      type: "error",
      title: "ಅವಧಿ ಮುಕ್ತಾಯವಾಗಿದೆ (ಲಾಗಿನ್ ಅಗತ್ಯ)",
      message: "ನಿಮ್ಮ ಲಾಗಿನ್ ಅವಧಿ ಮುಗಿದಿದೆ. ನಿಮ್ಮ ಕರಡು ಸುರಕ್ಷಿತವಾಗಿದೆ.",
      actionHint: "ದಯವಿಟ್ಟು ಮರು-ಲಾಗಿನ್ ಮಾಡಿ ಮತ್ತು ಸಲ್ಲಿಸಿ.",
    },
    submission_failed: {
      type: "error",
      title: "ಸಲ್ಲಿಕೆ ವಿಫಲವಾಗಿದೆ",
      message: "ನೆಟ್‌ವರ್ಕ್ ಸಮಸ್ಯೆಯಿಂದಾಗಿ ಕ್ಲೈಮ್ ಸಲ್ಲಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.",
      actionHint: "ಕರಡು ಸುರಕ್ಷಿತವಾಗಿದೆ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಪ್ರಯತ್ನಿಸಿ.",
    },
    duplicate_images: {
      type: "warning",
      title: "ನಕಲಿ ಫೋಟೋ ಪತ್ತೆಯಾಗಿದೆ",
      message: "ಒಂದೇ ಫೋಟೋ ಅಥವಾ ಕೋನವನ್ನು ಪುನರಾವರ್ತಿಸಿ ಅಪ್‌ಲೋಡ್ ಮಾಡಲಾಗಿದೆ.",
      actionHint: "ದಯವಿಟ್ಟು 3 ವಿಭಿನ್ನ ಕೋನಗಳಿಂದ ಫೋಟೋಗಳನ್ನು ತೆಗೆದುಕೊಳ್ಳಿ.",
    },
    unusable_lighting: {
      type: "warning",
      title: "ಕಳಪೆ ಬೆಳಕು",
      message: "ಫೋಟೋ ತುಂಬಾ ಕತ್ತಲೆಯಾಗಿದೆ ಅಥವಾ ಅತಿಯಾದ ಬೆಳಕಿದೆ.",
      actionHint: "ನೈಸರ್ಗಿಕ ಬೆಳಕಿನಲ್ಲಿ ಮರು-ಫೋಟೋ ತೆಗೆದುಕೊಳ್ಳಿ.",
    },
    blurry_image: {
      type: "warning",
      title: "ಮಸುಕಾದ ಫೋಟೋ",
      message: "ಕ್ಯಾಮೆರಾ ಚಲನೆಯಿಂದಾಗಿ ಫೋಟೋ ಮಸುಕಾಗಿದೆ.",
      actionHint: "ಫೋನ್ ಅನ್ನು ಸ್ಥಿರವಾಗಿ ಹಿಡಿದು ಮತ್ತೆ ಫೋಟೋ ತೆಗೆದುಕೊಳ್ಳಿ.",
    },
    no_plot_selected: {
      type: "warning",
      title: "ಜಮೀನು ಆಯ್ಕೆ ಕಡ್ಡಾಯ",
      message: "ಕ್ಲೈಮ್ ಸಲ್ಲಿಸುವ ಮೊದಲು ನೋಂದಾಯಿತ ಜಮೀನು ಆಯ್ಕೆ ಮಾಡಬೇಕು.",
      actionHint: "ಪಟ್ಟಿಯಿಂದ ನಿಮ್ಮ ಜಮೀನನ್ನು ಆಯ್ಕೆಮಾಡಿ.",
    },
    missing_angles: {
      type: "warning",
      title: "ಎಲ್ಲಾ ಫೋಟೋಗಳು ಅಗತ್ಯ",
      message: "ಎಲ್ಲಾ ಅಗತ್ಯ ಕೋನಗಳ ಫೋಟೋಗಳನ್ನು ಇನ್ನೂ ತೆಗೆದಿಲ್ಲ.",
      actionHint: "ದಯವಿಟ್ಟು ಬಾಕಿ ಇರುವ ಕೋನಗಳ ಫೋಟೋಗಳನ್ನು ಪೂರ್ಣಗೊಳಿಸಿ.",
    },
    draft_saved: {
      type: "success",
      title: "ಕರಡು ಉಳಿಸಲಾಗಿದೆ",
      message: "ನಿಮ್ಮ ಟಿಪ್ಪಣಿಗಳನ್ನು ಈ ಸಾಧನದಲ್ಲಿ ಸುರಕ್ಷಿತವಾಗಿ ಉಳಿಸಲಾಗಿದೆ.",
    },
    claim_submitted: {
      type: "success",
      title: "ಕ್ಲೈಮ್ ಯಶಸ್ವಿಯಾಗಿ ಸಲ್ಲಿಕೆಯಾಗಿದೆ",
      message: "ನಿಮ್ಮ ಬೆಳೆ ಹಾನಿ ಕ್ಲೈಮ್ ಅನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ದಾಖಲಿಸಲಾಗಿದೆ.",
      actionHint: "'ನನ್ನ ಕ್ಲೈಮ್‌ಗಳು' ಪುಟದಲ್ಲಿ ಪರಿಶೀಲನೆ ಸ್ಥಿತಿಯನ್ನು ನೋಡಿ.",
    },
  },
  ml: {
    invalid_session: {
      type: "error",
      title: "സെഷൻ കാലഹരണപ്പെട്ടു (ലോഗിൻ വേണം)",
      message: "ലോഗിൻ സെഷൻ കഴിഞ്ഞു. ഡ്രാഫ്റ്റ് സുരക്ഷിതമാണ്.",
      actionHint: "ദയവായി വീണ്ടും ലോഗിൻ ചെയ്ത് സമർപ്പിക്കുക.",
    },
    submission_failed: {
      type: "error",
      title: "സമർപ്പണം പരാജയപ്പെട്ടു",
      message: "നെറ്റ്‌വർക്ക് പ്രശ്നം കാരണം ക്ലെയിം സമർപ്പിക്കാൻ കഴിഞ്ഞില്ല.",
      actionHint: "ഡ്രാഫ്റ്റ് സുരക്ഷിതമാണ്. അൽപം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.",
    },
    duplicate_images: {
      type: "warning",
      title: "ഒരേ ഫോട്ടോകൾ കണ്ടെത്തി",
      message: "ഒരേ ഫോട്ടോ വീണ്ടും അപ്‌ലോഡ് ചെയ്തു.",
      actionHint: "വ്യത്യസ്ത കോണുകളിൽ നിന്ന് 3 പുതിയ ഫോട്ടോകൾ എടുക്കുക.",
    },
    unusable_lighting: {
      type: "warning",
      title: "വെളിച്ചക്കുറവ്",
      message: "ഫോട്ടോയിൽ വെളിച്ചം വളരെ കുറവാണ്.",
      actionHint: "നല്ല വെളിച്ചത്തിൽ വീണ്ടും ഫോട്ടോ എടുക്കുക.",
    },
    blurry_image: {
      type: "warning",
      title: "മങ്ങിയ ഫോട്ടോ",
      message: "ക്യാമറ ഇളകിയതിനാൽ ഫോട്ടോ മങ്ങിപ്പോയി.",
      actionHint: "ഫോൺ ഇളകാതെ പിടിച്ച് വീണ്ടും ഫോട്ടോ എടുക്കുക.",
    },
    no_plot_selected: {
      type: "warning",
      title: "പ്ലോട്ട് തിരഞ്ഞെടുക്കണം",
      message: "ക്ലെയിം സമർപ്പിക്കുന്നതിന് മുൻപ് പ്ലോട്ട് തിരഞ്ഞെടുക്കുക.",
      actionHint: "ലിസ്റ്റിൽ നിന്ന് പ്ലോട്ട് തിരഞ്ഞെടുക്കുക.",
    },
    missing_angles: {
      type: "warning",
      title: "എല്ലാ ഫോട്ടോകളും വേണം",
      message: "ആവശ്യമായ എല്ലാ കോണുകളിലെയും ഫോട്ടോകൾ എടുത്തിട്ടില്ല.",
      actionHint: "ബാക്കി ഫോട്ടോകൾ കൂടി പൂർത്തിയാക്കുക.",
    },
    draft_saved: {
      type: "success",
      title: "ഡ്രാഫ്റ്റ് സൂക്ഷിച്ചു",
      message: "വിവരങ്ങൾ ഈ ഉപകരണത്തിൽ സുരക്ഷിതമായി സൂക്ഷിച്ചിരിക്കുന്നു.",
    },
    claim_submitted: {
      type: "success",
      title: "ക്ലെയിം വിജയകരമായി സമർപ്പിച്ചു",
      message: "വിളനാശ ക്ലെയിം രേഖപ്പെടുത്തിയിട്ടുണ്ട്.",
      actionHint: "'എന്റെ ക്ലെയിമുകൾ' പേജിൽ പരിശോധിക്കുക.",
    },
  },
  mr: {
    invalid_session: {
      type: "error",
      title: "सत्र समाप्त (लॉगिन आवश्यक)",
      message: "तुमचे लॉगिन सत्र संपले आहे. तुमचा मसुदा सुरक्षित आहे.",
      actionHint: "कृपया पुन्हा लॉगिन करा आणि दावा सादर करा.",
    },
    submission_failed: {
      type: "error",
      title: "दावा सबमिशन अयशस्वी",
      message: "नेटवर्क किंवा सर्व्हर समस्येमुळे दावा जमा होऊ शकला नाही.",
      actionHint: "मसुदा सुरक्षित आहे. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.",
    },
    duplicate_images: {
      type: "warning",
      title: "एकसारखे फोटो आढळले",
      message: "एकच फोटो किंवा कोन वारंवार अपलोड केला गेला आहे.",
      actionHint: "कृपया वेगवेगळ्या कोनातून ३ स्वतंत्र फोटो काढा.",
    },
    unusable_lighting: {
      type: "warning",
      title: "अपुरा प्रकाश",
      message: "फोटो खूप अंधारात किंवा अति प्रकाशात काढला आहे.",
      actionHint: "नैसर्गिक प्रकाशात पुन्हा फोटो काढा.",
    },
    blurry_image: {
      type: "warning",
      title: "अस्पष्ट फोटो",
      message: "हात हलल्यामुळे फोटो अस्पष्ट आला आहे.",
      actionHint: "फोन स्थिर धरून पुन्हा फोटो काढा.",
    },
    no_plot_selected: {
      type: "warning",
      title: "शेत निवडणे आवश्यक",
      message: "दावा दाखल करण्यापूर्वी नोंदणीकृत शेत निवडणे आवश्यक आहे.",
      actionHint: "यादीतून शेत निवडा किंवा नवीन जोडा.",
    },
    missing_angles: {
      type: "warning",
      title: "सर्व फोटो आवश्यक",
      message: "सर्व आवश्यक कोनांचे फोटो अद्याप घेतलेले नाहीत.",
      actionHint: "कृपया उर्वरित कोनांचे फोटो पूर्ण करा.",
    },
    draft_saved: {
      type: "success",
      title: "मसुदा जतन केला",
      message: "तुमच्या नोंदी या डिव्हाइसवर सुरक्षित जतन केल्या आहेत.",
    },
    claim_submitted: {
      type: "success",
      title: "दावा यशस्वीरित्या सादर केला",
      message: "तुमचा पीक नुकसान दावा सुरक्षितपणे नोंदवला गेला आहे.",
      actionHint: "'माझे दावे' पानावर पडताळणी स्थिती पहा.",
    },
  },
  ne: {
    invalid_session: {
      type: "error",
      title: "सत्र समाप्त (लगइन आवश्यक)",
      message: "तपाईंको लगइन सत्र समाप्त भएको छ। विवरण सुरक्षित छ।",
      actionHint: "कृपया पुन: लगइन गर्नुहोस् र पेश गर्नुहोस्।",
    },
    submission_failed: {
      type: "error",
      title: "दाबी पेश गर्न असफल",
      message: "नेटवर्क समस्याको कारण दाबी पेश हुन सकेन।",
      actionHint: "ड्राफ्ट सुरक्षित छ। कृपया केही समयपछि पुन: प्रयास गर्नुहोस्।",
    },
    duplicate_images: {
      type: "warning",
      title: "उस्तै तस्बिर भेटियो",
      message: "एउटै फोटो बारम्बार अपलोड गरिएको छ।",
      actionHint: "कृपया फरक कोणबाट ३ भिन्न तस्बिर लिनुहोस्।",
    },
    unusable_lighting: {
      type: "warning",
      title: "कमजोर प्रकाश",
      message: "तस्बिर धेरै अँध्यारो वा चहकिलो छ।",
      actionHint: "प्राकृतिक उज्यालोमा पुन: तस्बिर लिनुहोस्।",
    },
    blurry_image: {
      type: "warning",
      title: "धमिलो तस्बिर",
      message: "हात हल्लिएका कारण तस्बिर धमिलो भएको छ।",
      actionHint: "फोनलाई स्थिर राखेर पुन: फोटो खिच्नुहोस्।",
    },
    no_plot_selected: {
      type: "warning",
      title: "खेत छनोट आवश्यक",
      message: "दाबी पेश गर्नुअघि खेत छनोट गर्नुपर्छ।",
      actionHint: "सूचीबाट खेत छनोट गर्नुहोस्।",
    },
    missing_angles: {
      type: "warning",
      title: "सबै तस्बिर आवश्यक",
      message: "सबै आवश्यक कोणका तस्बिरहरू अझै लिइएका छैनन्।",
      actionHint: "कृपया बाँकी कोणहरू पूरा गर्नुहोस्।",
    },
    draft_saved: {
      type: "success",
      title: "ड्राफ्ट सुरक्षित गरियो",
      message: "तपाईंका विवरणहरू यस फोनमा सुरक्षित छन्।",
    },
    claim_submitted: {
      type: "success",
      title: "दाबी सफलतापूर्वक पेश भयो",
      message: "तपाईंको बाली क्षति दाबी दर्ता भएको छ।",
      actionHint: "'मेरा दाबीहरू' पृष्ठमा स्थिति हेर्नुहोस्।",
    },
  },
  or: {
    invalid_session: {
      type: "error",
      title: "ସେସନ୍ ସମାପ୍ତ (ଲଗଇନ୍ ଆବଶ୍ୟକ)",
      message: "ଆପଣଙ୍କର ଲଗଇନ୍ ସେସନ୍ ସମାପ୍ତ ହୋଇଛି। ଡ୍ରାଫ୍ଟ ସୁରକ୍ଷିତ ଅଛି।",
      actionHint: "ଦୟାକରି ପୁନର୍ବାର ଲଗଇନ୍ କରି ଦାଖଲ କରନ୍ତୁ।",
    },
    submission_failed: {
      type: "error",
      title: "ଦାଖଲ ବିଫଳ ହେଲା",
      message: "ନେଟୱର୍କ ସମସ୍ୟା ଯୋଗୁଁ ଦାବି ଜମା ହୋଇପାରିଲା ନାହିଁ।",
      actionHint: "ଡ୍ରାଫ୍ଟ ସୁରକ୍ଷିତ ଅଛି। ଦୟାକରି କିଛି ସମୟ ପରେ ଚେଷ୍ଟା କରନ୍ତୁ।",
    },
    duplicate_images: {
      type: "warning",
      title: "ସମାନ ଫଟୋ ଚିହ୍ନଟ ହୋଇଛି",
      message: "ଗୋଟିଏ ଫଟୋ ବାରମ୍ବାର ଅପଲୋଡ୍ କରାଯାଇଛି।",
      actionHint: "ଦୟାକରି ବିଭିନ୍ନ କୋଣରୁ ୩ଟି ଭିନ୍ନ ଫଟୋ ଉଠାନ୍ତୁ।",
    },
    unusable_lighting: {
      type: "warning",
      title: "ଅନୁପଯୁକ୍ତ ଆଲୋକ",
      message: "ଫଟୋଟି ବହୁତ ଅନ୍ଧକାର ବା ଅତ୍ୟଧିକ ଆଲୋକିତ ଅଟେ।",
      actionHint: "ପ୍ରାକୃତିକ ଆଲୋକରେ ପୁନର୍ବାର ଫଟୋ ଉଠାନ୍ତୁ।",
    },
    blurry_image: {
      type: "warning",
      title: "ଅସ୍ପଷ୍ଟ ଫଟୋ",
      message: "ହାତ ହଲିବା ଯୋଗୁଁ ଫଟୋଟି ଅସ୍ପଷ୍ଟ ହୋଇଛି।",
      actionHint: "ଫୋନକୁ ସ୍ଥିର ରଖି ପୁନର୍ବାର ଫଟୋ ନିଅନ୍ତୁ।",
    },
    no_plot_selected: {
      type: "warning",
      title: "ଜମି ଚୟନ ଆବଶ୍ୟକ",
      message: "ଦାବି ଦାଖଲ କରିବା ପୂର୍ବରୁ ଜମି ଚୟନ କରିବା ବାଧ୍ୟତାମୂଳକ।",
      actionHint: "ତାଲିକାରୁ ଆପଣଙ୍କ ଜମି ବାଛନ୍ତୁ।",
    },
    missing_angles: {
      type: "warning",
      title: "ସମସ୍ତ ଫଟୋ ଆବଶ୍ୟକ",
      message: "ସମସ୍ତ ଆବଶ୍ୟକ କୋଣର ଫଟୋ ଏପର୍ଯ୍ୟନ୍ତ ନିଆଯାଇ ନାହିଁ।",
      actionHint: "ଦୟାକରି ବାକି ଥିବା କୋଣଗୁଡିକ ପୂରଣ କରନ୍ତୁ।",
    },
    draft_saved: {
      type: "success",
      title: "ଡ୍ରାଫ୍ଟ ସୁରକ୍ଷିତ",
      message: "ଆପଣଙ୍କ ବିବରଣୀ ଏହି ଡିଭାଇସରେ ସୁରକ୍ଷିତ ରଖାଯାଇଛି।",
    },
    claim_submitted: {
      type: "success",
      title: "ଦାବି ସଫଳତାର ସହ ଦାଖଲ ହେଲା",
      message: "ଆପଣଙ୍କ ଫସଲ କ୍ଷତି ଦାବି ସୁରକ୍ଷିତ ଭାବେ ରେକର୍ଡ ହୋଇଛି।",
      actionHint: "'ମୋର ଦାବି' ପୃଷ୍ଠାରେ ଯାଞ୍ଚ ସ୍ଥିତି ଦେଖନ୍ତୁ।",
    },
  },
  pa: {
    invalid_session: {
      type: "error",
      title: "ਸੈਸ਼ਨ ਸਮਾਪਤ (ਲੌਗਇਨ ਲੋੜੀਂਦਾ)",
      message: "ਤੁਹਾਡਾ ਲੌਗਇਨ ਸੈਸ਼ਨ ਖ਼ਤਮ ਹੋ ਗਿਆ ਹੈ। ਡਰਾਫਟ ਸੁਰੱਖਿਅਤ ਹੈ।",
      actionHint: "ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਲੌਗਇਨ ਕਰਕੇ ਜਮ੍ਹਾ ਕਰੋ।",
    },
    submission_failed: {
      type: "error",
      title: "ਜਮ੍ਹਾ ਕਰਨਾ ਅਸਫਲ",
      message: "ਨੈੱਟਵਰਕ ਸਮੱਸਿਆ ਕਾਰਨ ਦਾਅਵਾ ਜਮ੍ਹਾ ਨਹੀਂ ਹੋ ਸਕਿਆ।",
      actionHint: "ਡਰਾਫਟ ਸੁਰੱਖਿਅਤ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਥੋੜ੍ਹੀ ਦੇਰ ਬਾਅਦ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    },
    duplicate_images: {
      type: "warning",
      title: "ਇੱਕੋ ਜਿਹੀਆਂ ਫੋਟੋਆਂ ਮਿਲੀਆਂ",
      message: "ਇੱਕੋ ਫੋਟੋ ਨੂੰ ਵਾਰ-ਵਾਰ ਅੱਪਲੋਡ ਕੀਤਾ ਗਿਆ ਹੈ।",
      actionHint: "ਕਿਰਪਾ ਕਰਕੇ ਵੱਖ-ਵੱਖ ਕੋਣਾਂ ਤੋਂ 3 ਵੱਖਰੀਆਂ ਫੋਟੋਆਂ ਲਓ।",
    },
    unusable_lighting: {
      type: "warning",
      title: "ਮਾੜੀ ਰੋਸ਼ਨੀ",
      message: "ਫੋਟੋ ਬਹੁਤ ਹਨੇਰੀ ਜਾਂ ਬਹੁਤ ਜ਼ਿਆਦਾ ਧੁੱਪ ਵਾਲੀ ਹੈ।",
      actionHint: "ਕੁਦਰਤੀ ਰੋਸ਼ਨੀ ਵਿੱਚ ਦੁਬਾਰਾ ਫੋਟੋ ਖਿੱਚੋ।",
    },
    blurry_image: {
      type: "warning",
      title: "ਧੁੰਦਲੀ ਫੋਟੋ",
      message: "ਕੈਮਰਾ ਹਿੱਲਣ ਕਾਰਨ ਫੋਟੋ ਧੁੰਦਲੀ ਹੋ ਗਈ ਹੈ।",
      actionHint: "ਫ਼ੋਨ ਨੂੰ ਸਥਿਰ ਰੱਖ ਕੇ ਦੁਬਾਰਾ ਫੋਟੋ ਲਓ।",
    },
    no_plot_selected: {
      type: "warning",
      title: "ਖੇਤ ਚੁਣਨਾ ਲਾਜ਼ਮੀ",
      message: "ਦਾਅਵਾ ਜਮ੍ਹਾ ਕਰਨ ਤੋਂ ਪਹਿਲਾਂ ਰਜਿਸਟਰਡ ਖੇਤ ਚੁਣੋ।",
      actionHint: "ਸੂਚੀ ਵਿੱਚੋਂ ਆਪਣਾ ਖੇਤ ਚੁਣੋ।",
    },
    missing_angles: {
      type: "warning",
      title: "ਸਾਰੀਆਂ ਫੋਟੋਆਂ ਲੋੜੀਂਦੀਆਂ",
      message: "ਸਾਰੇ ਲੋੜੀਂਦੇ ਕੋਣਾਂ ਦੀਆਂ ਫੋਟੋਆਂ ਅਜੇ ਨਹੀਂ ਲਈਆਂ ਗਈਆਂ।",
      actionHint: "ਕਿਰਪਾ ਕਰਕੇ ਬਾਕੀ ਕੋਣਾਂ ਦੀਆਂ ਫੋਟੋਆਂ ਪੂਰੀਆਂ ਕਰੋ।",
    },
    draft_saved: {
      type: "success",
      title: "ਡਰਾਫਟ ਸੁਰੱਖਿਅਤ ਕੀਤਾ",
      message: "ਤੁਹਾਡੇ ਨੋਟ ਇਸ ਡਿਵਾਈਸ 'ਤੇ ਸੁਰੱਖਿਅਤ ਹਨ।",
    },
    claim_submitted: {
      type: "success",
      title: "ਦਾਅਵਾ ਸਫਲਤਾਪੂਰਵਕ ਦਰਜ ਹੋਇਆ",
      message: "ਤੁਹਾਡਾ ਫ਼ਸਲ ਨੁਕਸਾਨ ਦਾਅਵਾ ਦਰਜ ਕਰ ਲਿਆ ਗਿਆ ਹੈ।",
      actionHint: "'ਮੇਰੇ ਦਾਅਵੇ' ਪੰਨੇ 'ਤੇ ਜਾਂਚ ਸਥਿਤੀ ਵੇਖੋ।",
    },
  },
  sd: {
    invalid_session: {
      type: "error",
      title: "سيشن ختم ٿي ويو (لاگ ان ضروري)",
      message: "توهان جو لاگ ان سيشن ختم ٿي ويو آهي. ڊرافٽ محفوظ آهي.",
      actionHint: "مهرباني ڪري ٻيهر لاگ ان ٿيو ۽ جمع ڪرايو.",
    },
    submission_failed: {
      type: "error",
      title: "جمع ڪرائڻ ناڪام",
      message: "نيٽ ورڪ مسئلي سبب دعويٰ جمع نه ٿي سگهي.",
      actionHint: "مهرباني ڪري ڪجهه دير بعد ٻيهر ڪوشش ڪريو.",
    },
    duplicate_images: {
      type: "warning",
      title: "هڪجهڙيون تصويرون مليون",
      message: "ساڳي تصوير بار بار اپلوڊ ڪئي وئي آهي.",
      actionHint: "مهرباني ڪري 3 مختلف زاوين کان نيون تصويرون ڪڍو.",
    },
    unusable_lighting: {
      type: "warning",
      title: "خراب روشني",
      message: "تصوير تمام گهڻي اونداهي يا تيز روشني واري آهي.",
      actionHint: "قدرتي روشني ۾ ٻيهر تصوير ڪڍو.",
    },
    blurry_image: {
      type: "warning",
      title: "ڌنڌلي تصوير",
      message: "ڪيمرا هلڻ سبب تصوير صاف نه آئي آهي.",
      actionHint: "فون کي سڌو پڪڙي ٻيهر تصوير ڪڍو.",
    },
    no_plot_selected: {
      type: "warning",
      title: "زمين چونڊڻ لازمي آهي",
      message: "دعويٰ جمع ڪرڻ کان اڳ زمين چونڊيو.",
      actionHint: "فهرست مان زمين چونڊيو.",
    },
    missing_angles: {
      type: "warning",
      title: "سڀ تصويرون ضروري آهن",
      message: "سڀني ضروري زاوين جون تصويرون اڃا نه ورتيون ويون آهن.",
      actionHint: "مهرباني ڪري باقي تصويرون مڪمل ڪريو.",
    },
    draft_saved: {
      type: "success",
      title: "ڊرافٽ محفوظ ٿيو",
      message: "توهان جا تفصيل هن ڊوائيس تي محفوظ آهن.",
    },
    claim_submitted: {
      type: "success",
      title: "دعويٰ ڪاميابي سان جمع ٿي وئي",
      message: "توهان جو فصل نقصان جو کاتو رڪارڊ ڪيو ويو آهي.",
      actionHint: "'منهنجون دعوائون' واري صفحي تي چڪاس ڪريو.",
    },
  },
  ta: {
    invalid_session: {
      type: "error",
      title: "அமர்வு காலாவதியானது (உள்நுழைக)",
      message: "உங்கள் உள்நுழைவு அமர்வு முடிந்தது. வரைவு பாதுகாப்பாக உள்ளது.",
      actionHint: "தயவுசெய்து மீண்டும் உள்நுழைந்து சமர்ப்பிக்கவும்.",
    },
    submission_failed: {
      type: "error",
      title: "சமர்ப்பித்தல் தோல்வி",
      message: "நெட்வொர்க் பிரச்சனையால் கோரிக்கையைச் சமர்ப்பிக்க முடியவில்லை.",
      actionHint: "வரைவு பாதுகாப்பாக உள்ளது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
    },
    duplicate_images: {
      type: "warning",
      title: "ஒரே புகைப்படங்கள் கண்டறியப்பட்டன",
      message: "ஒரே புகைப்படம் மீண்டும் மீண்டும் பதிவேற்றப்பட்டுள்ளது.",
      actionHint: "தயவுசெய்து 3 வெவ்வேறு கோணங்களில் புதிய புகைப்படங்களை எடுக்கவும்.",
    },
    unusable_lighting: {
      type: "warning",
      title: "போதிய வெளிச்சமின்மை",
      message: "புகைப்படம் மிகவும் இருட்டாக உள்ளது.",
      actionHint: "இயற்கையான பகல் வெளிச்சத்தில் மீண்டும் புகைப்படம் எடுக்கவும்.",
    },
    blurry_image: {
      type: "warning",
      title: "மங்கலான புகைப்படம்",
      message: "கை அசைவால் புகைப்படம் மங்கலாகிவிட்டது.",
      actionHint: "தொலைபேசியை அசையாமல் பிடித்து மீண்டும் படம் எடுக்கவும்.",
    },
    no_plot_selected: {
      type: "warning",
      title: "நிலத்தை தேர்ந்தெடுக்கவும்",
      message: "கோரிக்கை சமர்ப்பிக்கும் முன் பதிவுசெய்த நிலத்தை தேர்ந்தெடுக்க வேண்டும்.",
      actionHint: "பட்டியலில் இருந்து உங்கள் நிலத்தை தேர்வு செய்யவும்.",
    },
    missing_angles: {
      type: "warning",
      title: "அனைத்து புகைப்படங்களும் தேவை",
      message: "தேவையான அனைத்து கோணப் புகைப்படங்களும் இன்னும் எடுக்கப்படவில்லை.",
      actionHint: "தயவுசெய்து மீதமுள்ள கோணங்களைப் பூர்த்தி செய்யவும்.",
    },
    draft_saved: {
      type: "success",
      title: "வரைவு சேமிக்கப்பட்டது",
      message: "உங்கள் குறிப்புகள் இந்த சாதனத்தில் பாதுகாப்பாக உள்ளன.",
    },
    claim_submitted: {
      type: "success",
      title: "கோரிக்கை வெற்றிகரமாகச் சமர்ப்பிக்கப்பட்டது",
      message: "பயிர் சேத இழப்பீட்டுக் கோரிக்கை பதிவு செய்யப்பட்டது.",
      actionHint: "'எனது கோரிக்கைகள்' பக்கத்தில் நிலையை சரிபார்க்கவும்.",
    },
  },
  te: {
    invalid_session: {
      type: "error",
      title: "సెషన్ ముగిసింది (లాగిన్ అవసరం)",
      message: "మీ లాగిన్ సెషన్ ముగిసింది. డ్రాఫ్ట్ సురక్షితంగా ఉంది.",
      actionHint: "దయచేసి మళ్లీ లాగిన్ అయి సమర్పించండి.",
    },
    submission_failed: {
      type: "error",
      title: "సమర్పణ విఫలమైంది",
      message: "నెట్‌వర్క్ సమస్య వల్ల క్లెయిమ్ సమర్పించలేకపోయాము.",
      actionHint: "డ్రాఫ్ట్ భద్రంగా ఉంది. కాసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
    },
    duplicate_images: {
      type: "warning",
      title: "ఒకే రకమైన ఫోటోలు గుర్తించబడ్డాయి",
      message: "ఒకే ఫోటోను పదే పదే అప్‌లోడ్ చేశారు.",
      actionHint: "దయచేసి 3 వేర్వేరు కోణాల నుండి కొత్త ఫోటోలు తీయండి.",
    },
    unusable_lighting: {
      type: "warning",
      title: "సరిపడని వెలుతురు",
      message: "ఫోటో చాలా చీకటిగా లేదా అతి వెలుతురుగా ఉంది.",
      actionHint: "సహజ వెలుతురులో మళ్లీ ఫోటో తీయండి.",
    },
    blurry_image: {
      type: "warning",
      title: "మసకబారిన ఫోటో",
      message: "చేయి కదలడం వల్ల ఫోటో మసకగా వచ్చింది.",
      actionHint: "ఫోన్‌ను స్థిరంగా పట్టుకుని మళ్లీ ఫోటో తీయండి.",
    },
    no_plot_selected: {
      type: "warning",
      title: "పొలం ఎంపిక తప్పనిసరి",
      message: "క్లెయిమ్ దాఖలు చేసే ముందు నమోదు చేసిన పొలాన్ని ఎంచుకోవాలి.",
      actionHint: "జాబితా నుండి మీ పొలాన్ని ఎంచుకోండి.",
    },
    missing_angles: {
      type: "warning",
      title: "అన్ని ఫోటోలు అవసరం",
      message: "అవసరమైన అన్ని కోణాల ఫోటోలు ఇంకా తీయబడలేదు.",
      actionHint: "దయచేసి మిగిలిన కోణాలను పూర్తి చేయండి.",
    },
    draft_saved: {
      type: "success",
      title: "డ్రాఫ్ట్ భద్రపరచబడింది",
      message: "మీ గమనికలు ఈ పరికరంలో సురక్షితంగా భద్రపరచబడ్డాయి.",
    },
    claim_submitted: {
      type: "success",
      title: "క్లెయిమ్ విజయవంతంగా సమర్పించబడింది",
      message: "మీ పంట నష్టం క్లెయిమ్ సురక్షితంగా నమోదు చేయబడింది.",
      actionHint: "'నా క్లెయిమ్‌లు' పేజీలో పరిశీలన స్థితిని చూడండి.",
    },
  },
  ur: {
    invalid_session: {
      type: "error",
      title: "سیشن ختم ہو گیا (لاگ ان درکار)",
      message: "آپ کا لاگ ان سیشن ختم ہو گیا ہے۔ آپ کا ڈرافٹ محفوظ ہے۔",
      actionHint: "براہ کرم دوبارہ لاگ ان کریں اور جمع کرائیں۔",
    },
    submission_failed: {
      type: "error",
      title: "جمع کرانا ناکام ہوا",
      message: "نیٹ ورک یا سرور خرابی کی وجہ سے دعویٰ جمع نہیں ہو سکا۔",
      actionHint: "ڈرافٹ محفوظ ہے۔ براہ کرم کچھ دیر بعد دوبارہ کوشش کریں۔",
    },
    duplicate_images: {
      type: "warning",
      title: "ایک جیسی تصاویر پائی گئیں",
      message: "ایک ہی تصویر یا زاویہ بار بار اپ لوڈ کیا گیا ہے۔",
      actionHint: "براہ کرم 3 مختلف زاویوں سے نئی تصاویر لیں۔",
    },
    unusable_lighting: {
      type: "warning",
      title: "ناقص روشنی",
      message: "تصویر بہت تاریک یا ضرورت سے زیادہ روشن ہے۔",
      actionHint: "قدرتی روشنی میں دوبارہ تصویر کھینچیں۔",
    },
    blurry_image: {
      type: "warning",
      title: "دھندلی تصویر",
      message: "کیمرہ ہلنے کی وجہ سے تصویر دھندلی ہو گئی ہے۔",
      actionHint: "فون کو مستحکم پکڑ کر دوبارہ تصویر لیں۔",
    },
    no_plot_selected: {
      type: "warning",
      title: "کھیت منتخب کرنا لازمی ہے",
      message: "دعویٰ جمع کرانے سے پہلے رجسٹرڈ کھیت منتخب کریں۔",
      actionHint: "فہرست میں سے اپنا کھیت منتخب کریں۔",
    },
    missing_angles: {
      type: "warning",
      title: "تمام تصاویر درکار ہیں",
      message: "ابھی تک تمام لازمی زاویوں کی تصاویر نہیں لی گئیں۔",
      actionHint: "براہ کرم باقی زاویے مکمل کریں۔",
    },
    draft_saved: {
      type: "success",
      title: "ڈرافٹ محفوظ ہو گیا",
      message: "آپ کی معلومات اس ڈیوائس پر محفوظ ہیں۔",
    },
    claim_submitted: {
      type: "success",
      title: "دعویٰ کامیابی سے درج ہو گیا",
      message: "آپ کا فصل نقصان کا کلیم محفوظ کر لیا گیا ہے۔",
      actionHint: "'میرے دعوے' والے صفحے پر جانچ کی صورتحال دیکھیں۔",
    },
  },
};

/**
 * Returns farmer-friendly localized notification copy for any of the 15 supported languages.
 */
export function getLocalizedNotification(
  code: NotificationCode,
  lang: AppLang = "hi",
): LocalizedNotificationText {
  if (lang === "en") return EN_NOTIFICATIONS[code];
  if (lang === "hi") return HI_NOTIFICATIONS[code];

  const regional = REGIONAL_NOTIFICATION_OVERLAYS[lang as Exclude<AppLang, "en" | "hi">];
  if (regional && regional[code]) {
    return regional[code]!;
  }

  // Fallback to Hindi for Indian regional languages, or English
  return HI_NOTIFICATIONS[code] || EN_NOTIFICATIONS[code];
}

/**
 * Maps HTTP status codes or API error responses into localized farmer-friendly notification codes.
 */
export function mapApiErrorToNotificationCode(
  statusOrError: number | string,
  rawMessage?: string,
): NotificationCode {
  const status = typeof statusOrError === "number" ? statusOrError : 0;
  const msg = String(rawMessage || statusOrError).toLowerCase();

  if (status === 401 || status === 403 || msg.includes("unauthorized") || msg.includes("session")) {
    return "invalid_session";
  }
  if (msg.includes("duplicate") || msg.includes("same image") || msg.includes("same angle")) {
    return "duplicate_images";
  }
  if (msg.includes("dark") || msg.includes("lighting") || msg.includes("luma")) {
    return "unusable_lighting";
  }
  if (msg.includes("blur") || msg.includes("laplacian")) {
    return "blurry_image";
  }
  if (msg.includes("plot") || msg.includes("no registered plot")) {
    return "no_plot_selected";
  }
  if (msg.includes("quota") || msg.includes("storage full")) {
    return "draft_save_failed";
  }
  return "submission_failed";
}

/**
 * Notification debouncer / deduplication helper.
 * Suppresses repeated notifications with the exact same key within a cooldown window.
 */
class NotificationDebouncer {
  private lastTriggered = new Map<string, number>();

  shouldShow(key: string, cooldownMs = 3500): boolean {
    const now = Date.now();
    const last = this.lastTriggered.get(key);
    if (last && now - last < cooldownMs) {
      return false;
    }
    this.lastTriggered.set(key, now);
    return true;
  }

  clear(): void {
    this.lastTriggered.clear();
  }
}

export const notificationDebouncer = new NotificationDebouncer();
