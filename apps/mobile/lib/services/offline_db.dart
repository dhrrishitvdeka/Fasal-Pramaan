import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:fasalpramaan/services/secure_store.dart';
import 'package:fasalpramaan/services/sync_backoff.dart';

/// Local SQLite store for offline-first drafts and sync queue.
/// Supports Web fallback in-memory store when running in web browsers.
class OfflineDb {
  Database? _db;
  Directory? _mediaDir;
  String? _passphrase;
  Uint8List? _keyMaterial;

  // In-memory fallback stores for Flutter Web
  final Map<String, Map<String, dynamic>> _webFarmsCache = {};
  final Map<String, Map<String, dynamic>> _webCyclesCache = {};
  final Map<String, Map<String, dynamic>> _webSubmissionsLocal = {};
  final List<Map<String, dynamic>> _webSubmissionImages = [];
  final Set<String> _webHashes = {};

  /// When true, submission payloads are field-encrypted before SQLite write.
  bool encryptPayloads = true;

  Future<Directory> get mediaDir async {
    if (_mediaDir != null) return _mediaDir!;
    if (kIsWeb) {
      _mediaDir = Directory('/fasalpramaan_media');
      return _mediaDir!;
    }
    final docs = await getApplicationDocumentsDirectory();
    _mediaDir = Directory(p.join(docs.path, 'fasalpramaan_media'));
    if (!await _mediaDir!.exists()) {
      await _mediaDir!.create(recursive: true);
    }
    return _mediaDir!;
  }

  Future<void> _ensureCrypto() async {
    if (_passphrase != null && _keyMaterial != null) return;
    _passphrase = await resolveDbPassphrase();
    _keyMaterial = deriveKeyMaterial(_passphrase!);
  }

  Future<String> _sealPayload(Map<String, dynamic> payload) async {
    final json = jsonEncode(payload);
    if (!encryptPayloads || _keyMaterial == null) return json;
    final cipher = await encryptBytes(
        Uint8List.fromList(utf8.encode(json)), _keyMaterial!);
    return 'enc:v2:${base64Encode(cipher)}';
  }

  Future<Map<String, dynamic>> _openPayload(String raw) async {
    if (raw.startsWith('enc:v2:') && _keyMaterial != null) {
      final b64 = raw.substring('enc:v2:'.length);
      final plain = await decryptBytes(base64Decode(b64), _keyMaterial!);
      return Map<String, dynamic>.from(jsonDecode(utf8.decode(plain)) as Map);
    }
    if (raw.startsWith('enc:v1:')) {
      throw const FormatException(
          'Legacy unauthenticated cache must be cleared and recaptured');
    }
    return Map<String, dynamic>.from(jsonDecode(raw) as Map);
  }

  Future<Database?> get db async {
    if (kIsWeb) return null;
    if (_db != null) return _db!;
    await _ensureCrypto();
    final dir = await getApplicationDocumentsDirectory();
    final path = p.join(dir.path, 'fasalpramaan.db');
    _db = await openDatabase(
      path,
      version: 3,
      onCreate: (db, version) async {
        await _createV1(db);
        await _createV2(db);
        await _createV3(db);
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) await _createV2(db);
        if (oldVersion < 3) await _createV3(db);
      },
    );
    return _db!;
  }

  Future<void> _createV1(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS farms_cache (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS crop_cycles_cache (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS submissions_local (
        local_id TEXT PRIMARY KEY,
        server_id TEXT,
        status TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at INTEGER
      )
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS image_hashes (
        sha256 TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      )
    ''');
  }

  Future<void> _createV2(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS submission_images_local (
        id TEXT PRIMARY KEY,
        local_submission_id TEXT NOT NULL,
        angle_type TEXT NOT NULL,
        sequence_order INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        file_path TEXT NOT NULL,
        content_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        created_at INTEGER NOT NULL
      )
    ''');
  }

  Future<void> _createV3(Database db) async {
    await db.execute(
        'ALTER TABLE submission_images_local ADD COLUMN capture_lat REAL');
    await db.execute(
        'ALTER TABLE submission_images_local ADD COLUMN capture_lon REAL');
    await db.execute(
        'ALTER TABLE submission_images_local ADD COLUMN capture_accuracy_m REAL');
    await db.execute(
        'ALTER TABLE submission_images_local ADD COLUMN captured_at TEXT');
    await db.execute(
        'ALTER TABLE submission_images_local ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0');
  }

  Future<void> upsertFarm(String id, Map<String, dynamic> payload) async {
    if (kIsWeb) {
      _webFarmsCache[id] = payload;
      return;
    }
    final database = await db;
    if (database == null) return;
    await _ensureCrypto();
    await database.insert(
      'farms_cache',
      {
        'id': id,
        'payload': await _sealPayload(payload),
        'updated_at': DateTime.now().millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> upsertCycle(String id, Map<String, dynamic> payload) async {
    if (kIsWeb) {
      _webCyclesCache[id] = payload;
      return;
    }
    final database = await db;
    if (database == null) return;
    await _ensureCrypto();
    await database.insert(
      'crop_cycles_cache',
      {
        'id': id,
        'payload': await _sealPayload(payload),
        'updated_at': DateTime.now().millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> listCachedCycles() async {
    if (kIsWeb) {
      return _webCyclesCache.values.toList();
    }
    final database = await db;
    if (database == null) return [];
    final rows =
        await database.query('crop_cycles_cache', orderBy: 'updated_at DESC');
    final result = <Map<String, dynamic>>[];
    for (final row in rows) {
      result.add(
          {'id': row['id'], ...await _openPayload(row['payload'] as String)});
    }
    return result;
  }

  Future<List<Map<String, dynamic>>> listCachedFarms() async {
    if (kIsWeb) {
      return _webFarmsCache.values.toList();
    }
    final database = await db;
    if (database == null) return [];
    await _ensureCrypto();
    final rows =
        await database.query('farms_cache', orderBy: 'updated_at DESC');
    final result = <Map<String, dynamic>>[];
    for (final row in rows) {
      result.add(
          {'id': row['id'], ...await _openPayload(row['payload'] as String)});
    }
    return result;
  }

  Future<void> saveLocalSubmission({
    required String localId,
    required String idempotencyKey,
    required String status,
    required Map<String, dynamic> payload,
    String? serverId,
  }) async {
    if (kIsWeb) {
      _webSubmissionsLocal[localId] = {
        'local_id': localId,
        'server_id': serverId,
        'status': status,
        'idempotency_key': idempotencyKey,
        'payload': payload,
        'created_at': DateTime.now().millisecondsSinceEpoch,
      };
      return;
    }
    final database = await db;
    if (database == null) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    await _ensureCrypto();
    await database.insert(
      'submissions_local',
      {
        'local_id': localId,
        'server_id': serverId,
        'status': status,
        'idempotency_key': idempotencyKey,
        'payload': await _sealPayload(payload),
        'created_at': now,
        'updated_at': now,
        'retry_count': 0,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<Map<String, dynamic>> saveLocalImage({
    required String localSubmissionId,
    required String angleType,
    required int sequenceOrder,
    required String sha256,
    required Uint8List bytes,
    required int width,
    required int height,
    required double captureLat,
    required double captureLon,
    required double captureAccuracyM,
    required DateTime capturedAt,
    String contentType = 'image/jpeg',
  }) async {
    final id = '${localSubmissionId}_$angleType';
    final record = {
      'id': id,
      'local_submission_id': localSubmissionId,
      'angle_type': angleType,
      'sequence_order': sequenceOrder,
      'sha256': sha256,
      'file_path': id,
      'content_type': contentType,
      'byte_size': bytes.length,
      'width': width,
      'height': height,
      'capture_lat': captureLat,
      'capture_lon': captureLon,
      'capture_accuracy_m': captureAccuracyM,
      'captured_at': capturedAt.toUtc().toIso8601String(),
      'encrypted': 1,
    };

    if (kIsWeb) {
      _webSubmissionImages.add(record);
      return record;
    }

    final dir = await mediaDir;
    final subDir = Directory(p.join(dir.path, localSubmissionId));
    if (!await subDir.exists()) await subDir.create(recursive: true);
    await _ensureCrypto();
    final filePath = p.join(subDir.path, '$angleType.enc');
    final encryptedBytes = await encryptBytes(bytes, _keyMaterial!);
    await File(filePath).writeAsBytes(encryptedBytes, flush: true);

    final database = await db;
    if (database != null) {
      await database.insert(
        'submission_images_local',
        {
          ...record,
          'file_path': filePath,
          'created_at': DateTime.now().millisecondsSinceEpoch,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    return record;
  }

  Future<List<Map<String, dynamic>>> listLocalImages(
      String localSubmissionId) async {
    if (kIsWeb) {
      return _webSubmissionImages
          .where((img) => img['local_submission_id'] == localSubmissionId)
          .toList();
    }
    final database = await db;
    if (database == null) return [];
    final rows = await database.query(
      'submission_images_local',
      where: 'local_submission_id = ?',
      whereArgs: [localSubmissionId],
      orderBy: 'sequence_order ASC',
    );
    return rows.map((r) => Map<String, dynamic>.from(r)).toList();
  }

  Future<Uint8List?> readImageBytes(String filePath,
      {bool encrypted = false}) async {
    if (kIsWeb) return null;
    final f = File(filePath);
    if (!await f.exists()) return null;
    final bytes = await f.readAsBytes();
    if (!encrypted) return bytes;
    await _ensureCrypto();
    return decryptBytes(bytes, _keyMaterial!);
  }

  Future<void> updateSubmissionStatus(
    String localId,
    String status, {
    String? serverId,
    int? retryCount,
    int? nextRetryAt,
  }) async {
    if (kIsWeb) {
      final existing = _webSubmissionsLocal[localId];
      if (existing != null) {
        existing['status'] = status;
        if (serverId != null) existing['server_id'] = serverId;
      }
      return;
    }
    final database = await db;
    if (database == null) return;
    final values = <String, Object?>{
      'status': status,
      'updated_at': DateTime.now().millisecondsSinceEpoch,
    };
    if (serverId != null) values['server_id'] = serverId;
    if (retryCount != null) values['retry_count'] = retryCount;
    if (nextRetryAt != null) values['next_retry_at'] = nextRetryAt;
    await database.update(
      'submissions_local',
      values,
      where: 'local_id = ?',
      whereArgs: [localId],
    );
  }

  Future<void> deleteIfServerConfirmed(String localId, String status) async {
    const confirmed = {
      'uploaded',
      'processing',
      'pending_review',
      'verified',
      'needs_recapture',
      'physical_inspection',
    };
    if (!confirmed.contains(status)) return;
    if (kIsWeb) {
      _webSubmissionsLocal.remove(localId);
      _webSubmissionImages
          .removeWhere((img) => img['local_submission_id'] == localId);
      return;
    }
    final database = await db;
    if (database == null) return;
    final images = await listLocalImages(localId);
    for (final img in images) {
      final path = img['file_path'] as String?;
      if (path != null) {
        final f = File(path);
        if (await f.exists()) await f.delete();
      }
    }
    await database.delete(
      'submission_images_local',
      where: 'local_submission_id = ?',
      whereArgs: [localId],
    );
    await database.delete('submissions_local',
        where: 'local_id = ?', whereArgs: [localId]);
  }

  Future<List<Map<String, dynamic>>> listQueue() async {
    if (kIsWeb) {
      return _webSubmissionsLocal.values.toList();
    }
    final database = await db;
    if (database == null) return [];
    await _ensureCrypto();
    final rows =
        await database.query('submissions_local', orderBy: 'created_at DESC');
    final result = <Map<String, dynamic>>[];
    for (final row in rows) {
      result.add(
          {...row, 'payload': await _openPayload(row['payload'] as String)});
    }
    return result;
  }

  Future<void> rememberHash(String sha) async {
    if (kIsWeb) {
      _webHashes.add(sha);
      return;
    }
    final database = await db;
    if (database == null) return;
    await database.insert(
      'image_hashes',
      {'sha256': sha, 'created_at': DateTime.now().millisecondsSinceEpoch},
      conflictAlgorithm: ConflictAlgorithm.ignore,
    );
  }

  Future<Set<String>> knownHashes() async {
    if (kIsWeb) return Set.from(_webHashes);
    final database = await db;
    if (database == null) return {};
    final rows = await database.query('image_hashes');
    return rows.map((r) => r['sha256'] as String).toSet();
  }

  int nextBackoffSeconds(int retryCount) =>
      defaultSyncBackoff.maxDelaySeconds(retryCount);

  int nextBackoffWithJitterSeconds(int retryCount) =>
      defaultSyncBackoff.nextDelaySeconds(retryCount);
}
