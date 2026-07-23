import 'package:geolocator/geolocator.dart';

/// GPS spoofing / mock-location detection (xyz.md §2).
///
/// Platform plugins supply [isMock] from Android `Location.isFromMockProvider`
/// or iOS equivalent. Pure helpers below are unit-tested without device GPS.
class LocationIntegrityResult {
  LocationIntegrityResult({
    required this.ok,
    required this.isMock,
    required this.issues,
  });

  final bool ok;
  final bool isMock;
  final List<String> issues;
}

class LocationAudit {
  LocationAudit({
    required this.ok,
    required this.hasGps,
    required this.isMockLocation,
    required this.accuracyMeters,
    required this.position,
    required this.issues,
  });

  final bool ok;
  final bool hasGps;
  final bool isMockLocation;
  final double? accuracyMeters;
  final Position? position;
  final List<String> issues;
}

/// Evaluate capture location integrity.
///
/// [isMock] — true when OS reports mock/fake location.
/// [accuracyM] — horizontal accuracy; null if unknown.
/// [allowMockInDebug] — only for local development builds.
LocationIntegrityResult evaluateLocationIntegrity({
  required bool hasFix,
  required bool isMock,
  double? accuracyM,
  double maxAccuracyM = 50.0,
  bool allowMockInDebug = false,
}) {
  final issues = <String>[];
  if (!hasFix) {
    issues.add('missing_gps');
  }
  if (isMock && !allowMockInDebug) {
    issues.add('mock_location');
  }
  if (accuracyM != null && accuracyM > maxAccuracyM) {
    issues.add('weak_gps');
  }
  return LocationIntegrityResult(
    ok: issues.isEmpty,
    isMock: isMock,
    issues: issues,
  );
}

/// Perform live device GPS audit with mock location detection.
Future<LocationAudit> auditLocationIntegrity({bool allowMockInDebug = false}) async {
  try {
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return LocationAudit(
        ok: false,
        hasGps: false,
        isMockLocation: false,
        accuracyMeters: null,
        position: null,
        issues: ['missing_gps'],
      );
    }
    final position = await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
      timeLimit: const Duration(seconds: 5),
    );
    final isMock = position.isMocked;
    final eval = evaluateLocationIntegrity(
      hasFix: true,
      isMock: isMock,
      accuracyM: position.accuracy,
      allowMockInDebug: allowMockInDebug,
    );
    return LocationAudit(
      ok: eval.ok,
      hasGps: true,
      isMockLocation: isMock,
      accuracyMeters: position.accuracy,
      position: position,
      issues: eval.issues,
    );
  } catch (_) {
    return LocationAudit(
      ok: false,
      hasGps: false,
      isMockLocation: false,
      accuracyMeters: null,
      position: null,
      issues: ['missing_gps'],
    );
  }
}

/// Whether capture must be refused (hard fail) vs only flagged.
bool shouldRefuseCapture(LocationIntegrityResult r) {
  return r.issues.contains('mock_location') ||
      r.issues.contains('missing_gps') ||
      r.issues.contains('weak_gps');
}
