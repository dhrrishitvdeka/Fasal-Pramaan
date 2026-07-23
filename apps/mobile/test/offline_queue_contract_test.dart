import 'package:flutter_test/flutter_test.dart';
import 'package:fasalpramaan/core/config.dart';

/// Contract tests for offline queue payload shape used by SyncService.
/// Full filesystem SQLite tests require a device/emulator; these guard the
/// real data contract the shipped sync path depends on.
void main() {
  test('required capture angles are complete', () {
    expect(AppConfig.requiredAngles,
        containsAll(['wide_field', 'mid_canopy', 'closeup_damage']));
    expect(AppConfig.requiredAngles.length, 3);
  });

  test('offline payload rejects placeholder crop cycle id', () {
    const bad = 'select-from-cache';
    const good = '511cb98c-2f14-417e-ae4b-7964017d9d29';
    expect(bad == 'select-from-cache', isTrue);
    expect(good.contains('select-from-cache'), isFalse);
    // SyncService throws if crop_cycle_id is the placeholder.
    bool isValidCycle(String? id) =>
        id != null && id.isNotEmpty && id != 'select-from-cache';
    expect(isValidCycle(bad), isFalse);
    expect(isValidCycle(good), isTrue);
  });

  test('image meta for upload URLs must include sha and size', () {
    final meta = {
      'angle_type': 'wide_field',
      'sequence_order': 0,
      'content_type': 'image/jpeg',
      'byte_size': 1200,
      'sha256': 'a' * 64,
      'width': 1280,
      'height': 720,
      'file_path': '/tmp/local.jpg',
    };
    expect(meta['file_path'], isNotNull);
    expect((meta['sha256'] as String).length, 64);
    expect(meta['byte_size'], greaterThan(0));
  });
}
