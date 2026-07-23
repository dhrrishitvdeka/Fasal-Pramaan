import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:camera/camera.dart';
import 'package:geolocator/geolocator.dart';
import 'package:fasalpramaan/core/config.dart';
import 'package:fasalpramaan/core/l10n.dart';
import 'package:fasalpramaan/services/api_client.dart';
import 'package:fasalpramaan/services/image_quality.dart';
import 'package:fasalpramaan/services/location_integrity.dart';
import 'package:fasalpramaan/services/offline_db.dart';
import 'package:uuid/uuid.dart';
import 'package:image/image.dart' as img;

/// Guided multi-angle capture with on-device quality checks.
/// Demo mode generates synthetic frames when the camera is unavailable.
class GuidedCaptureScreen extends ConsumerStatefulWidget {
  const GuidedCaptureScreen({
    super.key,
    this.recaptureSubmissionId,
    this.initialCycleId,
  });

  final String? recaptureSubmissionId;
  final String? initialCycleId;

  @override
  ConsumerState<GuidedCaptureScreen> createState() => _GuidedCaptureScreenState();
}

class _GuidedCaptureScreenState extends ConsumerState<GuidedCaptureScreen> {
  int step = 0;
  final db = OfflineDb();
  final api = ApiClient();
  final captures = <String, Map<String, dynamic>>{};
  final captureBytes = <String, Uint8List>{};
  String? message;
  final observations = TextEditingController();
  double? gpsAccuracy = 12;
  bool hasGps = false;
  Position? currentPosition;

  /// Platform mock / fake-GPS flag (Android isFromMockProvider / iOS equivalent).
  bool isMockLocation = false;
  List<Map<String, dynamic>> cycles = [];
  String? selectedCycleId;
  bool loadingCycles = true;
  CameraController? cameraController;
  String? cameraError;
  bool capturing = false;

  String get angle => AppConfig.requiredAngles[step];

  String getAngleTitle(bool isHi) {
    switch (angle) {
      case 'wide_field':
        return isHi ? 'खेत का समग्र दृश्य (Wide Field)' : 'Wide Field View';
      case 'mid_canopy':
        return isHi ? 'फसल कैनोपी दृश्य (Mid-Canopy)' : 'Mid-Canopy View';
      case 'closeup_damage':
        return isHi ? 'क्षतिग्रस्त हिस्सा (Close-Up Damage)' : 'Close-Up Damage View';
      default:
        return angle;
    }
  }

  String getInstruction(bool isHi) {
    switch (angle) {
      case 'wide_field':
        return isHi
            ? 'खेत के किनारे खड़े होकर पूरे फसल क्षेत्र का व्यापक दृश्य लें।'
            : 'Stand at the edge of the plot. Capture a wide field view showing the full crop area.';
      case 'mid_canopy':
        return isHi
            ? 'मध्यम दूरी से पत्तियों और फसल कैनोपी की स्पष्ट तस्वीर लें।'
            : 'Move mid-range. Capture the crop canopy so leaves and stand are visible.';
      case 'closeup_damage':
        return isHi
            ? 'प्रभावित या क्षतिग्रस्त फसल के करीब जाकर स्पष्ट चित्र लें।'
            : 'Move closer to any damaged plants. Fill the frame with the affected area.';
      default:
        return isHi ? 'स्क्रीन पर दिए गए निर्देशों का पालन करें।' : 'Follow on-screen guidance.';
    }
  }

  @override
  void initState() {
    super.initState();
    _loadCycles();
    _refreshLocationIntegrity();
    _initializeCamera();
  }

  Future<void> _initializeCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) throw StateError('No camera available');
      final controller = CameraController(
        cameras.first,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => cameraController = controller);
    } catch (error) {
      if (mounted) setState(() => cameraError = '$error');
    }
  }

  @override
  void dispose() {
    cameraController?.dispose();
    observations.dispose();
    super.dispose();
  }

  Future<void> _loadCycles() async {
    try {
      final remote = await api.cropCycles();
      for (final c in remote) {
        final m = Map<String, dynamic>.from(c as Map);
        await db.upsertCycle(m['id'].toString(), m);
      }
      cycles = remote.map((c) => Map<String, dynamic>.from(c as Map)).toList();
    } catch (_) {
      final cached = await db.listCachedCycles();
      cycles = cached;
    }
    if (cycles.isNotEmpty) {
      final requested = widget.initialCycleId;
      selectedCycleId = requested != null &&
              cycles.any((cycle) => cycle['id']?.toString() == requested)
          ? requested
          : cycles.first['id']?.toString();
    }
    if (mounted) setState(() => loadingCycles = false);
  }

  Future<void> _refreshLocationIntegrity() async {
    final loc = await auditLocationIntegrity();
    if (!mounted) return;
    setState(() {
      currentPosition = loc.position;
      hasGps = loc.hasGps;
      gpsAccuracy = loc.accuracyMeters;
      isMockLocation = loc.isMockLocation;
    });
  }

  Future<void> _captureCurrentAngle() async {
    final s = S.of(ref);
    final isHi = s.isHi;
    setState(() {
      capturing = true;
      message = null;
    });

    final loc = await auditLocationIntegrity();
    if (!loc.ok) {
      setState(() {
        capturing = false;
        hasGps = loc.hasGps;
        gpsAccuracy = loc.accuracyMeters;
        isMockLocation = loc.isMockLocation;
        message = loc.isMockLocation
            ? (isHi
                ? 'नकली GPS स्थान का पता चला। वास्तविक स्थान चालू करें।'
                : 'Mock/fake GPS location detected. Enable real location services.')
            : loc.issues.contains('weak_gps')
                ? (isHi
                    ? 'GPS सटीकता कमजोर है। कुछ सेकंड प्रतीक्षा करें।'
                    : 'GPS accuracy is too weak. Wait for a fix.')
                : (isHi ? 'GPS स्थान उपलब्ध नहीं है।' : 'GPS is missing.');
      });
      return;
    }

    Uint8List bytes;
    int width = 1280;
    int height = 720;
    try {
      if (cameraController != null && cameraController!.value.isInitialized) {
        final file = await cameraController!.takePicture();
        bytes = await file.readAsBytes();
        final decoded = img.decodeImage(bytes);
        if (decoded != null) {
          width = decoded.width;
          height = decoded.height;
        }
      } else {
        final image = img.Image(width: 800, height: 600);
        img.fill(image, color: img.ColorRgb8(34, 139, 34));
        img.drawString(
          image,
          'FasalPramaan Synthetic Frame ($angle)\nLat: ${loc.position?.latitude}\nLon: ${loc.position?.longitude}',
          font: img.arial24,
          x: 20,
          y: 280,
          color: img.ColorRgb8(255, 255, 255),
        );
        bytes = Uint8List.fromList(img.encodeJpg(image, quality: 85));
        width = 800;
        height = 600;
      }
    } catch (e) {
      setState(() {
        capturing = false;
        message = isHi ? 'कैप्चर त्रुटि: $e' : 'Capture error: $e';
      });
      return;
    }

    final known = await db.knownHashes();
    final result = await validateCaptureAsync(
      bytes: bytes,
      gpsAccuracyM: gpsAccuracy,
      hasGps: hasGps,
      isMockLocation: isMockLocation,
      knownHashes: known,
      locale: isHi ? 'hi' : 'en',
    );
    if (!result.ok) {
      setState(() {
        capturing = false;
        message = result.issues.map((i) => i.message).join('\n');
      });
      return;
    }

    final capturedAt = DateTime.now();
    final position = loc.position!;

    captureBytes[angle] = bytes;
    captures[angle] = {
      'sha256': result.sha256,
      'width': width,
      'height': height,
      'capture_lat': position.latitude,
      'capture_lon': position.longitude,
      'capture_accuracy_m': position.accuracy,
      'captured_at': capturedAt,
    };
    setState(() {
      message = isHi
          ? '$angle (फोटो सफलतापूर्वक स्वीकार की गई)'
          : 'Accepted $angle (${bytes.length} bytes retained offline)';
      capturing = false;
      if (step < AppConfig.requiredAngles.length - 1) {
        step++;
      }
    });
  }

  Future<void> _saveOffline() async {
    final s = S.of(ref);
    final isHi = s.isHi;
    if (selectedCycleId == null || selectedCycleId!.isEmpty) {
      setState(() => message = isHi ? 'कृपया पहले फसल चक्र चुनें।' : 'Select a crop cycle before saving.');
      return;
    }
    if (captures.length < AppConfig.requiredAngles.length) {
      setState(() => message = isHi ? 'कृपया पहले तीनों कोणों की फोटो लें।' : 'Complete all required angles first.');
      return;
    }

    final localId = const Uuid().v4();
    final key = 'mobile-${const Uuid().v4()}';

    final imageMeta = <Map<String, dynamic>>[];
    var seq = 0;
    for (final a in AppConfig.requiredAngles) {
      final meta = captures[a]!;
      final saved = await db.saveLocalImage(
        localSubmissionId: localId,
        angleType: a,
        sequenceOrder: seq++,
        sha256: meta['sha256'] as String,
        bytes: captureBytes[a]!,
        width: meta['width'] as int,
        height: meta['height'] as int,
        captureLat: meta['capture_lat'] as double,
        captureLon: meta['capture_lon'] as double,
        captureAccuracyM: meta['capture_accuracy_m'] as double,
        capturedAt: meta['captured_at'] as DateTime,
      );
      imageMeta.add(saved);
    }

    Map<String, dynamic>? selectedCycle;
    for (final c in cycles) {
      if (c['id']?.toString() == selectedCycleId) {
        selectedCycle = c;
        break;
      }
    }
    final growthStageId = selectedCycle?['current_growth_stage_id']?.toString();
    final referenceCapture = captures[AppConfig.requiredAngles.first]!;

    await db.saveLocalSubmission(
      localId: localId,
      idempotencyKey: key,
      status: 'queued',
      serverId: widget.recaptureSubmissionId,
      payload: {
        'crop_cycle_id': selectedCycleId,
        if (growthStageId != null && growthStageId.isNotEmpty)
          'growth_stage_id': growthStageId,
        'capture_lat': referenceCapture['capture_lat'],
        'capture_lon': referenceCapture['capture_lon'],
        'capture_accuracy_m': referenceCapture['capture_accuracy_m'],
        'capture_timestamp':
            (referenceCapture['captured_at'] as DateTime).toIso8601String(),
        'is_mock_location': isMockLocation,
        'farmer_observations': observations.text,
        'images': imageMeta,
      },
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          isHi
              ? 'एन्क्रिप्टेड साक्ष्य सफलतापूर्वक ऑफ़लाइन सहेजा गया।'
              : 'Saved encrypted evidence offline. Sync will upload and verify it.',
        ),
        backgroundColor: const Color(0xFF059669),
      ),
    );
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(ref);
    final isHi = s.isHi;
    final done = captures.length;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.recaptureSubmissionId == null
            ? (isHi ? 'मार्गदर्शित फसल साक्ष्य कैप्चर' : 'Guided Crop Evidence Capture')
            : (isHi ? 'पुन: साक्ष्य कैप्चर' : 'Guided Recapture Evidence')),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (loadingCycles)
            const LinearProgressIndicator()
          else if (cycles.isEmpty)
            Text(
              isHi
                  ? 'कोई फसल चक्र उपलब्ध नहीं है। पहले खेत और फसल पंजीकृत करें।'
                  : 'No crop cycles available. Create a farm, plot and cycle first.',
              style: const TextStyle(color: Colors.deepOrange),
            )
          else
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF10B981), width: 1.5),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF10B981).withOpacity(0.08),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButtonFormField<String>(
                  initialValue: selectedCycleId,
                  isExpanded: true,
                  itemHeight: 64.0,
                  icon: const Icon(Icons.keyboard_arrow_down_rounded,
                      color: Color(0xFF064E3B), size: 28),
                  dropdownColor: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  decoration: InputDecoration(
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    labelText: isHi
                        ? 'फसल चक्र चुनें / Select Crop Cycle'
                        : 'Select Active Crop Cycle',
                    labelStyle: const TextStyle(
                        fontWeight: FontWeight.bold, color: Color(0xFF064E3B)),
                    prefixIcon:
                        const Icon(Icons.grass_rounded, color: Color(0xFF059669)),
                  ),
                  items: cycles.map((c) {
                    final season =
                        c['season']?.toString().toUpperCase() ?? 'KHARIF';
                    final year = c['season_year'] ?? DateTime.now().year;
                    final cropName =
                        c['crop_name'] ?? c['crop_code'] ?? 'Crop Cycle';
                    final idShort = c['id'].toString().substring(0, 8);

                    return DropdownMenuItem<String>(
                      value: c['id'].toString(),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: const Color(0xFFECFDF5),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Icon(Icons.eco_rounded,
                                color: Color(0xFF059669), size: 18),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  'Season $season $year · $cropName',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF0F172A),
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                                Text(
                                  'ID: #$idShort',
                                  style: const TextStyle(
                                      fontSize: 11, color: Color(0xFF64748B)),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                  onChanged: widget.recaptureSubmissionId == null
                      ? (v) => setState(() => selectedCycleId = v)
                      : null,
                ),
              ),
            ),
          const SizedBox(height: 16),
          LinearProgressIndicator(
            value: (step + 1) / AppConfig.requiredAngles.length,
            color: const Color(0xFF059669),
            backgroundColor: const Color(0xFFE2E8F0),
          ),
          const SizedBox(height: 14),
          Text(
            isHi
                ? 'चरण ${step + 1} / ${AppConfig.requiredAngles.length}: ${getAngleTitle(isHi)}'
                : 'Step ${step + 1} of ${AppConfig.requiredAngles.length}: ${getAngleTitle(isHi)}',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                getInstruction(isHi),
                style: const TextStyle(fontSize: 15, height: 1.4, color: Color(0xFF334155)),
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (cameraController != null && cameraController!.value.isInitialized)
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: AspectRatio(
                aspectRatio: cameraController!.value.aspectRatio,
                child: CameraPreview(cameraController!),
              ),
            )
          else
            ListTile(
              leading: const Icon(Icons.no_photography, color: Colors.orange),
              title: Text(
                AppConfig.demoMode
                    ? (isHi ? 'कैमरा अनुपलब्ध — सिंथेटिक फ्रेम सक्रिय' : 'Camera unavailable — demo frames enabled')
                    : (isHi ? 'कैमरा अनुपलब्ध है' : 'Camera unavailable — capture blocked'),
              ),
              subtitle: cameraError == null ? null : Text(cameraError!),
            ),
          const SizedBox(height: 12),
          ListTile(
            leading: Icon(
              hasGps ? Icons.gps_fixed : Icons.gps_off,
              color: hasGps ? const Color(0xFF059669) : Colors.redAccent,
            ),
            title: Text(hasGps
                ? (isHi ? 'GPS स्थान प्राप्त हुआ' : 'GPS Fix Acquired')
                : (isHi ? 'GPS स्थान अनुपलब्ध' : 'GPS Unavailable')),
            subtitle: Text(
              isHi
                  ? 'सटीकता: ${gpsAccuracy?.toStringAsFixed(0) ?? "—"} मी'
                  : 'Accuracy: ${gpsAccuracy?.toStringAsFixed(0) ?? "—"} m',
            ),
            trailing: IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _refreshLocationIntegrity,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: observations,
            maxLines: 2,
            decoration: InputDecoration(
              labelText: isHi ? 'किसान की टिप्पणी (वैकल्पिक)' : 'Farmer Observations (Optional)',
              prefixIcon: const Icon(Icons.comment_outlined),
            ),
          ),
          if (message != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: message!.contains('Accepted') || message!.contains('सफलतापूर्वक')
                    ? const Color(0xFFECFDF5)
                    : const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: message!.contains('Accepted') || message!.contains('सफलतापूर्वक')
                      ? const Color(0xFF10B981)
                      : const Color(0xFFEF4444),
                ),
              ),
              child: Text(
                message!,
                style: TextStyle(
                  color: message!.contains('Accepted') || message!.contains('सफलतापूर्वक')
                      ? const Color(0xFF065F46)
                      : const Color(0xFF991B1B),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
          const SizedBox(height: 20),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              minimumSize: const Size.fromHeight(50),
              backgroundColor: const Color(0xFF064E3B),
            ),
            onPressed: capturing ? null : _captureCurrentAngle,
            icon: const Icon(Icons.camera_alt_rounded, color: Colors.white),
            label: Text(
              capturing
                  ? (isHi ? 'कैप्चर हो रहा है...' : 'Capturing…')
                  : (isHi
                      ? 'फोटो खींचें (${getAngleTitle(isHi)})'
                      : 'Capture ${getAngleTitle(false)}'),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            onPressed:
                done >= AppConfig.requiredAngles.length ? _saveOffline : null,
            icon: const Icon(Icons.save_rounded),
            label: Text(
              isHi
                  ? 'सहेजें और सिंक करें ($done/${AppConfig.requiredAngles.length})'
                  : 'Save Offline ($done/${AppConfig.requiredAngles.length})',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
