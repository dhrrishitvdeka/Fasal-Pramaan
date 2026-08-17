import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fasalpramaan/core/l10n.dart';
import 'package:fasalpramaan/services/api_client.dart';
import 'package:fasalpramaan/core/widgets/shimmer_loading.dart';
import 'package:fasalpramaan/core/widgets/fade_slide_transition.dart';
import 'package:go_router/go_router.dart';

class ResultsScreen extends ConsumerStatefulWidget {
  const ResultsScreen({super.key});
  @override
  ConsumerState<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends ConsumerState<ResultsScreen> {
  final api = ApiClient();
  List<dynamic> items = [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      items = await api.submissions();
    } catch (_) {}
    if (mounted) setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(ref);
    final isHi = s.isHi;

    return Scaffold(
      appBar: AppBar(
        title: Text(s.results),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              setState(() => loading = true);
              _load();
            },
          ),
        ],
      ),
      body: loading
          ? const SkeletonListLoader(count: 4)
          : items.isEmpty
              ? _buildEmptyState(isHi)
              : FadeSlideTransition(
                  child: ListView.builder(
                    padding: const EdgeInsets.all(20),
                    itemCount: items.length,
                    itemBuilder: (_, i) {
                      final item = items[i] as Map;
                      final pred = item['latest_prediction'] as Map?;
                      final statusStr =
                          item['status'] as String? ?? 'processing';
                      final grade = pred?['predicted_grade']?.toString();
                      final gradeLabel = pred?['grade_label']?.toString();
                      final damage = pred?['primary_damage']?.toString();
                      final severity = item['severity'] ?? pred?['severity'];

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.03),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: _statusBg(statusStr),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(_statusIcon(statusStr),
                                            color: _statusColor(statusStr),
                                            size: 16),
                                        const SizedBox(width: 6),
                                        Text(
                                          statusStr.toUpperCase(),
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.bold,
                                            color: _statusColor(statusStr),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const Spacer(),
                                  Text(
                                    '#${item['id'].toString().substring(0, 8)}',
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF64748B),
                                      fontFamily: 'monospace',
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),

                              // Metric Row Cards
                              Row(
                                children: [
                                  _buildMetricBox(
                                    label: s.screeningGrade,
                                    value: grade != null
                                        ? '$grade (${gradeLabel ?? "Grade $grade"})'
                                        : (isHi
                                            ? 'प्रक्रिया में...'
                                            : 'Processing'),
                                    color: const Color(0xFF064E3B),
                                  ),
                                  const SizedBox(width: 10),
                                  _buildMetricBox(
                                    label: s.damageSeverity,
                                    value: severity != null
                                        ? '${(double.tryParse(severity.toString()) ?? 0.0 * 100).toStringAsFixed(0)}%'
                                        : '—',
                                    color: const Color(0xFFD97706),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),

                              // Evidence Confidence Metric if available
                              if (item['evidence_evaluation'] != null ||
                                  item['latest_evaluation'] != null) ...[
                                Builder(
                                  builder: (_) {
                                    final ev = item['evidence_evaluation'] ??
                                        item['latest_evaluation'];
                                    final conf = ev is Map &&
                                            ev['confidence'] is Map
                                        ? ev['confidence']['final']
                                        : null;
                                    if (conf == null) return const SizedBox.shrink();
                                    final isHigh = (conf is num && conf >= 85);
                                    return Container(
                                      margin: const EdgeInsets.only(bottom: 10),
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 12, vertical: 8),
                                      decoration: BoxDecoration(
                                        color: isHigh
                                            ? const Color(0xFFF0FDF4)
                                            : const Color(0xFFFFFBEB),
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(
                                          color: isHigh
                                              ? const Color(0xFFBBF7D0)
                                              : const Color(0xFFFDE68A),
                                        ),
                                      ),
                                      child: Row(
                                        children: [
                                          Icon(
                                            isHigh
                                                ? Icons.verified_outlined
                                                : Icons.help_outline_rounded,
                                            size: 16,
                                            color: isHigh
                                                ? const Color(0xFF16A34A)
                                                : const Color(0xFFD97706),
                                          ),
                                          const SizedBox(width: 8),
                                          Text(
                                            '${s.evidenceConfidence}:',
                                            style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                              color: isHigh
                                                  ? const Color(0xFF166534)
                                                  : const Color(0xFF92400E),
                                            ),
                                          ),
                                          const Spacer(),
                                          Text(
                                            '$conf / 100',
                                            style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.bold,
                                              fontFamily: 'monospace',
                                              color: isHigh
                                                  ? const Color(0xFF166534)
                                                  : const Color(0xFF92400E),
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  },
                                ),
                              ],

                              if (damage != null) ...[
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF8FAFC),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.coronavirus_outlined,
                                          color: Color(0xFFDC2626), size: 20),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          '${s.primaryPeril}: $damage',
                                          style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            color: Color(0xFF0F172A),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 12),
                              ],

                              Text(
                                s.assistiveNotice,
                                style: const TextStyle(
                                    fontSize: 11, color: Color(0xFF94A3B8)),
                              ),

                              // Structured Adaptive Recapture Card
                              if (statusStr == 'needs_recapture') ...[
                                const SizedBox(height: 14),
                                Builder(
                                  builder: (_) {
                                    final reqAngles =
                                        _extractRequestedAngles(item);
                                    final reason =
                                        _extractRecaptureReason(item, s);

                                    return Container(
                                      padding: const EdgeInsets.all(14),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFFFFBEB),
                                        borderRadius: BorderRadius.circular(14),
                                        border: Border.all(
                                            color: const Color(0xFFF59E0B),
                                            width: 1.2),
                                      ),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            children: [
                                              const Icon(
                                                  Icons.warning_amber_rounded,
                                                  color: Color(0xFFB45309),
                                                  size: 20),
                                              const SizedBox(width: 8),
                                              Expanded(
                                                child: Text(
                                                  s.additionalEvidenceRequired,
                                                  style: const TextStyle(
                                                    fontSize: 13,
                                                    fontWeight: FontWeight.bold,
                                                    color: Color(0xFF92400E),
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                          const SizedBox(height: 8),
                                          Wrap(
                                            spacing: 6,
                                            runSpacing: 4,
                                            children: reqAngles.map((angle) {
                                              return Container(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        horizontal: 8,
                                                        vertical: 4),
                                                decoration: BoxDecoration(
                                                  color:
                                                      const Color(0xFFFEF3C7),
                                                  borderRadius:
                                                      BorderRadius.circular(6),
                                                  border: Border.all(
                                                      color: const Color(
                                                          0xFFFCD34D)),
                                                ),
                                                child: Row(
                                                  mainAxisSize:
                                                      MainAxisSize.min,
                                                  children: [
                                                    const Icon(
                                                        Icons.camera_alt_outlined,
                                                        size: 14,
                                                        color:
                                                            Color(0xFF92400E)),
                                                    const SizedBox(width: 4),
                                                    Text(
                                                      _getAngleDisplayName(
                                                          angle, isHi),
                                                      style: const TextStyle(
                                                        fontSize: 11,
                                                        fontWeight:
                                                            FontWeight.bold,
                                                        color:
                                                            Color(0xFF78350F),
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              );
                                            }).toList(),
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            '${s.recaptureReasonLabel}: $reason',
                                            style: const TextStyle(
                                              fontSize: 12,
                                              color: Color(0xFF78350F),
                                              height: 1.3,
                                            ),
                                          ),
                                          const SizedBox(height: 12),
                                          ElevatedButton.icon(
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor:
                                                  const Color(0xFFD97706),
                                              minimumSize:
                                                  const Size.fromHeight(44),
                                            ),
                                            onPressed: () => context.push(
                                              '/capture?submission_id=${Uri.encodeQueryComponent(item['id'].toString())}'
                                              '&crop_cycle_id=${Uri.encodeQueryComponent(item['crop_cycle_id'].toString())}'
                                              '&required_angles=${Uri.encodeQueryComponent(reqAngles.join(","))}'
                                              '&reason=${Uri.encodeQueryComponent(reason)}',
                                            ),
                                            icon: const Icon(
                                                Icons.camera_enhance_rounded,
                                                size: 20,
                                                color: Colors.white),
                                            label: Text(
                                              s.captureRequestedEvidence,
                                              style: const TextStyle(
                                                  color: Colors.white,
                                                  fontWeight: FontWeight.bold),
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  },
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  List<String> _extractRequestedAngles(Map item) {
    final ev = item['evidence_evaluation'] ?? item['latest_evaluation'];
    if (ev is Map) {
      final req = ev['request'];
      if (req is Map && req['required_angles'] is List) {
        final list = (req['required_angles'] as List)
            .map((e) => e.toString())
            .where((e) => e.isNotEmpty)
            .toList();
        if (list.isNotEmpty) return list;
      }
    }
    if (item['required_angles'] is List) {
      final list = (item['required_angles'] as List)
          .map((e) => e.toString())
          .where((e) => e.isNotEmpty)
          .toList();
      if (list.isNotEmpty) return list;
    }
    final rr = item['recapture_request'];
    if (rr is Map && rr['required_angles'] is List) {
      final list = (rr['required_angles'] as List)
          .map((e) => e.toString())
          .where((e) => e.isNotEmpty)
          .toList();
      if (list.isNotEmpty) return list;
    }
    return const ['closeup_damage'];
  }

  String _extractRecaptureReason(Map item, S s) {
    final ev = item['evidence_evaluation'] ?? item['latest_evaluation'];
    if (ev is Map) {
      final unc = ev['uncertainty'];
      if (unc is Map &&
          unc['reasons'] is List &&
          (unc['reasons'] as List).isNotEmpty) {
        return (unc['reasons'] as List).first.toString();
      }
      final req = ev['request'];
      if (req is Map && req['instructions'] != null) {
        return req['instructions'].toString();
      }
    }
    final rr = item['recapture_request'];
    if (rr is Map &&
        rr['reason'] != null &&
        rr['reason'].toString().isNotEmpty) {
      return rr['reason'].toString();
    }
    if (item['farmer_observations'] != null &&
        item['farmer_observations'].toString().isNotEmpty) {
      return item['farmer_observations'].toString();
    }
    return s.defaultRecaptureReason;
  }

  String _getAngleDisplayName(String angleKey, bool isHi) {
    switch (angleKey) {
      case 'wide_field':
        return isHi ? 'खेत का समग्र दृश्य (Wide Field)' : 'Wide Field View';
      case 'left_context':
        return isHi ? 'बायाँ संदर्भ दृश्य' : 'Left Context View';
      case 'mid_canopy':
        return isHi ? 'फसल कैनोपी दृश्य (Mid-Canopy)' : 'Mid-Canopy View';
      case 'right_context':
        return isHi ? 'दायाँ संदर्भ दृश्य' : 'Right Context View';
      case 'closeup_damage':
        return isHi
            ? 'क्षतिग्रस्त हिस्सा (Close-Up Damage)'
            : 'Close-Up Damage Photo';
      default:
        return angleKey.replaceAll('_', ' ');
    }
  }

  Widget _buildMetricBox({
    required String label,
    required String value,
    required Color color,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(bool isHi) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.assignment_outlined,
                size: 64, color: Color(0xFF94A3B8)),
            const SizedBox(height: 16),
            Text(
              isHi ? 'कोई मूल्यांकन परिणाम नहीं' : 'No Assessment Submissions',
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              isHi
                  ? 'फसल फोटो कैप्चर और सिंक करने के बाद परिणाम यहां दिखाई देंगे।'
                  : 'Submissions will appear here after evidence is captured and synced.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
            ),
          ],
        ),
      ),
    );
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'accepted':
      case 'verified':
        return Icons.check_circle_rounded;
      case 'needs_recapture':
        return Icons.warning_amber_rounded;
      case 'rejected':
        return Icons.cancel_rounded;
      default:
        return Icons.hourglass_top_rounded;
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'accepted':
      case 'verified':
        return const Color(0xFF16A34A);
      case 'needs_recapture':
        return const Color(0xFFD97706);
      case 'rejected':
        return Colors.redAccent;
      default:
        return const Color(0xFF2563EB);
    }
  }

  Color _statusBg(String status) {
    switch (status) {
      case 'accepted':
      case 'verified':
        return const Color(0xFFF0FDF4);
      case 'needs_recapture':
        return const Color(0xFFFFFBEB);
      case 'rejected':
        return const Color(0xFFFEE2E2);
      default:
        return const Color(0xFFEFF6FF);
    }
  }
}
