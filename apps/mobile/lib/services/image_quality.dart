import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;
import 'package:flutter/foundation.dart';
import 'package:fasalpramaan/core/config.dart';

class QualityIssue {
  QualityIssue(this.code, this.message);
  final String code;
  final String message;
}

class ImageQualityResult {
  ImageQualityResult({
    required this.ok,
    required this.issues,
    required this.sha256,
    required this.width,
    required this.height,
    this.blurScore,
    this.brightness,
  });
  final bool ok;
  final List<QualityIssue> issues;
  final String sha256;
  final int width;
  final int height;
  final double? blurScore;
  final double? brightness;
}

/// On-device quality checks before accepting a capture.
///
/// [isMockLocation] — when true (OS mock-location / fake GPS), capture is refused
/// unless [allowMockInDebug] is true (xyz.md §2).
ImageQualityResult validateCapture({
  required Uint8List bytes,
  required double? gpsAccuracyM,
  required bool hasGps,
  bool isMockLocation = false,
  bool allowMockInDebug = false,
  Set<String> knownHashes = const {},
  String locale = 'en',
}) {
  final issues = <QualityIssue>[];
  final digest = sha256.convert(bytes).toString();

  if (knownHashes.contains(digest)) {
    issues.add(QualityIssue(
      'duplicate',
      locale == 'hi'
          ? 'यह तस्वीर पहले जमा की जा चुकी लगती है।'
          : 'This photograph appears to have been submitted earlier.',
    ));
  }

  if (isMockLocation && !allowMockInDebug) {
    issues.add(QualityIssue(
      'mock_location',
      locale == 'hi'
          ? 'नकली GPS स्थान का पता चला। वास्तविक स्थान चालू करें।'
          : 'Mock/fake GPS location detected. Enable real location services.',
    ));
  }

  if (!hasGps) {
    issues.add(QualityIssue('missing_gps',
        locale == 'hi' ? 'GPS उपलब्ध नहीं है।' : 'GPS is missing.'));
  } else if (gpsAccuracyM != null &&
      gpsAccuracyM > AppConfig.gpsAccuracyLimitMeters) {
    issues.add(QualityIssue(
      'weak_gps',
      locale == 'hi'
          ? 'GPS सटीकता कमजोर है। कैप्चर से पहले कुछ सेकंड प्रतीक्षा करें।'
          : 'GPS accuracy is weak. Wait a few seconds before capturing.',
    ));
  }

  final decoded = img.decodeImage(bytes);
  if (decoded == null) {
    issues.add(QualityIssue('decode', 'Could not read image.'));
    return ImageQualityResult(
        ok: false, issues: issues, sha256: digest, width: 0, height: 0);
  }

  if (decoded.width < AppConfig.minImageWidth ||
      decoded.height < AppConfig.minImageHeight) {
    issues.add(QualityIssue(
      'low_res',
      locale == 'hi'
          ? 'रिज़ॉल्यूशन बहुत कम है।'
          : 'Very low resolution. Use a higher quality photo.',
    ));
  }

  // Screenshot-ish aspect (very tall/wide phone UI) heuristic
  final aspect = decoded.width / max(decoded.height, 1);
  if (aspect > 2.4 || aspect < 0.35) {
    issues.add(QualityIssue(
      'screenshot_suspected',
      locale == 'hi'
          ? 'यह स्क्रीनशॉट या पुन: उपयोग की गई फ़ाइल लगती है।'
          : 'This photograph may be a screenshot or re-used file.',
    ));
  }

  // Brightness & blur heuristics on a downscaled grayscale sample
  final small = img.copyResize(decoded, width: 160);
  var sum = 0;
  var count = 0;
  var edge = 0.0;
  for (var y = 1; y < small.height - 1; y++) {
    for (var x = 1; x < small.width - 1; x++) {
      final p = small.getPixel(x, y);
      final g = (p.r + p.g + p.b) / 3.0;
      sum += g.toInt();
      count++;
      final left = small.getPixel(x - 1, y);
      final top = small.getPixel(x, y - 1);
      final gl = (left.r + left.g + left.b) / 3.0;
      final gt = (top.r + top.g + top.b) / 3.0;
      edge += ((g - gl).abs() + (g - gt).abs()) / 2;
    }
  }
  final brightness = count == 0 ? 128.0 : sum / count;
  final blurScore = count == 0 ? 0.0 : edge / count;

  if (brightness < 35) {
    issues.add(QualityIssue(
      'underexposed',
      locale == 'hi'
          ? 'तस्वीर बहुत अँधेरी है।'
          : 'The photograph is severely underexposed.',
    ));
  }
  if (brightness > 230) {
    issues.add(QualityIssue(
      'overexposed',
      locale == 'hi'
          ? 'तस्वीर बहुत चमकदार है।'
          : 'The photograph is severely overexposed.',
    ));
  }
  if (blurScore < 4.0) {
    issues.add(QualityIssue(
      'blur',
      locale == 'hi'
          ? 'तस्वीर धुंधली है। फ़ोन स्थिर रखें और फिर से लें।'
          : 'The photograph is blurry. Hold the phone steady and retake it.',
    ));
  }

  // Blocking issues refuse the capture (xyz.md §2: mock GPS must refuse).
  final blocking = issues.any((i) => {
        'blur',
        'missing_gps',
        'weak_gps',
        'duplicate',
        'low_res',
        'decode',
        'mock_location',
        'underexposed',
        'overexposed',
        'screenshot_suspected',
      }.contains(i.code));

  return ImageQualityResult(
    ok: !blocking,
    issues: issues,
    sha256: digest,
    width: decoded.width,
    height: decoded.height,
    blurScore: blurScore,
    brightness: brightness,
  );
}

/// Asynchronous quality check that offloads CPU decoding to a background isolate on mobile devices.
Future<ImageQualityResult> validateCaptureAsync({
  required Uint8List bytes,
  required double? gpsAccuracyM,
  required bool hasGps,
  bool isMockLocation = false,
  bool allowMockInDebug = false,
  Set<String> knownHashes = const {},
  String locale = 'en',
}) async {
  if (kIsWeb) {
    return validateCapture(
      bytes: bytes,
      gpsAccuracyM: gpsAccuracyM,
      hasGps: hasGps,
      isMockLocation: isMockLocation,
      allowMockInDebug: allowMockInDebug,
      knownHashes: knownHashes,
      locale: locale,
    );
  }
  return compute((params) {
    return validateCapture(
      bytes: params['bytes'] as Uint8List,
      gpsAccuracyM: params['gpsAccuracyM'] as double?,
      hasGps: params['hasGps'] as bool,
      isMockLocation: params['isMockLocation'] as bool,
      allowMockInDebug: params['allowMockInDebug'] as bool,
      knownHashes: params['knownHashes'] as Set<String>,
      locale: params['locale'] as String,
    );
  }, {
    'bytes': bytes,
    'gpsAccuracyM': gpsAccuracyM,
    'hasGps': hasGps,
    'isMockLocation': isMockLocation,
    'allowMockInDebug': allowMockInDebug,
    'knownHashes': knownHashes,
    'locale': locale,
  });
}
