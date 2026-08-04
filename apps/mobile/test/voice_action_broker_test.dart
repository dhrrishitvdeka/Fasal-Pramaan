import 'package:fasalpramaan/features/voice/voice_action_broker.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeGateway implements VoiceActionGateway {
  int syncCalls = 0;
  int finalizeCalls = 0;
  List<Map<String, dynamic>> queue = [
    {'status': 'queued'}
  ];

  @override
  Future<List<dynamic>> farms() async => [
        {'id': 'farm-1', 'name': 'North plot'}
      ];

  @override
  Future<List<dynamic>> cropCycles() async => [];

  @override
  Future<List<dynamic>> submissions() async => [];

  @override
  Future<List<dynamic>> notifications() async => [];

  @override
  Future<List<Map<String, dynamic>>> offlineQueue() async => queue;

  @override
  Future<int> syncOfflineQueue() async {
    syncCalls++;
    return queue.length;
  }

  @override
  Future<Map<String, dynamic>> finalizeSubmission(String submissionId) async {
    finalizeCalls++;
    return {'id': submissionId, 'status': 'processing'};
  }
}

class _ExtendedFakeGateway extends _FakeGateway
    implements ExtendedVoiceActionGateway {
  int createFarmCalls = 0;

  @override
  Future<List<dynamic>> crops() async => [];

  @override
  Future<List<dynamic>> evidenceReminders() async => [];

  @override
  Future<List<dynamic>> growthStages({String? cropTypeId}) async => [];

  @override
  Future<List<dynamic>> plots(String farmId) async => [];

  @override
  Future<Map<String, dynamic>> createFarm({
    required String name,
    double? totalAreaHectares,
    String? notes,
  }) async {
    createFarmCalls++;
    return {'id': 'farm-created', 'name': name};
  }

  @override
  Future<Map<String, dynamic>> createPlot({
    required String farmId,
    required String name,
    double? areaHectares,
    String? soilType,
    String? irrigationType,
  }) async =>
      {'id': 'plot-created', 'name': name};

  @override
  Future<Map<String, dynamic>> createCropCycle({
    required String plotId,
    required String cropTypeId,
    required int seasonYear,
    required String season,
    String? growthStageId,
  }) async =>
      {'id': 'cycle-created', 'status': 'active'};

  @override
  Future<Map<String, dynamic>> snoozeEvidenceReminder({
    required String cropCycleId,
    required int days,
  }) async =>
      {'next_due_at': '2026-09-01T00:00:00Z'};

  @override
  Future<Map<String, dynamic>> updateEvidenceReminder({
    required String cropCycleId,
    required int cadenceDays,
    required int targetPhotos,
    required int reminderLeadDays,
    required String timezoneName,
    required bool isActive,
  }) async =>
      {
        'next_due_at': '2026-09-01T00:00:00Z',
        'cadence_days': cadenceDays,
        'target_photos': targetPhotos,
      };

  @override
  Future<void> markNotificationRead(String notificationId) async {}

  @override
  Future<void> logout() async {}
}

void main() {
  test('navigation accepts only allowlisted farmer screens', () async {
    final routes = <String>[];
    final broker = VoiceActionBroker(
      gateway: _FakeGateway(),
      navigate: routes.add,
    );

    final allowed = await broker.execute(
      'navigate_to_screen',
      {'screen': 'farms'},
      userTurn: 1,
    );
    final denied = await broker.execute(
      'navigate_to_screen',
      {'screen': 'admin'},
      userTurn: 1,
    );

    expect(allowed.outcome, VoiceActionOutcome.succeeded);
    expect(routes, ['/farms']);
    expect(denied.outcome, VoiceActionOutcome.failed);
  });

  test('unknown model tools cannot execute', () async {
    final broker = VoiceActionBroker(
      gateway: _FakeGateway(),
      navigate: (_) {},
    );

    final result = await broker.execute(
      'delete_all_farms',
      const {},
      userTurn: 1,
    );

    expect(result.outcome, VoiceActionOutcome.failed);
    expect(result.message, contains('not allowed'));
  });

  test('sync needs a later spoken turn and cannot replay', () async {
    final gateway = _FakeGateway();
    final broker = VoiceActionBroker(gateway: gateway, navigate: (_) {});

    final prepared = await broker.execute(
      'prepare_sync_offline_queue',
      const {},
      userTurn: 4,
    );
    final sameTurn = await broker.execute(
      'confirm_pending_action',
      const {},
      userTurn: 4,
    );
    final confirmed = await broker.execute(
      'confirm_pending_action',
      const {},
      userTurn: 5,
    );
    final replay = await broker.execute(
      'confirm_pending_action',
      const {},
      userTurn: 6,
    );

    expect(prepared.outcome, VoiceActionOutcome.confirmationRequired);
    expect(sameTurn.outcome, VoiceActionOutcome.failed);
    expect(gateway.syncCalls, 1);
    expect(confirmed.outcome, VoiceActionOutcome.succeeded);
    expect(replay.outcome, VoiceActionOutcome.failed);
  });

  test('finalize confirmation consumes the pending action first', () async {
    final gateway = _FakeGateway();
    final broker = VoiceActionBroker(gateway: gateway, navigate: (_) {});

    await broker.execute(
      'prepare_finalize_submission',
      {'submission_id': 'submission-123'},
      userTurn: 10,
    );
    final result = await broker.execute(
      'confirm_pending_action',
      const {},
      userTurn: 11,
    );

    expect(result.outcome, VoiceActionOutcome.succeeded);
    expect(result.entityId, 'submission-123');
    expect(gateway.finalizeCalls, 1);
    expect(broker.hasPendingConfirmation, isFalse);
  });

  test('farm creation validates, confirms on a later turn, and cannot replay',
      () async {
    final gateway = _ExtendedFakeGateway();
    final broker = VoiceActionBroker(gateway: gateway, navigate: (_) {});

    final invalid = await broker.execute(
      'prepare_create_farm',
      {'name': 'North Farm', 'total_area_hectares': 'not-a-number'},
      userTurn: 1,
    );
    final prepared = await broker.execute(
      'prepare_create_farm',
      {'name': 'North Farm', 'total_area_hectares': 2.5},
      userTurn: 2,
    );
    final sameTurn = await broker.execute(
      'confirm_pending_action',
      const {},
      userTurn: 2,
    );
    final confirmed = await broker.execute(
      'confirm_pending_action',
      const {},
      userTurn: 3,
    );
    final replay = await broker.execute(
      'confirm_pending_action',
      const {},
      userTurn: 4,
    );

    expect(invalid.outcome, VoiceActionOutcome.failed);
    expect(prepared.outcome, VoiceActionOutcome.confirmationRequired);
    expect(sameTurn.outcome, VoiceActionOutcome.failed);
    expect(confirmed.outcome, VoiceActionOutcome.succeeded);
    expect(confirmed.entityId, 'farm-created');
    expect(replay.outcome, VoiceActionOutcome.failed);
    expect(gateway.createFarmCalls, 1);
  });

  test('evidence reminder settings enforce the four-to-five photo policy',
      () async {
    final broker = VoiceActionBroker(
      gateway: _ExtendedFakeGateway(),
      navigate: (_) {},
    );

    final result = await broker.execute(
      'prepare_update_evidence_reminder',
      {
        'crop_cycle_id': 'cycle-1',
        'cadence_days': 30,
        'target_photos': 3,
        'reminder_lead_days': 3,
        'is_active': true,
      },
      userTurn: 1,
    );

    expect(result.outcome, VoiceActionOutcome.failed);
    expect(result.message, contains('four or five'));
  });
}
