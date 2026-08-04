import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:fasalpramaan/services/api_client.dart';
import 'package:fasalpramaan/services/evidence_notification_service.dart';

class EvidenceRemindersScreen extends StatefulWidget {
  const EvidenceRemindersScreen({super.key});

  @override
  State<EvidenceRemindersScreen> createState() =>
      _EvidenceRemindersScreenState();
}

class _EvidenceRemindersScreenState extends State<EvidenceRemindersScreen> {
  final _api = ApiClient();
  final _updating = <String>{};
  List<Map<String, dynamic>> _plans = [];
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final rows = await _api.evidenceReminders();
      final plans = rows
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList();
      try {
        await evidenceNotificationService.syncPlans(plans);
      } catch (_) {
        // Server-side in-app reminders remain available if the platform does
        // not provide local notification scheduling.
      }
      if (mounted) {
        setState(() {
          _plans = plans;
          _error = null;
          _loading = false;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = 'Could not load reminder plans. Check your connection.';
          _loading = false;
        });
      }
    }
  }

  Future<void> _update(
    Map<String, dynamic> plan, {
    int? cadenceDays,
    int? targetPhotos,
    bool? isActive,
  }) async {
    final cycleId = '${plan['crop_cycle_id']}';
    setState(() => _updating.add(cycleId));
    try {
      await _api.updateEvidenceReminder(
        cropCycleId: cycleId,
        cadenceDays: cadenceDays ?? (plan['cadence_days'] as num).toInt(),
        targetPhotos: targetPhotos ?? (plan['target_photos'] as num).toInt(),
        reminderLeadDays: (plan['reminder_lead_days'] as num?)?.toInt() ?? 3,
        timezoneName: '${plan['timezone_name'] ?? 'Asia/Kolkata'}',
        isActive: isActive ?? plan['is_active'] == true,
      );
      await _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Reminder update failed. Try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _updating.remove(cycleId));
    }
  }

  Future<void> _snooze(Map<String, dynamic> plan) async {
    final cycleId = '${plan['crop_cycle_id']}';
    setState(() => _updating.add(cycleId));
    try {
      await _api.snoozeEvidenceReminder(cropCycleId: cycleId, days: 2);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Reminder moved by two days.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not snooze this reminder.')),
        );
      }
    } finally {
      if (mounted) setState(() => _updating.remove(cycleId));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Evidence reminders'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _body(),
      ),
    );
  }

  Widget _body() {
    if (_loading && _plans.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _plans.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 140),
          const Icon(Icons.cloud_off_rounded, size: 52, color: Colors.grey),
          const SizedBox(height: 12),
          Center(child: Text(_error!)),
          Center(
              child: TextButton(onPressed: _load, child: const Text('Retry'))),
        ],
      );
    }
    if (_plans.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(28),
        children: const [
          SizedBox(height: 100),
          Icon(Icons.event_available_rounded,
              size: 56, color: Color(0xFF059669)),
          SizedBox(height: 16),
          Text(
            'Create an active crop cycle to start a monthly evidence record.',
            textAlign: TextAlign.center,
          ),
        ],
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Card(
          color: Color(0xFFECFDF5),
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.history_rounded, color: Color(0xFF047857)),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Keep a consistent before-and-after record. Each reminder opens a guided 4–5 photo, GPS-stamped capture.',
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        for (final plan in _plans) _planCard(plan),
      ],
    );
  }

  Widget _planCard(Map<String, dynamic> plan) {
    final cycleId = '${plan['crop_cycle_id']}';
    final busy = _updating.contains(cycleId);
    final active = plan['is_active'] == true;
    final overdue = plan['overdue'] == true;
    final due = DateTime.tryParse('${plan['next_due_at']}')?.toLocal();
    final cadence = (plan['cadence_days'] as num?)?.toInt() ?? 30;
    final photos = (plan['target_photos'] as num?)?.toInt() ?? 5;
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: overdue
                      ? const Color(0xFFFFEDD5)
                      : const Color(0xFFD1FAE5),
                  child: Icon(
                    overdue ? Icons.warning_amber_rounded : Icons.eco_rounded,
                    color: overdue
                        ? const Color(0xFFC2410C)
                        : const Color(0xFF047857),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${plan['crop_name'] ?? 'Crop'} · ${plan['season'] ?? ''} ${plan['season_year'] ?? ''}',
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                      Text(
                        due == null
                            ? 'Due date unavailable'
                            : '${overdue ? 'Overdue since' : 'Next due'} ${DateFormat('d MMM y, h:mm a').format(due)}',
                        style: TextStyle(
                          color: overdue
                              ? const Color(0xFFC2410C)
                              : const Color(0xFF475569),
                          fontWeight:
                              overdue ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                    ],
                  ),
                ),
                Switch(
                  value: active,
                  onChanged:
                      busy ? null : (value) => _update(plan, isActive: value),
                ),
              ],
            ),
            const Divider(height: 28),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<int>(
                    key: ValueKey('$cycleId-cadence-$cadence'),
                    initialValue: cadence,
                    decoration: const InputDecoration(labelText: 'Interval'),
                    items: const [14, 30, 45, 60, 90]
                        .map((days) => DropdownMenuItem(
                              value: days,
                              child: Text('$days days'),
                            ))
                        .toList(),
                    onChanged: busy || !active
                        ? null
                        : (value) {
                            if (value != null) {
                              _update(plan, cadenceDays: value);
                            }
                          },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<int>(
                    key: ValueKey('$cycleId-photos-$photos'),
                    initialValue: photos,
                    decoration: const InputDecoration(labelText: 'Photos'),
                    items: const [4, 5]
                        .map((count) => DropdownMenuItem(
                              value: count,
                              child: Text('$count photos'),
                            ))
                        .toList(),
                    onChanged: busy || !active
                        ? null
                        : (value) {
                            if (value != null) {
                              _update(plan, targetPhotos: value);
                            }
                          },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: busy || !active ? null : () => _snooze(plan),
                    icon: const Icon(Icons.snooze_rounded),
                    label: const Text('Snooze 2 days'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: busy || !active
                        ? null
                        : () => context.push(
                              '/capture?crop_cycle_id=${Uri.encodeQueryComponent(cycleId)}',
                            ),
                    icon: busy
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.photo_camera_rounded),
                    label: const Text('Capture now'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
