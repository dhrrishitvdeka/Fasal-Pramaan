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
                      final statusStr = item['status'] as String? ?? 'processing';
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
                                color: Colors.black.withOpacity(0.03),
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
                                        : (isHi ? 'प्रक्रिया में...' : 'Processing'),
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

                              if (statusStr == 'needs_recapture') ...[
                                const SizedBox(height: 14),
                                ElevatedButton.icon(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFFD97706),
                                    minimumSize: const Size.fromHeight(42),
                                  ),
                                  onPressed: () => context.push(
                                    '/capture?submission_id=${Uri.encodeQueryComponent(item['id'].toString())}'
                                    '&crop_cycle_id=${Uri.encodeQueryComponent(item['crop_cycle_id'].toString())}',
                                  ),
                                  icon: const Icon(Icons.refresh_rounded,
                                      size: 20, color: Colors.white),
                                  label: Text(
                                    s.captureReplacement,
                                    style: const TextStyle(color: Colors.white),
                                  ),
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

  Widget _buildMetricBox({
    required String label,
    required String value,
    required Color color,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withOpacity(0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.2)),
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
