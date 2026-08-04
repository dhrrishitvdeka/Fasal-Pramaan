import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// Mirrors server-owned evidence plans into device notifications.
///
/// The server remains the source of truth and also produces in-app reminders;
/// these local schedules keep working when the phone is temporarily offline.
class EvidenceNotificationService {
  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  void Function(String route)? _openRoute;
  String? _pendingRoute;
  bool _initialized = false;
  bool _permissionRequested = false;

  Future<void> initialize() async {
    if (_initialized || kIsWeb) return;
    tz_data.initializeTimeZones();
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
      macOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
    );
    await _plugin.initialize(
      settings: settings,
      onDidReceiveNotificationResponse: _onNotificationResponse,
    );
    final launch = await _plugin.getNotificationAppLaunchDetails();
    final payload = launch?.notificationResponse?.payload;
    if (launch?.didNotificationLaunchApp == true && payload != null) {
      _pendingRoute = payload;
    }
    _initialized = true;
  }

  void bindRouteHandler(void Function(String route) handler) {
    _openRoute = handler;
  }

  /// Called after authenticated farmer routing is complete so a cold-start
  /// notification cannot skip session restoration.
  void flushPendingRoute() {
    final pending = _pendingRoute;
    if (pending != null) {
      _pendingRoute = null;
      _openRoute?.call(pending);
    }
  }

  void deferRoute(String route) {
    if (route.startsWith('/')) _pendingRoute = route;
  }

  void _onNotificationResponse(NotificationResponse response) {
    final route = response.payload;
    if (route == null || route.isEmpty) return;
    final handler = _openRoute;
    if (handler == null) {
      _pendingRoute = route;
    } else {
      handler(route);
    }
  }

  Future<void> requestAuthorization() async {
    if (!_initialized || _permissionRequested || kIsWeb) return;
    _permissionRequested = true;
    await _plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
    await _plugin
        .resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin>()
        ?.requestPermissions(alert: true, badge: true, sound: true);
    await _plugin
        .resolvePlatformSpecificImplementation<
            MacOSFlutterLocalNotificationsPlugin>()
        ?.requestPermissions(alert: true, badge: true, sound: true);
  }

  Future<void> syncPlans(List<dynamic> plans) async {
    if (kIsWeb) return;
    if (!_initialized) await initialize();
    await requestAuthorization();
    for (final raw in plans) {
      if (raw is! Map) continue;
      final plan = Map<String, dynamic>.from(raw);
      final cycleId = '${plan['crop_cycle_id'] ?? ''}';
      if (cycleId.isEmpty) continue;
      final leadId = _stableId('$cycleId:lead');
      final dueId = _stableId('$cycleId:due');
      await _plugin.cancel(id: leadId);
      await _plugin.cancel(id: dueId);
      if (plan['is_active'] != true) continue;

      final parsedDue = DateTime.tryParse('${plan['next_due_at'] ?? ''}');
      if (parsedDue == null) continue;
      final location = _location('${plan['timezone_name'] ?? 'Asia/Kolkata'}');
      final now = tz.TZDateTime.now(location);
      final due = tz.TZDateTime.from(parsedDue.toUtc(), location);
      final leadDays = (plan['reminder_lead_days'] as num?)?.toInt() ?? 3;
      var lead = due.subtract(Duration(days: leadDays));
      if (!lead.isAfter(now)) lead = now.add(const Duration(minutes: 1));
      final cropName = '${plan['crop_name'] ?? 'your crop'}';
      final count = (plan['target_photos'] as num?)?.toInt() ?? 5;
      final payload = '/capture?crop_cycle_id=$cycleId';

      await _schedule(
        id: leadId,
        at: lead,
        title: due.isBefore(now)
            ? 'Crop evidence is overdue'
            : 'Crop evidence is due soon',
        body: 'Upload $count geo-tagged photos for $cropName.',
        payload: payload,
      );
      if (due.isAfter(lead.add(const Duration(minutes: 1)))) {
        await _schedule(
          id: dueId,
          at: due,
          title: 'Time to update crop evidence',
          body: 'Take $count guided photos for $cropName now.',
          payload: payload,
        );
      }
    }
  }

  Future<void> _schedule({
    required int id,
    required tz.TZDateTime at,
    required String title,
    required String body,
    required String payload,
  }) async {
    await _plugin.zonedSchedule(
      id: id,
      title: title,
      body: body,
      scheduledDate: at,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'evidence_reminders',
          'Evidence reminders',
          channelDescription:
              'Periodic prompts to record geo-tagged crop evidence',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
        macOS: DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      payload: payload,
    );
  }

  tz.Location _location(String name) {
    try {
      return tz.getLocation(name);
    } on ArgumentError {
      return tz.getLocation('Asia/Kolkata');
    }
  }

  /// Deterministic positive 31-bit FNV-1a, stable across app restarts.
  int _stableId(String value) {
    var hash = 0x811c9dc5;
    for (final unit in value.codeUnits) {
      hash ^= unit;
      hash = (hash * 0x01000193) & 0x7fffffff;
    }
    return hash;
  }
}

final evidenceNotificationService = EvidenceNotificationService();
