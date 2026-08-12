import 'dart:io';

import 'package:fasalpramaan/core/config.dart';
import 'package:fasalpramaan/services/image_quality.dart';
import 'package:fasalpramaan/services/local_capture_fallback.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

void main() {
  test('local fallback frames are distinct decodable JPEGs', () {
    const angles = [
      'wide_field',
      'left_context',
      'mid_canopy',
      'right_context',
      'closeup_damage',
    ];
    final hashes = <String>{};
    for (final angle in angles) {
      final bytes = buildLocalFallbackJpeg(angle);
      final decoded = img.decodeImage(bytes);
      expect(decoded, isNotNull);
      expect(decoded!.width, greaterThanOrEqualTo(640));
      expect(decoded.height, greaterThanOrEqualTo(480));
      final quality = validateCapture(
        bytes: bytes,
        gpsAccuracyM: localFallbackAccuracyM,
        hasGps: true,
      );
      expect(quality.ok, isTrue, reason: quality.issues.map((i) => i.code).join(','));
      expect(hashes.add(quality.sha256), isTrue);
    }
  });

  test('release boot refuses DEMO_MODE but allows same-origin web', () {
    expect(
      () => AppConfig.checkSafeRuntime(
        releaseMode: true,
        enableDemoMode: true,
        apiBase: '/backend',
      ),
      throwsA(isA<StateError>()),
    );
    expect(
      () => AppConfig.checkSafeRuntime(
        releaseMode: true,
        enableDemoMode: false,
        apiBase: '/backend',
      ),
      returnsNormally,
    );
  });

  test('docker release web build does not enable DEMO_MODE', () {
    final dockerfile = File('Dockerfile');
    expect(dockerfile.existsSync(), isTrue);
    final body = dockerfile.readAsStringSync();
    expect(body.contains('--dart-define=DEMO_MODE=true'), isFalse);
    expect(body.contains('--dart-define=API_BASE_URL='), isTrue);
  });
}
