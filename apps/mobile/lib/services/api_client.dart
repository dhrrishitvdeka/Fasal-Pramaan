import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:fasalpramaan/core/config.dart';
import 'package:fasalpramaan/services/safe_storage.dart';
import 'package:uuid/uuid.dart';

class ApiClient {
  static Future<Map<String, dynamic>>? _refreshInFlight;

  ApiClient() {
    _dio = Dio(
      BaseOptions(
        baseUrl: '${AppConfig.resolvedApiBaseUrl}/api/v1',
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 60),
      ),
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: 'access_token');
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (error, handler) async {
          final request = error.requestOptions;
          if (error.response?.statusCode != 401 ||
              request.extra['retried'] == true ||
              request.path.contains('/auth/refresh') ||
              request.path.contains('/auth/login') ||
              request.path.contains('/auth/logout') ||
              request.path.contains('/auth/register')) {
            return handler.next(error);
          }
          final refresh = await _storage.read(key: 'refresh_token');
          if (refresh == null || refresh.isEmpty) {
            // Stale access token after API restart/reseed — drop local session.
            await clearTokens();
            return handler.next(error);
          }
          try {
            final tokenResponse = await _refreshOnce(refresh);
            request.extra['retried'] = true;
            request.headers['Authorization'] =
                'Bearer ${tokenResponse['access_token']}';
            return handler.resolve(await _dio.fetch(request));
          } catch (_) {
            await clearTokens();
            return handler.next(error);
          }
        },
      ),
    );
  }

  late final Dio _dio;
  final _storage = const SafeStorage();

  Dio get dio => _dio;

  Future<void> saveTokens(String access, String refresh) async {
    await _storage.write(key: 'access_token', value: access);
    await _storage.write(key: 'refresh_token', value: refresh);
  }

  Future<void> clearTokens() async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'refresh_token');
  }

  Future<String> deviceId() async {
    var id = await _storage.read(key: 'device_id');
    if (id == null || id.isEmpty) {
      id = const Uuid().v4();
      await _storage.write(key: 'device_id', value: id);
    }
    return id;
  }

  Future<Map<String, dynamic>> _refreshTokens(String refresh) async {
    final client =
        Dio(BaseOptions(baseUrl: '${AppConfig.resolvedApiBaseUrl}/api/v1'));
    final response =
        await client.post('/auth/refresh', data: {'refresh_token': refresh});
    final data = Map<String, dynamic>.from(response.data as Map);
    await saveTokens(
        data['access_token'] as String, data['refresh_token'] as String);
    return data;
  }

  Future<Map<String, dynamic>> _refreshOnce(String refresh) async {
    final existing = _refreshInFlight;
    if (existing != null) return existing;
    final future = _refreshTokens(refresh);
    _refreshInFlight = future;
    try {
      return await future;
    } finally {
      if (identical(_refreshInFlight, future)) {
        _refreshInFlight = null;
      }
    }
  }

  Future<bool> hasSession() async =>
      (await _storage.read(key: 'access_token'))?.isNotEmpty == true;

  Future<String?> readAccessToken() async => _storage.read(key: 'access_token');

  /// Returns the current user when local tokens are still accepted by the API.
  /// Clears storage and returns null when the session is stale (common after
  /// API restarts / reseed while the browser still holds old tokens).
  Future<Map<String, dynamic>?> ensureSession() async {
    if (!await hasSession()) return null;
    try {
      return await me();
    } on DioException catch (error) {
      if (error.response?.statusCode == 401) {
        await clearTokens();
        return null;
      }
      rethrow;
    } catch (_) {
      await clearTokens();
      return null;
    }
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await _dio.post('/auth/login', data: {
      'email': email,
      'password': password,
      'device_id': await deviceId(),
    });
    await saveTokens(res.data['access_token'], res.data['refresh_token']);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> register({
    required String fullName,
    required String email,
    required String password,
    String? phone,
  }) async {
    final response = await _dio.post('/auth/register', data: {
      'full_name': fullName,
      'email': email,
      'password': password,
      if (phone != null && phone.isNotEmpty) 'phone': phone,
    });
    final data = Map<String, dynamic>.from(response.data as Map);
    await saveTokens(
        data['access_token'] as String, data['refresh_token'] as String);
    return data;
  }

  Future<void> logout() async {
    final refresh = await _storage.read(key: 'refresh_token');
    try {
      if (refresh != null) {
        try {
          await _dio.post('/auth/logout', data: {'refresh_token': refresh});
        } on DioException catch (error) {
          if (error.response?.statusCode != 401) rethrow;
          final rotated = await _refreshOnce(refresh);
          await _dio.post(
            '/auth/logout',
            data: {'refresh_token': rotated['refresh_token']},
          );
        }
      }
    } finally {
      await clearTokens();
    }
  }

  Future<Map<String, dynamic>> me() async {
    final res = await _dio.get('/auth/me');
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> farms() async {
    final res = await _dio.get('/farms');
    return (res.data['items'] as List?) ?? [];
  }

  Future<Map<String, dynamic>> createFarm({
    required String name,
    double? totalAreaHectares,
    String? notes,
  }) async {
    final res = await _dio.post('/farms', data: {
      'name': name,
      if (totalAreaHectares != null) 'total_area_hectares': totalAreaHectares,
      if (notes != null) 'notes': notes,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createPlot({
    required String farmId,
    required String name,
    double? areaHectares,
    double? centroidLat,
    double? centroidLon,
    List<List<double>>? boundaryCoords,
    String? soilType,
    String? irrigationType,
  }) async {
    final res = await _dio.post('/farms/$farmId/plots', data: {
      'name': name,
      if (areaHectares != null) 'area_hectares': areaHectares,
      if (centroidLat != null) 'centroid_lat': centroidLat,
      if (centroidLon != null) 'centroid_lon': centroidLon,
      if (boundaryCoords != null) 'boundary_coords': boundaryCoords,
      if (soilType != null && soilType.isNotEmpty) 'soil_type': soilType,
      if (irrigationType != null && irrigationType.isNotEmpty)
        'irrigation_type': irrigationType,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> plots(String farmId) async {
    final res = await _dio.get('/farms/$farmId/plots');
    return res.data as List<dynamic>;
  }

  Future<List<dynamic>> crops() async {
    final res = await _dio.get('/crops');
    return res.data as List<dynamic>;
  }

  Future<List<dynamic>> growthStages({String? cropTypeId}) async {
    final res = await _dio.get('/growth-stages', queryParameters: {
      if (cropTypeId != null) 'crop_type_id': cropTypeId,
    });
    return res.data as List<dynamic>;
  }

  Future<List<dynamic>> cropCycles() async {
    final res = await _dio.get('/crop-cycles');
    return res.data as List<dynamic>;
  }

  Future<Map<String, dynamic>> createCropCycle({
    required String plotId,
    required String cropTypeId,
    required int seasonYear,
    required String season,
    String? growthStageId,
  }) async {
    final res = await _dio.post('/crop-cycles', data: {
      'plot_id': plotId,
      'crop_type_id': cropTypeId,
      'season_year': seasonYear,
      'season': season,
      if (growthStageId != null) 'current_growth_stage_id': growthStageId,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> createDraft(Map<String, dynamic> body) async {
    final res = await _dio.post('/submissions/drafts', data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> requestUploadUrls(String id, List images) async {
    final res = await _dio
        .post('/submissions/$id/upload-urls', data: {'images': images});
    return res.data as Map<String, dynamic>;
  }

  /// PUT binary to a presigned MinIO/S3 URL (no API auth header).
  Future<void> putPresigned(String url, Uint8List bytes,
      {String contentType = 'image/jpeg',
      Map<String, dynamic>? signedHeaders}) async {
    final client = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 60),
      // Do not attach Authorization to object storage.
      validateStatus: (s) => s != null && s >= 200 && s < 300,
    ));
    await client.put(
      url,
      data: Stream.fromIterable([bytes]),
      options: Options(
        headers: {
          'Content-Type': contentType,
          'Content-Length': bytes.length,
          ...?signedHeaders,
        },
      ),
    );
  }

  Future<void> confirmUploads(String id, List confirms) async {
    await _dio.post('/submissions/$id/images/confirm', data: confirms);
  }

  Future<Map<String, dynamic>> finalize(String id) async {
    final res = await _dio.post('/submissions/$id/finalize', data: {});
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> submissions() async {
    final res = await _dio.get('/submissions');
    return (res.data['items'] as List?) ?? [];
  }

  Future<List<dynamic>> notifications() async {
    final res = await _dio.get('/dashboard/notifications');
    return res.data as List<dynamic>;
  }

  Future<void> markNotificationRead(String notificationId) async {
    await _dio.post('/dashboard/notifications/$notificationId/read');
  }

  Future<List<dynamic>> evidenceReminders() async {
    final res = await _dio.get('/evidence-reminders');
    return res.data as List<dynamic>;
  }

  Future<Map<String, dynamic>> updateEvidenceReminder({
    required String cropCycleId,
    required int cadenceDays,
    required int targetPhotos,
    required int reminderLeadDays,
    required String timezoneName,
    required bool isActive,
  }) async {
    final res = await _dio.put('/evidence-reminders/$cropCycleId', data: {
      'cadence_days': cadenceDays,
      'target_photos': targetPhotos,
      'reminder_lead_days': reminderLeadDays,
      'timezone_name': timezoneName,
      'is_active': isActive,
    });
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> snoozeEvidenceReminder({
    required String cropCycleId,
    required int days,
  }) async {
    final res = await _dio.post(
      '/evidence-reminders/$cropCycleId/snooze',
      data: {'days': days},
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<List<dynamic>> syncPush(List ops) async {
    final response = await _dio.post('/sync/push', data: {'operations': ops});
    return response.data as List<dynamic>;
  }

  Future<Map<String, dynamic>> createVoiceSession() async {
    try {
      final response = await _dio.post('/voice/session-token', data: {});
      return Map<String, dynamic>.from(response.data as Map);
    } on DioException catch (error) {
      final status = error.response?.statusCode;
      if (status == 401 || status == 403) {
        await clearTokens();
        throw StateError(
          'Session expired or not allowed. Log in as a farmer and try again.',
        );
      }
      final body = error.response?.data;
      final detail = body is Map ? body['detail']?.toString() : null;
      throw StateError(
        detail?.isNotEmpty == true
            ? detail!
            : 'The voice assistant is temporarily unavailable.',
      );
    }
  }

  Future<void> auditVoiceAction({
    required String sessionId,
    required String action,
    required String outcome,
    String? entityId,
  }) async {
    await _dio.post('/voice/actions/audit', data: {
      'session_id': sessionId,
      'action': action,
      'outcome': outcome,
      if (entityId != null) 'entity_id': entityId,
    });
  }
}
