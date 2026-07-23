import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:fasalpramaan/services/image_quality.dart';

Uint8List _jpeg({int w = 1280, int h = 720, int g = 120}) {
  final image = img.Image(width: w, height: h);
  for (final p in image) {
    final shade = ((p.x ~/ 24) + (p.y ~/ 24)).isEven ? 40 : g + 50;
    p
      ..r = shade
      ..g = shade
      ..b = shade;
  }
  return Uint8List.fromList(img.encodeJpg(image));
}

void main() {
  test('accepts reasonable capture', () {
    final bytes = _jpeg();
    final r = validateCapture(bytes: bytes, gpsAccuracyM: 10, hasGps: true);
    expect(r.ok, isTrue);
    expect(r.sha256.length, 64);
  });

  test('rejects missing GPS', () {
    final r =
        validateCapture(bytes: _jpeg(), gpsAccuracyM: null, hasGps: false);
    expect(r.ok, isFalse);
    expect(r.issues.any((i) => i.code == 'missing_gps'), isTrue);
  });

  test('rejects weak GPS', () {
    final r = validateCapture(bytes: _jpeg(), gpsAccuracyM: 80, hasGps: true);
    expect(r.ok, isFalse);
    expect(r.issues.any((i) => i.code == 'weak_gps'), isTrue);
  });

  test('rejects duplicate hash', () {
    final bytes = _jpeg();
    final first = validateCapture(bytes: bytes, gpsAccuracyM: 10, hasGps: true);
    final second = validateCapture(
      bytes: bytes,
      gpsAccuracyM: 10,
      hasGps: true,
      knownHashes: {first.sha256},
    );
    expect(second.ok, isFalse);
    expect(second.issues.any((i) => i.code == 'duplicate'), isTrue);
  });

  test('rejects low resolution', () {
    final r = validateCapture(
        bytes: _jpeg(w: 100, h: 80), gpsAccuracyM: 10, hasGps: true);
    expect(r.issues.any((i) => i.code == 'low_res'), isTrue);
  });

  test('rejects mock location as blocking even when image is sharp', () {
    final bytes = _jpeg();
    final baseline =
        validateCapture(bytes: bytes, gpsAccuracyM: 10, hasGps: true);
    expect(baseline.ok, isTrue);

    final r = validateCapture(
      bytes: bytes,
      gpsAccuracyM: 10,
      hasGps: true,
      isMockLocation: true,
    );
    expect(r.ok, isFalse);
    expect(r.issues.any((i) => i.code == 'mock_location'), isTrue);
  });
}
