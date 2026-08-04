import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:fasalpramaan/services/image_quality.dart';
import 'package:fasalpramaan/services/location_integrity.dart';

/// Non-blurry, full-res fixture so only GPS policy can fail validation.
Uint8List _sharpJpeg({int w = 1280, int h = 720}) {
  final image = img.Image(width: w, height: h);
  for (final p in image) {
    final green = ((p.x ~/ 24) + (p.y ~/ 24)).isEven ? 55 : 190;
    p
      ..r = 40
      ..g = green
      ..b = 40;
  }
  return Uint8List.fromList(img.encodeJpg(image));
}

void main() {
  test('refuses mock location via integrity helper', () {
    final r = evaluateLocationIntegrity(
      hasFix: true,
      isMock: true,
      accuracyM: 10,
    );
    expect(r.ok, isFalse);
    expect(r.issues, contains('mock_location'));
    expect(shouldRefuseCapture(r), isTrue);
  });

  test('allows real GPS within accuracy', () {
    final r = evaluateLocationIntegrity(
      hasFix: true,
      isMock: false,
      accuracyM: 12,
    );
    expect(r.ok, isTrue);
    expect(shouldRefuseCapture(r), isFalse);
  });

  test('refuses GPS outside the evidence accuracy limit', () {
    final r = evaluateLocationIntegrity(
      hasFix: true,
      isMock: false,
      accuracyM: 80,
    );
    expect(r.issues, contains('weak_gps'));
    expect(shouldRefuseCapture(r), isTrue);
  });

  test('validateCapture ok=false solely from isMockLocation on sharp image',
      () {
    final bytes = _sharpJpeg();
    // Control: good image + real GPS must pass
    final good = validateCapture(
      bytes: bytes,
      gpsAccuracyM: 10,
      hasGps: true,
      isMockLocation: false,
    );
    expect(good.ok, isTrue,
        reason: 'fixture must not fail blur/res so mock is isolated');
    expect(good.issues.any((i) => i.code == 'blur'), isFalse);

    // Same image + mock GPS must refuse
    final mock = validateCapture(
      bytes: bytes,
      gpsAccuracyM: 10,
      hasGps: true,
      isMockLocation: true,
    );
    expect(mock.ok, isFalse);
    expect(mock.issues.any((i) => i.code == 'mock_location'), isTrue);
    // No other blocking codes required for failure
    final blockingCodes = mock.issues
        .map((i) => i.code)
        .where((c) => {
              'blur',
              'missing_gps',
              'duplicate',
              'low_res',
              'decode',
              'mock_location'
            }.contains(c))
        .toSet();
    expect(blockingCodes, equals({'mock_location'}));
  });

  test('validateCapture allowMockInDebug bypasses refuse', () {
    final r = validateCapture(
      bytes: _sharpJpeg(),
      gpsAccuracyM: 10,
      hasGps: true,
      isMockLocation: true,
      allowMockInDebug: true,
    );
    expect(r.issues.any((i) => i.code == 'mock_location'), isFalse);
    expect(r.ok, isTrue);
  });
}
