import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:fasalpramaan/services/api_client.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _api = ApiClient();
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final result = await _api.notifications();
      if (!mounted) return;
      setState(() {
        _items = result
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not load notifications.';
      });
    }
  }

  Future<void> _open(Map<String, dynamic> notification) async {
    final id = '${notification['id'] ?? ''}';
    if (id.isNotEmpty && notification['is_read'] != true) {
      try {
        await _api.markNotificationRead(id);
        notification['is_read'] = true;
        if (mounted) setState(() {});
      } catch (_) {
        // Opening the linked workflow remains useful when read-state sync fails.
      }
    }
    if (!mounted) return;
    final payload = notification['payload'];
    final route = payload is Map ? payload['route'] : null;
    if (route is String && route.startsWith('/')) {
      context.push(route);
    } else if (notification['related_submission_id'] != null) {
      context.push('/results');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _items.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 160),
          const Icon(Icons.cloud_off_rounded, size: 48, color: Colors.grey),
          const SizedBox(height: 12),
          Center(child: Text(_error!)),
          Center(
              child: TextButton(onPressed: _load, child: const Text('Retry'))),
        ],
      );
    }
    if (_items.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 160),
          Icon(Icons.notifications_none_rounded, size: 52, color: Colors.grey),
          SizedBox(height: 12),
          Center(child: Text('No notifications yet.')),
        ],
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: _items.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (_, index) {
        final item = _items[index];
        final unread = item['is_read'] != true;
        final isReminder =
            '${item['event_type']}'.startsWith('evidence_capture');
        return ListTile(
          tileColor: unread ? const Color(0xFFECFDF5) : null,
          leading: CircleAvatar(
            backgroundColor:
                isReminder ? const Color(0xFFD1FAE5) : const Color(0xFFEFF6FF),
            child: Icon(
              isReminder
                  ? Icons.event_repeat_rounded
                  : Icons.notifications_rounded,
              color: isReminder
                  ? const Color(0xFF047857)
                  : const Color(0xFF2563EB),
            ),
          ),
          title: Text(
            '${item['title'] ?? 'Notification'}',
            style: TextStyle(
                fontWeight: unread ? FontWeight.bold : FontWeight.w600),
          ),
          subtitle: Text('${item['body'] ?? ''}'),
          trailing: unread
              ? const Icon(Icons.circle, size: 9, color: Color(0xFF059669))
              : const Icon(Icons.chevron_right_rounded),
          onTap: () => _open(item),
        );
      },
    );
  }
}
