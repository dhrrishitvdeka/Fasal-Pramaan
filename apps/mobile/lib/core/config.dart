import 'package:flutter/foundation.dart';

class AppConfig {
  /// Android emulator reaches host via 10.0.2.2
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );

  /// Resolve a same-origin path for the Docker/PWA build while retaining
  /// absolute URLs for Android, iOS, and emulator builds.
  static String get resolvedApiBaseUrl {
    if (apiBaseUrl.startsWith('/')) {
      return Uri.base
          .resolve(apiBaseUrl)
          .toString()
          .replaceFirst(RegExp(r'/$'), '');
    }
    return apiBaseUrl.replaceFirst(RegExp(r'/$'), '');
  }

  static const requiredAngles = ['wide_field', 'mid_canopy', 'closeup_damage'];
  static const demoMode =
      bool.fromEnvironment('DEMO_MODE', defaultValue: false);
  static const gpsAccuracyLimitMeters = 50.0;
  static const minImageWidth = 640;
  static const minImageHeight = 480;
  static const maxUploadMb = 15;

  static void assertSafeRuntime() {
    final uri = Uri.parse(apiBaseUrl);
    final sameOriginPath = !uri.hasScheme && apiBaseUrl.startsWith('/');
    if (kReleaseMode && !sameOriginPath && uri.scheme != 'https') {
      throw StateError(
        'Release builds require HTTPS or a same-origin API_BASE_URL path',
      );
    }
    if (kReleaseMode && demoMode) {
      throw StateError('DEMO_MODE cannot be enabled in release builds');
    }
  }
}
