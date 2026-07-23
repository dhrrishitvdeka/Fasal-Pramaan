import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class LocaleNotifier extends Notifier<Locale> {
  @override
  Locale build() => const Locale('en');

  void setLocale(Locale locale) => state = locale;
}

final localeProvider = NotifierProvider<LocaleNotifier, Locale>(
  LocaleNotifier.new,
);

class S {
  S(this.locale);
  final Locale locale;

  static S of(WidgetRef ref) => S(ref.watch(localeProvider));

  bool get isHi => locale.languageCode == 'hi';

  // Branding
  String get appName => isHi ? 'फसल प्रमाण AI' : 'FasalPramaan AI';
  String get tagline =>
      isHi ? 'हर फसल का डिजिटल प्रमाण' : 'Capture. Verify. Protect.';
  String get digitalEvidence => isHi
      ? 'प्रत्येक फसल का डिजिटल साक्ष्य'
      : 'Digital Evidence for Every Crop';

  // Navigation & Actions
  String get signIn => isHi ? 'साइन इन करें' : 'Sign In';
  String get register => isHi ? 'खाता बनाएं' : 'Create Account';
  String get home => isHi ? 'मुख्य पृष्ठ' : 'Home';
  String get farms => isHi ? 'खेत और फसल चक्र' : 'Farms & Crop Cycles';
  String get capture => isHi ? 'फसल प्रमाण कैप्चर' : 'Capture Crop Evidence';
  String get queue => isHi ? 'ऑफ़लाइन कतार और सिंक' : 'Offline Queue & Sync';
  String get results => isHi ? 'मूल्यांकन परिणाम' : 'Assessment Results';
  String get notifications => isHi ? 'सूचनाएं' : 'Notifications';
  String get settings => isHi ? 'सेटिंग्स और विन्यास' : 'Settings & Config';
  String get profile => isHi ? 'प्रोफ़ाइल और खाता' : 'Profile & Account';
  String get help => isHi ? 'सहायता और ट्यूटोरियल' : 'Help & Tutorial';

  // Home Screen
  String get welcomeFarmer => isHi ? 'स्वागत है, किसान' : 'Welcome, Farmer';
  String get officerPortal => isHi ? 'अधिकारी पोर्टल' : 'Officer Portal';
  String get officerSubtitle => isHi
      ? 'प्लाटों का सत्यापन करें और किसानों की ओर से साक्ष्य लें'
      : 'Verify plots & capture on behalf of farmers';
  String get guidedGpsSubtitle => isHi
      ? 'मार्गदर्शित GPS बहु-कोण फोटो कैप्चर'
      : 'Guided GPS multi-angle photo capture';
  String get quickAccess => isHi ? 'मुख्य विकल्प' : 'Quick Access';
  String get officerTools => isHi ? 'अधिकारी टूल' : 'Officer Tools';
  String get myFarmsSubtitle => isHi
      ? 'पंजीकृत प्लाट और फसल चक्र देखें'
      : 'View registered plots and crop cycles';
  String get queueSubtitle => isHi
      ? 'लोकल ड्राफ्ट और अपलोड स्थिति का प्रबंधन करें'
      : 'Manage local drafts and upload status';
  String get resultsSubtitle => isHi
      ? 'AI और समीक्षा की स्थिति जांचें'
      : 'Check AI and reviewer evaluation statuses';
  String get helpSubtitle => isHi
      ? 'कैप्चर दिशानिर्देश और गुणवत्ता युक्तियाँ'
      : 'Capture guidelines and quality tips';
  String get profileSubtitle => isHi
      ? 'उपयोगकर्ता विवरण और भाषा प्रबंधित करें'
      : 'Manage user details and language';

  // Auth Screens
  String get chooseLanguage => isHi ? 'भाषा चुनें' : 'Select Language';
  String get chooseLanguageSubtitle => isHi
      ? 'अपनी पसंदीदा भाषा चुनें'
      : 'Choose your preferred language';
  String get emailLabel => isHi ? 'ईमेल पता' : 'Email Address';
  String get passwordLabel => isHi ? 'पासवर्ड (न्यूनतम 8 अक्षर)' : 'Password (min 8 chars)';
  String get fullNameLabel => isHi ? 'पूरा नाम' : 'Full Name';
  String get phoneLabel => isHi ? 'फोन नंबर (वैकल्पिक)' : 'Phone Number (Optional)';
  String get dontHaveAccount => isHi ? 'खाता नहीं है?' : 'Don\'t have an account?';
  String get alreadyHaveAccount => isHi ? 'पहले से खाता है?' : 'Already have an account?';
  String get backToSignIn => isHi ? 'साइन इन पर लौटें' : 'Back to Sign In';
  String get demoCredentialsNotice => isHi
      ? 'डेमो क्रेडेंशियल लोड किए गए'
      : 'Demo Credentials Loaded';

  // Farms Screen & Dialogs
  String get addFarm => isHi ? 'नया खेत जोड़ें' : 'Add Farm';
  String get registerNewFarm => isHi ? 'नया खेत पंजीकृत करें' : 'Register New Farm';
  String get farmNameLabel => isHi ? 'खेत का नाम' : 'Farm Name';
  String get areaHectaresLabel => isHi ? 'कुल क्षेत्रफल (हेक्टेयर)' : 'Total Area (Hectares)';
  String get addPlot => isHi ? 'प्लॉट जोड़ें' : 'Add Plot';
  String get addPlotBoundary => isHi ? 'प्लॉट सीमा जोड़ें' : 'Add Plot Boundary';
  String get plotNameLabel => isHi ? 'प्लॉट का नाम' : 'Plot Name';
  String get centroidLatLabel => isHi ? 'अक्षांश (Latitude)' : 'Centroid Latitude';
  String get centroidLonLabel => isHi ? 'देशांतर (Longitude)' : 'Centroid Longitude';
  String get startCropCycle => isHi ? 'फसल चक्र शुरू करें' : 'Start Crop Cycle';
  String get cropTypeLabel => isHi ? 'फसल का प्रकार' : 'Crop Type';
  String get registeredFarms => isHi ? 'पंजीकृत खेत' : 'Registered Farms';
  String get activeCropCycles => isHi ? 'सक्रिय फसल चक्र' : 'Active Crop Cycles';
  String get cancel => isHi ? 'रद्द करें' : 'Cancel';

  // Queue Screen
  String get encryptedQueueTitle => isHi
      ? 'AES-256-GCM एन्क्रिप्टेड ऑफ़लाइन स्टोर'
      : 'AES-256-GCM Encrypted Offline Store';
  String get allEvidenceSynced => isHi ? 'सभी साक्ष्य सिंक हो चुके हैं' : 'All Evidence Synced';
  String get syncNow => isHi ? 'अभी सिंक करें' : 'Sync Now';
  String get syncing => isHi ? 'सिंक हो रहा है...' : 'Syncing...';

  // Results Screen
  String get screeningGrade => isHi ? 'स्क्रीनिंग ग्रेड' : 'Screening Grade';
  String get damageSeverity => isHi ? 'क्षति की गंभीरता' : 'Damage Severity';
  String get primaryPeril => isHi ? 'मुख्य संकट' : 'Primary Peril';
  String get captureReplacement => isHi
      ? 'प्रतिस्थापन साक्ष्य कैप्चर करें'
      : 'Capture Replacement Evidence';
  String get assistiveNotice => isHi
      ? 'सहायक AI जांच · अधिकारी समीक्षा के अधीन'
      : 'Assistive AI check · Subject to mandatory officer review';
  String get noSubmissions => isHi ? 'कोई मूल्यांकन प्रस्तुतियाँ नहीं' : 'No Assessment Submissions';

  // Settings & Profile
  String get appPreferences => isHi ? 'ऐप प्राथमिकताएं' : 'App Preferences';
  String get hindiLanguage => isHi ? 'हिन्दी भाषा' : 'Hindi Language';
  String get targetApiBase => isHi ? 'लक्ष्य API बेस URL' : 'Target API Base URL';
  String get systemSecurity => isHi ? 'सुरक्षा और एन्क्रिप्शन' : 'App Security & Encryption';
  String get logout => isHi ? 'लॉग आउट' : 'Logout';
  String get signOut => isHi ? 'लॉग आउट करें' : 'Sign Out';
  String get assignedRoles => isHi ? 'आवंटित भूमिकाएं' : 'Assigned Roles';
  String get preferredLanguage => isHi ? 'पसंदीदा भाषा' : 'Preferred Language';

  // Quality Validation Messages
  String get blurry => isHi
      ? 'तस्वीर धुंधली है। फ़ोन स्थिर रखें और फिर से लें।'
      : 'The photograph is blurry. Hold the phone steady and retake it.';
  String get weakGps => isHi
      ? 'GPS सटीकता कमजोर है। कैप्चर से पहले कुछ सेकंड प्रतीक्षा करें।'
      : 'GPS accuracy is weak. Wait a few seconds before capturing.';
  String get duplicate => isHi
      ? 'यह तस्वीर पहले जमा की जा चुकी है।'
      : 'This photograph appears to have been submitted earlier.';
  String get moveCloser =>
      isHi ? 'प्रभावित फसल के करीब जाएँ।' : 'Move closer to the affected crop.';
}
