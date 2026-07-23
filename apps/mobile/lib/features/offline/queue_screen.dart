import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fasalpramaan/core/l10n.dart';
import 'package:fasalpramaan/services/api_client.dart';
import 'package:fasalpramaan/services/offline_db.dart';
import 'package:fasalpramaan/services/sync_service.dart';

class QueueScreen extends ConsumerStatefulWidget {
  const QueueScreen({super.key});
  @override
  ConsumerState<QueueScreen> createState() => _QueueScreenState();
}

class _QueueScreenState extends ConsumerState<QueueScreen> {
  final db = OfflineDb();
  late final SyncService sync;
  List<Map<String, dynamic>> items = [];
  String? status;
  bool isSyncing = false;

  @override
  void initState() {
    super.initState();
    sync = SyncService(ApiClient(), db);
    _load();
  }

  Future<void> _load() async {
    items = await db.listQueue();
    if (mounted) setState(() {});
  }

  Future<void> _sync() async {
    final s = S.of(ref);
    final isHi = s.isHi;
    setState(() {
      isSyncing = true;
      status = isHi ? 'सर्वर के साथ ऑफ़लाइन साक्ष्य सिंक हो रहे हैं...' : 'Syncing offline evidence with server...';
    });
    try {
      final n = await sync.syncNow();
      await _load();
      setState(() =>
          status = isHi ? '$n आइटम सफलतापूर्वक सिंक किए गए।' : 'Synced $n item(s). Local encrypted rows retained.');
    } catch (_) {
      setState(() => status = isHi ? 'सिंक में नेटवर्क समस्या आई। पुनः प्रयास हो रहा है...' : 'Sync encountered network issue. Retrying...');
    } finally {
      if (mounted) setState(() => isSyncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(ref);
    final isHi = s.isHi;

    return Scaffold(
      appBar: AppBar(
        title: Text(s.queue),
        actions: [
          IconButton(
            icon: isSyncing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.sync_rounded),
            onPressed: isSyncing ? null : _sync,
            tooltip: s.syncNow,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            // Status Header Banner
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFECFDF5),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF10B981)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.security_rounded,
                      color: Color(0xFF064E3B), size: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s.encryptedQueueTitle,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF064E3B),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          status ?? '${items.length} ${isHi ? 'लंबित ऑफ़लाइन आइटम' : 'pending offline item(s)'}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF047857),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  isHi ? 'ऑफ़लाइन ड्राफ्ट सूची' : 'Pending Upload Queue',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    backgroundColor: const Color(0xFF064E3B),
                  ),
                  onPressed: isSyncing ? null : _sync,
                  icon: const Icon(Icons.cloud_upload_rounded, size: 18),
                  label: Text(s.syncNow),
                ),
              ],
            ),
            const SizedBox(height: 12),

            if (items.isEmpty)
              Container(
                padding: const EdgeInsets.all(32),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  children: [
                    const Icon(Icons.task_alt_rounded,
                        color: Color(0xFF059669), size: 48),
                    const SizedBox(height: 12),
                    Text(
                      s.allEvidenceSynced,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      isHi
                          ? 'कोई भी लंबित ऑफ़लाइन ड्राफ्ट नहीं है। आपकी सभी फोटो अपलोड हो चुकी हैं।'
                          : 'No pending offline evidence drafts. All captured photos are uploaded.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                    ),
                  ],
                ),
              )
            else
              ...items.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.02),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
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
                                  horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEF3C7),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                '${item['status']}'.toUpperCase(),
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFFD97706),
                                ),
                              ),
                            ),
                            const Spacer(),
                            Text(
                              'Local ID: #${item['local_id'].toString().substring(0, 8)}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Color(0xFF64748B),
                                fontFamily: 'monospace',
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'Idempotency Key: ${item['idempotency_key']}',
                          style: const TextStyle(
                              fontSize: 12, color: Color(0xFF475569)),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
