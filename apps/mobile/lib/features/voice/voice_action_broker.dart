import 'package:fasalpramaan/features/voice/voice_capture_bridge.dart';
import 'package:fasalpramaan/services/api_client.dart';
import 'package:fasalpramaan/services/offline_db.dart';
import 'package:fasalpramaan/services/sync_service.dart';
import 'package:fasalpramaan/services/evidence_notification_service.dart';

enum VoiceActionOutcome {
  succeeded('succeeded'),
  failed('failed'),
  confirmationRequired('confirmation_required'),
  cancelled('cancelled');

  const VoiceActionOutcome(this.apiValue);
  final String apiValue;
}

class VoiceToolResult {
  const VoiceToolResult({
    required this.outcome,
    required this.message,
    this.data = const {},
    this.entityId,
  });

  final VoiceActionOutcome outcome;
  final String message;
  final Map<String, dynamic> data;
  final String? entityId;

  bool get succeeded => outcome == VoiceActionOutcome.succeeded;

  Map<String, dynamic> toJson() => {
        'ok': succeeded,
        'outcome': outcome.apiValue,
        'message': message,
        if (data.isNotEmpty) 'data': data,
      };
}

abstract class VoiceActionGateway {
  Future<List<dynamic>> farms();
  Future<List<dynamic>> cropCycles();
  Future<List<dynamic>> submissions();
  Future<List<dynamic>> notifications();
  Future<List<Map<String, dynamic>>> offlineQueue();
  Future<int> syncOfflineQueue();
  Future<Map<String, dynamic>> finalizeSubmission(String submissionId);
}

abstract class ExtendedVoiceActionGateway {
  Future<List<dynamic>> plots(String farmId);
  Future<List<dynamic>> crops();
  Future<List<dynamic>> growthStages({String? cropTypeId});
  Future<List<dynamic>> evidenceReminders();
  Future<Map<String, dynamic>> createFarm({
    required String name,
    double? totalAreaHectares,
    String? notes,
  });
  Future<Map<String, dynamic>> createPlot({
    required String farmId,
    required String name,
    double? areaHectares,
    String? soilType,
    String? irrigationType,
  });
  Future<Map<String, dynamic>> createCropCycle({
    required String plotId,
    required String cropTypeId,
    required int seasonYear,
    required String season,
    String? growthStageId,
  });
  Future<Map<String, dynamic>> updateEvidenceReminder({
    required String cropCycleId,
    required int cadenceDays,
    required int targetPhotos,
    required int reminderLeadDays,
    required String timezoneName,
    required bool isActive,
  });
  Future<Map<String, dynamic>> snoozeEvidenceReminder({
    required String cropCycleId,
    required int days,
  });
  Future<void> markNotificationRead(String notificationId);
  Future<void> logout();
}

class DefaultVoiceActionGateway
    implements VoiceActionGateway, ExtendedVoiceActionGateway {
  DefaultVoiceActionGateway({
    ApiClient? api,
    OfflineDb? db,
    SyncService? sync,
  })  : api = api ?? ApiClient(),
        db = db ?? OfflineDb(),
        _sync = sync;

  final ApiClient api;
  final OfflineDb db;
  final SyncService? _sync;

  @override
  Future<List<dynamic>> farms() => api.farms();

  @override
  Future<List<dynamic>> cropCycles() => api.cropCycles();

  @override
  Future<List<dynamic>> submissions() => api.submissions();

  @override
  Future<List<dynamic>> notifications() => api.notifications();

  @override
  Future<List<Map<String, dynamic>>> offlineQueue() => db.listQueue();

  @override
  Future<int> syncOfflineQueue() => (_sync ?? SyncService(api, db)).syncNow();

  @override
  Future<Map<String, dynamic>> finalizeSubmission(String submissionId) =>
      api.finalize(submissionId);

  @override
  Future<List<dynamic>> plots(String farmId) => api.plots(farmId);

  @override
  Future<List<dynamic>> crops() => api.crops();

  @override
  Future<List<dynamic>> growthStages({String? cropTypeId}) =>
      api.growthStages(cropTypeId: cropTypeId);

  @override
  Future<List<dynamic>> evidenceReminders() => api.evidenceReminders();

  @override
  Future<Map<String, dynamic>> createFarm({
    required String name,
    double? totalAreaHectares,
    String? notes,
  }) =>
      api.createFarm(
        name: name,
        totalAreaHectares: totalAreaHectares,
        notes: notes,
      );

  @override
  Future<Map<String, dynamic>> createPlot({
    required String farmId,
    required String name,
    double? areaHectares,
    String? soilType,
    String? irrigationType,
  }) =>
      api.createPlot(
        farmId: farmId,
        name: name,
        areaHectares: areaHectares,
        soilType: soilType,
        irrigationType: irrigationType,
      );

  @override
  Future<Map<String, dynamic>> createCropCycle({
    required String plotId,
    required String cropTypeId,
    required int seasonYear,
    required String season,
    String? growthStageId,
  }) async {
    final value = await api.createCropCycle(
      plotId: plotId,
      cropTypeId: cropTypeId,
      seasonYear: seasonYear,
      season: season,
      growthStageId: growthStageId,
    );
    await _syncDeviceReminders();
    return value;
  }

  @override
  Future<Map<String, dynamic>> updateEvidenceReminder({
    required String cropCycleId,
    required int cadenceDays,
    required int targetPhotos,
    required int reminderLeadDays,
    required String timezoneName,
    required bool isActive,
  }) async {
    final value = await api.updateEvidenceReminder(
      cropCycleId: cropCycleId,
      cadenceDays: cadenceDays,
      targetPhotos: targetPhotos,
      reminderLeadDays: reminderLeadDays,
      timezoneName: timezoneName,
      isActive: isActive,
    );
    await _syncDeviceReminders();
    return value;
  }

  @override
  Future<Map<String, dynamic>> snoozeEvidenceReminder({
    required String cropCycleId,
    required int days,
  }) async {
    final value = await api.snoozeEvidenceReminder(
      cropCycleId: cropCycleId,
      days: days,
    );
    await _syncDeviceReminders();
    return value;
  }

  @override
  Future<void> markNotificationRead(String notificationId) =>
      api.markNotificationRead(notificationId);

  @override
  Future<void> logout() => api.logout();

  Future<void> _syncDeviceReminders() async {
    try {
      await evidenceNotificationService
          .syncPlans(await api.evidenceReminders());
    } catch (_) {
      // Server-side plans and in-app reminders are already updated.
    }
  }
}

enum _PendingKind {
  syncQueue,
  finalizeSubmission,
  createFarm,
  createPlot,
  createCropCycle,
  updateReminder,
  snoozeReminder,
  markNotificationRead,
  logout,
}

class _PendingAction {
  const _PendingAction({
    required this.kind,
    required this.preparedOnUserTurn,
    required this.expiresAt,
    this.entityId,
    this.arguments = const {},
  });

  final _PendingKind kind;
  final int preparedOnUserTurn;
  final DateTime expiresAt;
  final String? entityId;
  final Map<String, dynamic> arguments;
}

/// Executes only explicitly allowlisted app operations. Sensitive operations
/// use prepare/confirm and require a later user speech turn before execution.
class VoiceActionBroker {
  VoiceActionBroker({
    required this.gateway,
    required this.navigate,
    VoiceCaptureBridge? captureBridge,
    DateTime Function()? now,
    void Function(String languageCode)? changeLanguage,
  })  : captureBridge = captureBridge ?? voiceCaptureBridge,
        _now = now ?? DateTime.now,
        _changeLanguage = changeLanguage;

  final VoiceActionGateway gateway;
  final void Function(String location) navigate;
  final VoiceCaptureBridge captureBridge;
  final DateTime Function() _now;
  final void Function(String languageCode)? _changeLanguage;
  _PendingAction? _pending;

  ExtendedVoiceActionGateway get _extended {
    final value = gateway;
    if (value is ExtendedVoiceActionGateway) {
      return value as ExtendedVoiceActionGateway;
    }
    throw StateError('This app build does not provide the requested action.');
  }

  static const _routes = <String, String>{
    'home': '/home',
    'farms': '/farms',
    'capture': '/capture',
    'queue': '/queue',
    'results': '/results',
    'notifications': '/notifications',
    'settings': '/settings',
    'help': '/help',
    'profile': '/profile',
    'reminders': '/reminders',
  };

  bool get hasPendingConfirmation => _pending != null;

  void clearPendingAction() {
    _pending = null;
  }

  Future<VoiceToolResult> execute(
    String name,
    Map<String, dynamic> arguments, {
    required int userTurn,
  }) async {
    try {
      switch (name) {
        case 'navigate_to_screen':
          return _navigate(arguments);
        case 'change_language':
          return _changeAppLanguage(arguments);
        case 'list_my_farms':
          return _listFarms();
        case 'list_plots':
          return _listPlots(arguments);
        case 'list_crop_types':
          return _listCrops();
        case 'list_growth_stages':
          return _listGrowthStages(arguments);
        case 'list_crop_cycles':
          return _listCycles();
        case 'list_my_submissions':
          return _listSubmissions();
        case 'list_notifications':
          return _listNotifications();
        case 'list_evidence_reminders':
          return _listReminders();
        case 'read_offline_queue':
          return _readQueue();
        case 'begin_guided_capture':
          return _beginCapture(arguments);
        case 'read_capture_guidance':
          return _fromCapture(await captureBridge.readGuidance());
        case 'capture_current_angle':
          return _fromCapture(await captureBridge.captureCurrentAngle());
        case 'set_capture_observation':
          return _setObservation(arguments);
        case 'save_guided_capture_offline':
          return _fromCapture(await captureBridge.saveOffline());
        case 'prepare_sync_offline_queue':
          return _prepareSync(userTurn);
        case 'prepare_finalize_submission':
          return _prepareFinalize(arguments, userTurn);
        case 'prepare_create_farm':
          return _prepareCreateFarm(arguments, userTurn);
        case 'prepare_create_plot':
          return _prepareCreatePlot(arguments, userTurn);
        case 'prepare_create_crop_cycle':
          return _prepareCreateCycle(arguments, userTurn);
        case 'prepare_update_evidence_reminder':
          return _prepareUpdateReminder(arguments, userTurn);
        case 'prepare_snooze_evidence_reminder':
          return _prepareSnoozeReminder(arguments, userTurn);
        case 'prepare_mark_notification_read':
          return _prepareMarkNotificationRead(arguments, userTurn);
        case 'prepare_logout':
          return _prepareLogout(userTurn);
        case 'confirm_pending_action':
          return _confirm(userTurn);
        case 'cancel_pending_action':
          return _cancel();
        default:
          return const VoiceToolResult(
            outcome: VoiceActionOutcome.failed,
            message: 'That app action is not allowed.',
          );
      }
    } catch (error) {
      return VoiceToolResult(
        outcome: VoiceActionOutcome.failed,
        message: 'The app action failed: ${_safeError(error)}',
      );
    }
  }

  VoiceToolResult _navigate(Map<String, dynamic> arguments) {
    final screen = arguments['screen']?.toString();
    final route = _routes[screen];
    if (route == null) {
      return const VoiceToolResult(
        outcome: VoiceActionOutcome.failed,
        message: 'That screen is not in the farmer navigation allowlist.',
      );
    }
    navigate(route);
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: 'Opened the $screen screen.',
      data: {'screen': screen},
    );
  }

  VoiceToolResult _changeAppLanguage(Map<String, dynamic> arguments) {
    final code = arguments['language_code']?.toString().trim().toLowerCase();
    if (code != 'en' && code != 'hi') {
      return _invalid('Language must be English or Hindi.');
    }
    _changeLanguage?.call(code!);
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: code == 'hi'
          ? 'ऐप की भाषा हिन्दी कर दी गई है।'
          : 'The app language is now English.',
      data: {'language_code': code},
    );
  }

  Future<VoiceToolResult> _listFarms() async {
    final items = await gateway.farms();
    final safe = items.take(12).map((item) {
      final value = _map(item);
      return {
        'id': value['id'],
        'name': value['name'],
        'total_area_hectares': value['total_area_hectares'],
      };
    }).toList();
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: 'Found ${items.length} farms.',
      data: {'count': items.length, 'farms': safe},
    );
  }

  Future<VoiceToolResult> _listPlots(Map<String, dynamic> arguments) async {
    final farmId = _identifier(arguments['farm_id']);
    if (farmId == null) return _invalidIdentifier('farm');
    final items = await _extended.plots(farmId);
    final safe = items.take(20).map((item) {
      final value = _map(item);
      return {
        'id': value['id'],
        'farm_id': value['farm_id'],
        'name': value['name'],
        'area_hectares': value['area_hectares'],
        'soil_type': value['soil_type'],
        'irrigation_type': value['irrigation_type'],
      };
    }).toList();
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: 'Found ${items.length} plots on that farm.',
      data: {'count': items.length, 'plots': safe},
    );
  }

  Future<VoiceToolResult> _listCrops() async {
    final items = await _extended.crops();
    final safe = items.take(30).map((item) {
      final value = _map(item);
      return {
        'id': value['id'],
        'code': value['code'],
        'name': value['name'],
        'name_hi': value['name_hi'],
        'season': value['season'],
      };
    }).toList();
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: 'Found ${items.length} crop types.',
      data: {'count': items.length, 'crop_types': safe},
    );
  }

  Future<VoiceToolResult> _listGrowthStages(
    Map<String, dynamic> arguments,
  ) async {
    final rawCropId = arguments['crop_type_id']?.toString().trim();
    final cropId =
        rawCropId == null || rawCropId.isEmpty ? null : _identifier(rawCropId);
    if (rawCropId != null && rawCropId.isNotEmpty && cropId == null) {
      return _invalidIdentifier('crop type');
    }
    final items = await _extended.growthStages(cropTypeId: cropId);
    final safe = items.take(30).map((item) {
      final value = _map(item);
      return {
        'id': value['id'],
        'code': value['code'],
        'name': value['name'],
        'name_hi': value['name_hi'],
        'sequence_order': value['sequence_order'],
      };
    }).toList();
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: 'Found ${items.length} growth stages.',
      data: {'count': items.length, 'growth_stages': safe},
    );
  }

  Future<VoiceToolResult> _listCycles() async {
    final items = await gateway.cropCycles();
    final safe = items.take(12).map((item) {
      final value = _map(item);
      return {
        'id': value['id'],
        'crop_name': value['crop_name'] ?? value['crop_code'],
        'season': value['season'],
        'season_year': value['season_year'],
        'status': value['status'],
      };
    }).toList();
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: 'Found ${items.length} crop cycles.',
      data: {'count': items.length, 'crop_cycles': safe},
    );
  }

  Future<VoiceToolResult> _listSubmissions() async {
    final items = await gateway.submissions();
    final safe = items.take(10).map((item) {
      final value = _map(item);
      return {
        'id': value['id'],
        'status': value['status'],
        'severity': value['severity'],
        'created_at': value['created_at'],
      };
    }).toList();
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: 'Found ${items.length} submissions.',
      data: {'count': items.length, 'submissions': safe},
    );
  }

  Future<VoiceToolResult> _listNotifications() async {
    final items = await gateway.notifications();
    final safe = items.take(8).map((item) {
      final value = _map(item);
      return {
        'id': value['id'],
        'title': value['title'],
        'body': value['body'],
        'is_read': value['is_read'],
        'created_at': value['created_at'],
      };
    }).toList();
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: 'Found ${items.length} notifications.',
      data: {'count': items.length, 'notifications': safe},
    );
  }

  Future<VoiceToolResult> _listReminders() async {
    final items = await _extended.evidenceReminders();
    final safe = items.take(20).map((item) {
      final value = _map(item);
      return {
        'crop_cycle_id': value['crop_cycle_id'],
        'crop_name': value['crop_name'],
        'cadence_days': value['cadence_days'],
        'target_photos': value['target_photos'],
        'next_due_at': value['next_due_at'],
        'overdue': value['overdue'],
        'is_active': value['is_active'],
      };
    }).toList();
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: 'Found ${items.length} crop-evidence reminder plans.',
      data: {'count': items.length, 'reminders': safe},
    );
  }

  Future<VoiceToolResult> _readQueue() async {
    final queue = await gateway.offlineQueue();
    final counts = <String, int>{};
    for (final item in queue) {
      final status = item['status']?.toString() ?? 'unknown';
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: '${queue.length} encrypted drafts are in the offline queue.',
      data: {'count': queue.length, 'statuses': counts},
    );
  }

  VoiceToolResult _beginCapture(Map<String, dynamic> arguments) {
    final cycleId = arguments['crop_cycle_id']?.toString().trim() ?? '';
    if (cycleId.isEmpty || cycleId.length > 128) {
      return const VoiceToolResult(
        outcome: VoiceActionOutcome.failed,
        message: 'A valid crop-cycle identifier is required.',
      );
    }
    final location = Uri(
      path: '/capture',
      queryParameters: {'crop_cycle_id': cycleId},
    ).toString();
    navigate(location);
    return VoiceToolResult(
      outcome: VoiceActionOutcome.succeeded,
      message: 'Guided capture is open for the selected crop cycle.',
      entityId: cycleId,
      data: {'crop_cycle_id': cycleId},
    );
  }

  Future<VoiceToolResult> _setObservation(
    Map<String, dynamic> arguments,
  ) async {
    final observation = arguments['observation']?.toString().trim() ?? '';
    if (observation.isEmpty || observation.length > 1000) {
      return const VoiceToolResult(
        outcome: VoiceActionOutcome.failed,
        message: 'The observation must be between 1 and 1000 characters.',
      );
    }
    return _fromCapture(await captureBridge.setObservation(observation));
  }

  Future<VoiceToolResult> _prepareSync(int userTurn) async {
    final queue = await gateway.offlineQueue();
    if (queue.isEmpty) {
      return const VoiceToolResult(
        outcome: VoiceActionOutcome.succeeded,
        message: 'The offline queue is already empty.',
        data: {'count': 0},
      );
    }
    _pending = _PendingAction(
      kind: _PendingKind.syncQueue,
      preparedOnUserTurn: userTurn,
      expiresAt: _now().add(const Duration(seconds: 60)),
    );
    return VoiceToolResult(
      outcome: VoiceActionOutcome.confirmationRequired,
      message:
          'Ready to upload and finalize ${queue.length} queued evidence drafts. Ask the farmer for an explicit yes or no.',
      data: {'count': queue.length},
    );
  }

  VoiceToolResult _prepareFinalize(
    Map<String, dynamic> arguments,
    int userTurn,
  ) {
    final id = arguments['submission_id']?.toString().trim() ?? '';
    if (id.isEmpty || id.length > 128) {
      return const VoiceToolResult(
        outcome: VoiceActionOutcome.failed,
        message: 'A valid submission identifier is required.',
      );
    }
    _pending = _PendingAction(
      kind: _PendingKind.finalizeSubmission,
      preparedOnUserTurn: userTurn,
      expiresAt: _now().add(const Duration(seconds: 60)),
      entityId: id,
    );
    return VoiceToolResult(
      outcome: VoiceActionOutcome.confirmationRequired,
      message:
          'Ready to finalize submission $id for review. Ask the farmer for an explicit yes or no.',
      entityId: id,
    );
  }

  VoiceToolResult _prepareCreateFarm(
    Map<String, dynamic> arguments,
    int userTurn,
  ) {
    final name = arguments['name']?.toString().trim() ?? '';
    final area = _optionalDouble(arguments['total_area_hectares']);
    final notes = arguments['notes']?.toString().trim();
    if (name.isEmpty || name.length > 255) {
      return _invalid('Farm name must be between 1 and 255 characters.');
    }
    if (arguments['total_area_hectares'] != null && area == null) {
      return _invalid('Farm area must be a valid number of hectares.');
    }
    if (area != null && (area <= 0 || area > 100000)) {
      return _invalid('Farm area must be greater than zero hectares.');
    }
    if (notes != null && notes.length > 5000) {
      return _invalid('Farm notes are too long.');
    }
    return _prepare(
      kind: _PendingKind.createFarm,
      userTurn: userTurn,
      arguments: {
        'name': name,
        if (area != null) 'total_area_hectares': area,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      },
      message:
          'Ready to create the farm named $name${area == null ? '' : ' with $area hectares'}. Ask for a clear yes or no.',
    );
  }

  VoiceToolResult _prepareCreatePlot(
    Map<String, dynamic> arguments,
    int userTurn,
  ) {
    final farmId = _identifier(arguments['farm_id']);
    final name = arguments['name']?.toString().trim() ?? '';
    final area = _optionalDouble(arguments['area_hectares']);
    final soil = arguments['soil_type']?.toString().trim();
    final irrigation = arguments['irrigation_type']?.toString().trim();
    if (farmId == null) return _invalidIdentifier('farm');
    if (name.isEmpty || name.length > 255) {
      return _invalid('Plot name must be between 1 and 255 characters.');
    }
    if (arguments['area_hectares'] != null && area == null) {
      return _invalid('Plot area must be a valid number of hectares.');
    }
    if (area != null && (area <= 0 || area > 100000)) {
      return _invalid('Plot area must be greater than zero hectares.');
    }
    if ((soil?.length ?? 0) > 64 || (irrigation?.length ?? 0) > 64) {
      return _invalid(
          'Soil and irrigation values must be 64 characters or fewer.');
    }
    return _prepare(
      kind: _PendingKind.createPlot,
      userTurn: userTurn,
      entityId: farmId,
      arguments: {
        'farm_id': farmId,
        'name': name,
        if (area != null) 'area_hectares': area,
        if (soil != null && soil.isNotEmpty) 'soil_type': soil,
        if (irrigation != null && irrigation.isNotEmpty)
          'irrigation_type': irrigation,
      },
      message:
          'Ready to add plot $name to the selected farm. Ask for a clear yes or no.',
    );
  }

  VoiceToolResult _prepareCreateCycle(
    Map<String, dynamic> arguments,
    int userTurn,
  ) {
    final plotId = _identifier(arguments['plot_id']);
    final cropTypeId = _identifier(arguments['crop_type_id']);
    final growthStageId = arguments['growth_stage_id'] == null
        ? null
        : _identifier(arguments['growth_stage_id']);
    final year = _optionalInt(arguments['season_year']);
    final season = arguments['season']?.toString().trim().toLowerCase();
    if (plotId == null) return _invalidIdentifier('plot');
    if (cropTypeId == null) return _invalidIdentifier('crop type');
    if (arguments['growth_stage_id'] != null && growthStageId == null) {
      return _invalidIdentifier('growth stage');
    }
    if (year == null || year < 2000 || year > 2200) {
      return _invalid('Season year must be between 2000 and 2200.');
    }
    if (!const {'kharif', 'rabi', 'zaid'}.contains(season)) {
      return _invalid('Season must be kharif, rabi, or zaid.');
    }
    return _prepare(
      kind: _PendingKind.createCropCycle,
      userTurn: userTurn,
      entityId: plotId,
      arguments: {
        'plot_id': plotId,
        'crop_type_id': cropTypeId,
        'season_year': year,
        'season': season,
        if (growthStageId != null) 'growth_stage_id': growthStageId,
      },
      message:
          'Ready to start the $season $year crop cycle on the selected plot. Ask for a clear yes or no.',
    );
  }

  VoiceToolResult _prepareUpdateReminder(
    Map<String, dynamic> arguments,
    int userTurn,
  ) {
    final cycleId = _identifier(arguments['crop_cycle_id']);
    final cadence = _optionalInt(arguments['cadence_days']);
    final photos = _optionalInt(arguments['target_photos']);
    final lead = _optionalInt(arguments['reminder_lead_days']);
    final active = arguments['is_active'];
    if (cycleId == null) return _invalidIdentifier('crop cycle');
    if (cadence == null || cadence < 14 || cadence > 90) {
      return _invalid('Reminder interval must be between 14 and 90 days.');
    }
    if (photos != 4 && photos != 5) {
      return _invalid('The evidence plan must request four or five photos.');
    }
    if (lead == null || lead < 0 || lead > 7) {
      return _invalid(
          'Reminder lead time must be between zero and seven days.');
    }
    if (active is! bool) {
      return _invalid('Reminder active state must be true or false.');
    }
    return _prepare(
      kind: _PendingKind.updateReminder,
      userTurn: userTurn,
      entityId: cycleId,
      arguments: {
        'crop_cycle_id': cycleId,
        'cadence_days': cadence,
        'target_photos': photos,
        'reminder_lead_days': lead,
        'timezone_name': 'Asia/Kolkata',
        'is_active': active,
      },
      message:
          'Ready to set a $cadence-day reminder for $photos photos. Ask for a clear yes or no.',
    );
  }

  VoiceToolResult _prepareSnoozeReminder(
    Map<String, dynamic> arguments,
    int userTurn,
  ) {
    final cycleId = _identifier(arguments['crop_cycle_id']);
    final days = _optionalInt(arguments['days']);
    if (cycleId == null) return _invalidIdentifier('crop cycle');
    if (days == null || days < 1 || days > 7) {
      return _invalid('A reminder can be snoozed by one to seven days.');
    }
    return _prepare(
      kind: _PendingKind.snoozeReminder,
      userTurn: userTurn,
      entityId: cycleId,
      arguments: {'crop_cycle_id': cycleId, 'days': days},
      message:
          'Ready to snooze this evidence reminder by $days days. Ask for a clear yes or no.',
    );
  }

  VoiceToolResult _prepareMarkNotificationRead(
    Map<String, dynamic> arguments,
    int userTurn,
  ) {
    final notificationId = _identifier(arguments['notification_id']);
    if (notificationId == null) return _invalidIdentifier('notification');
    return _prepare(
      kind: _PendingKind.markNotificationRead,
      userTurn: userTurn,
      entityId: notificationId,
      message:
          'Ready to mark that notification as read. Ask for a clear yes or no.',
    );
  }

  VoiceToolResult _prepareLogout(int userTurn) => _prepare(
        kind: _PendingKind.logout,
        userTurn: userTurn,
        message:
            'Ready to securely sign out of this device. Ask for a clear yes or no.',
      );

  VoiceToolResult _prepare({
    required _PendingKind kind,
    required int userTurn,
    required String message,
    String? entityId,
    Map<String, dynamic> arguments = const {},
  }) {
    _pending = _PendingAction(
      kind: kind,
      preparedOnUserTurn: userTurn,
      expiresAt: _now().add(const Duration(seconds: 60)),
      entityId: entityId,
      arguments: arguments,
    );
    return VoiceToolResult(
      outcome: VoiceActionOutcome.confirmationRequired,
      message: message,
      entityId: entityId,
      data: arguments,
    );
  }

  Future<VoiceToolResult> _confirm(int userTurn) async {
    final pending = _pending;
    if (pending == null) {
      return const VoiceToolResult(
        outcome: VoiceActionOutcome.failed,
        message: 'There is no pending action to confirm.',
      );
    }
    if (_now().isAfter(pending.expiresAt)) {
      _pending = null;
      return const VoiceToolResult(
        outcome: VoiceActionOutcome.cancelled,
        message: 'The pending confirmation expired. Prepare the action again.',
      );
    }
    if (userTurn <= pending.preparedOnUserTurn) {
      return const VoiceToolResult(
        outcome: VoiceActionOutcome.failed,
        message:
            'A new, explicit farmer confirmation is required before this action can run.',
      );
    }

    // Consume first so a repeated tool call cannot replay a sensitive action.
    _pending = null;
    switch (pending.kind) {
      case _PendingKind.syncQueue:
        final count = await gateway.syncOfflineQueue();
        return VoiceToolResult(
          outcome: VoiceActionOutcome.succeeded,
          message: 'Synced $count queued evidence submissions.',
          data: {'synced_count': count},
        );
      case _PendingKind.finalizeSubmission:
        final id = pending.entityId!;
        final value = await gateway.finalizeSubmission(id);
        return VoiceToolResult(
          outcome: VoiceActionOutcome.succeeded,
          message:
              'Submission $id was finalized for the existing review workflow.',
          entityId: id,
          data: {'id': id, 'status': value['status']},
        );
      case _PendingKind.createFarm:
        final args = pending.arguments;
        final value = await _extended.createFarm(
          name: args['name'] as String,
          totalAreaHectares: args['total_area_hectares'] as double?,
          notes: args['notes'] as String?,
        );
        return VoiceToolResult(
          outcome: VoiceActionOutcome.succeeded,
          message: 'Created farm ${value['name'] ?? args['name']}.',
          entityId: value['id']?.toString(),
          data: {'id': value['id'], 'name': value['name']},
        );
      case _PendingKind.createPlot:
        final args = pending.arguments;
        final value = await _extended.createPlot(
          farmId: args['farm_id'] as String,
          name: args['name'] as String,
          areaHectares: args['area_hectares'] as double?,
          soilType: args['soil_type'] as String?,
          irrigationType: args['irrigation_type'] as String?,
        );
        return VoiceToolResult(
          outcome: VoiceActionOutcome.succeeded,
          message: 'Created plot ${value['name'] ?? args['name']}.',
          entityId: value['id']?.toString(),
          data: {'id': value['id'], 'name': value['name']},
        );
      case _PendingKind.createCropCycle:
        final args = pending.arguments;
        final value = await _extended.createCropCycle(
          plotId: args['plot_id'] as String,
          cropTypeId: args['crop_type_id'] as String,
          seasonYear: args['season_year'] as int,
          season: args['season'] as String,
          growthStageId: args['growth_stage_id'] as String?,
        );
        return VoiceToolResult(
          outcome: VoiceActionOutcome.succeeded,
          message: 'Created the crop cycle and its first evidence reminder.',
          entityId: value['id']?.toString(),
          data: {'id': value['id'], 'status': value['status']},
        );
      case _PendingKind.updateReminder:
        final args = pending.arguments;
        final value = await _extended.updateEvidenceReminder(
          cropCycleId: args['crop_cycle_id'] as String,
          cadenceDays: args['cadence_days'] as int,
          targetPhotos: args['target_photos'] as int,
          reminderLeadDays: args['reminder_lead_days'] as int,
          timezoneName: args['timezone_name'] as String,
          isActive: args['is_active'] as bool,
        );
        return VoiceToolResult(
          outcome: VoiceActionOutcome.succeeded,
          message: 'Updated the recurring evidence reminder.',
          entityId: pending.entityId,
          data: {
            'next_due_at': value['next_due_at'],
            'cadence_days': value['cadence_days'],
            'target_photos': value['target_photos'],
          },
        );
      case _PendingKind.snoozeReminder:
        final args = pending.arguments;
        final value = await _extended.snoozeEvidenceReminder(
          cropCycleId: args['crop_cycle_id'] as String,
          days: args['days'] as int,
        );
        return VoiceToolResult(
          outcome: VoiceActionOutcome.succeeded,
          message: 'Snoozed the reminder by ${args['days']} days.',
          entityId: pending.entityId,
          data: {'next_due_at': value['next_due_at']},
        );
      case _PendingKind.markNotificationRead:
        await _extended.markNotificationRead(pending.entityId!);
        return VoiceToolResult(
          outcome: VoiceActionOutcome.succeeded,
          message: 'Marked the notification as read.',
          entityId: pending.entityId,
        );
      case _PendingKind.logout:
        await _extended.logout();
        navigate('/login');
        return const VoiceToolResult(
          outcome: VoiceActionOutcome.succeeded,
          message: 'Signed out securely.',
        );
    }
  }

  VoiceToolResult _cancel() {
    final hadPending = _pending != null;
    _pending = null;
    return VoiceToolResult(
      outcome: VoiceActionOutcome.cancelled,
      message: hadPending
          ? 'The pending action was cancelled.'
          : 'There was no pending action.',
    );
  }

  static VoiceToolResult _fromCapture(Map<String, dynamic> value) {
    final ok = value['ok'] == true;
    return VoiceToolResult(
      outcome: ok ? VoiceActionOutcome.succeeded : VoiceActionOutcome.failed,
      message: value['message']?.toString() ??
          (ok ? 'Capture action completed.' : 'Capture action failed.'),
      data: value,
    );
  }

  static Map<String, dynamic> _map(dynamic value) =>
      value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

  static String? _identifier(dynamic value) {
    final text = value?.toString().trim() ?? '';
    if (text.isEmpty || text.length > 128 || text.contains(RegExp(r'[\r\n]'))) {
      return null;
    }
    return text;
  }

  static double? _optionalDouble(dynamic value) {
    if (value == null || '$value'.trim().isEmpty) return null;
    return value is num ? value.toDouble() : double.tryParse('$value');
  }

  static int? _optionalInt(dynamic value) {
    if (value is int) return value;
    if (value is num && value == value.roundToDouble()) return value.toInt();
    return int.tryParse('${value ?? ''}');
  }

  static VoiceToolResult _invalid(String message) => VoiceToolResult(
        outcome: VoiceActionOutcome.failed,
        message: message,
      );

  static VoiceToolResult _invalidIdentifier(String label) => _invalid(
        'A valid $label identifier is required.',
      );

  static String _safeError(Object error) {
    final text = error.toString().replaceAll(RegExp(r'[\r\n]+'), ' ');
    return text.length <= 180 ? text : '${text.substring(0, 180)}…';
  }
}
