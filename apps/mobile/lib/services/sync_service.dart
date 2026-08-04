import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:fasalpramaan/services/api_client.dart';
import 'package:fasalpramaan/services/offline_db.dart';
import 'package:fasalpramaan/services/sync_backoff.dart';
import 'package:uuid/uuid.dart';
import 'dart:async';

/// Full offline → online sync: draft → presigned PUT → confirm → finalize.
class SyncService {
  SyncService(this.api, this.db, {SyncBackoff? backoff})
      : backoff = backoff ?? defaultSyncBackoff;
  final ApiClient api;
  final OfflineDb db;
  final SyncBackoff backoff;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  bool _syncing = false;

  void startAutoSync() {
    _connectivitySubscription ??=
        Connectivity().onConnectivityChanged.listen((result) {
      if (!result.contains(ConnectivityResult.none)) {
        unawaited(_runSingleSync());
      }
    });
  }

  Future<void> _runSingleSync() async {
    if (_syncing) return;
    _syncing = true;
    try {
      await syncNow();
    } finally {
      _syncing = false;
    }
  }

  Future<void> dispose() async => _connectivitySubscription?.cancel();

  Future<bool> hasConnectivity() async {
    final result = await Connectivity().checkConnectivity();
    return !result.contains(ConnectivityResult.none);
  }

  /// Delay before next retry (exponential + full jitter). Exposed for tests.
  Duration retryDelayFor(int retryCount) =>
      Duration(seconds: backoff.nextDelaySeconds(retryCount));

  /// Push queued local submissions through the complete upload pipeline.
  /// Returns number of submissions successfully finalized on the server.
  Future<int> syncNow() async {
    if (!await hasConnectivity()) return 0;
    final queue = await db.listQueue();
    var synced = 0;
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    for (final item in queue) {
      final status = item['status'] as String;
      if (!{'draft', 'queued', 'failed'}.contains(status)) continue;
      final payload = Map<String, dynamic>.from(item['payload'] as Map);
      final localId = item['local_id'] as String;
      final retries = (item['retry_count'] as int?) ?? 0;
      if (backoff.shouldGiveUp(retries)) {
        print('SyncService: giving up on $localId after $retries retries');
        continue;
      }
      // Honour next_retry_at when set (exponential backoff with jitter).
      final nextRetry = item['next_retry_at'] as int?;
      if (nextRetry != null && nextRetry > nowMs) {
        continue;
      }
      try {
        await db.updateSubmissionStatus(localId, 'uploading',
            retryCount: retries);

        final cropCycleId = payload['crop_cycle_id'] as String?;
        if (cropCycleId == null ||
            cropCycleId.isEmpty ||
            cropCycleId == 'select-from-cache') {
          throw StateError(
              'Missing crop_cycle_id on local submission $localId');
        }

        var serverId = item['server_id'] as String?;
        if (serverId == null || serverId.isEmpty) {
          final draft = await api.createDraft({
            'crop_cycle_id': cropCycleId,
            'idempotency_key': item['idempotency_key'],
            'capture_lat': payload['capture_lat'],
            'capture_lon': payload['capture_lon'],
            'capture_accuracy_m': payload['capture_accuracy_m'],
            'farmer_observations': payload['farmer_observations'],
            if (payload['growth_stage_id'] != null)
              'growth_stage_id': payload['growth_stage_id'],
            'offline_created': true,
            'device_id': await api.deviceId(),
            if (payload['capture_timestamp'] != null)
              'capture_timestamp': payload['capture_timestamp'],
          });
          serverId = draft['id'] as String;
        }
        await db.updateSubmissionStatus(localId, 'uploading',
            serverId: serverId);

        final localImages = await db.listLocalImages(localId);
        if (localImages.isEmpty) {
          throw StateError('No local image bytes for submission $localId');
        }

        final meta = <Map<String, dynamic>>[];
        for (final img in localImages) {
          meta.add({
            'angle_type': img['angle_type'],
            'sequence_order': img['sequence_order'],
            'content_type': img['content_type'] ?? 'image/jpeg',
            'byte_size': img['byte_size'],
            'sha256': img['sha256'],
            'width': img['width'],
            'height': img['height'],
            'capture_lat': img['capture_lat'],
            'capture_lon': img['capture_lon'],
            'capture_accuracy_m': img['capture_accuracy_m'],
            'captured_at': img['captured_at'],
          });
        }

        final urlResp = await api.requestUploadUrls(serverId, meta);
        final uploads = (urlResp['uploads'] as List).cast<Map>();
        final confirms = <Map<String, dynamic>>[];

        for (final u in uploads) {
          if (u['method'] == 'ALREADY_UPLOADED') {
            continue;
          }
          if (u['method'] == 'VERIFY_EXISTING') {
            confirms.add({'image_id': u['image_id']});
            continue;
          }
          final angle = u['angle_type'] as String;
          final local = localImages.firstWhere((i) => i['angle_type'] == angle);
          final bytes = await db.readImageBytes(
            local['file_path'] as String,
            encrypted: (local['encrypted'] as int? ?? 0) == 1,
          );
          if (bytes == null || bytes.isEmpty) {
            throw StateError('Missing file for angle $angle');
          }
          await api.putPresigned(
            u['upload_url'] as String,
            bytes,
            contentType: (local['content_type'] as String?) ?? 'image/jpeg',
            signedHeaders: Map<String, dynamic>.from(
              (u['headers'] as Map?) ?? const {},
            ),
          );
          confirms.add({'image_id': u['image_id']});
        }

        if (confirms.isNotEmpty) {
          await api.confirmUploads(serverId, confirms);
        }
        final finalized = await api.finalize(serverId);
        final serverStatus = finalized['status'] as String? ?? 'uploaded';

        await db.updateSubmissionStatus(localId, serverStatus,
            serverId: serverId);
        final acknowledgements = await api.syncPush([
          {
            'client_op_id': const Uuid().v4(),
            'operation_type': 'submission_finalize',
            'payload': {
              'id': serverId,
              'local_id': localId,
              'status': serverStatus,
            },
          }
        ]);
        if (acknowledgements.length != 1 ||
            (acknowledgements.first as Map)['status'] != 'acknowledged') {
          throw StateError('Server did not acknowledge finalized evidence');
        }

        // Only drop local row after server confirmed persistence of the submission.
        await db.deleteIfServerConfirmed(localId, serverStatus);
        synced++;
      } catch (e, stackTrace) {
        print('SyncService: Error during sync of localId $localId: $e');
        print(stackTrace);
        final nextRetries = retries + 1;
        final delaySec = backoff.nextDelaySeconds(nextRetries);
        final nextAt = DateTime.now().millisecondsSinceEpoch + delaySec * 1000;
        await db.updateSubmissionStatus(
          localId,
          'failed',
          retryCount: nextRetries,
          nextRetryAt: nextAt,
        );
        // Never silent-delete on failure.
      }
    }
    return synced;
  }
}
