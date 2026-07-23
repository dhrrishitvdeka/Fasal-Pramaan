import 'package:flutter/material.dart';
import 'package:fasalpramaan/services/api_client.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List items = [];
  @override
  void initState() {
    super.initState();
    ApiClient().notifications().then((v) {
      if (mounted) setState(() => items = v);
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: ListView.builder(
        itemCount: items.length,
        itemBuilder: (_, i) {
          final n = items[i];
          return ListTile(
            leading: const Icon(Icons.notifications),
            title: Text('${n['title']}'),
            subtitle: Text('${n['body']}'),
          );
        },
      ),
    );
  }
}
