import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fasalpramaan/app.dart';
import 'package:fasalpramaan/core/config.dart';
import 'package:fasalpramaan/services/api_client.dart';
import 'package:fasalpramaan/services/offline_db.dart';
import 'package:fasalpramaan/services/sync_service.dart';
import 'package:fasalpramaan/services/evidence_notification_service.dart';

late final SyncService backgroundSync;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  AppConfig.assertSafeRuntime();
  try {
    await evidenceNotificationService.initialize();
  } catch (error) {
    // The app remains usable when a desktop/browser target does not expose
    // native scheduling. Server-side in-app reminders still apply.
    debugPrint('Notification initialization unavailable: $error');
  }
  backgroundSync = SyncService(ApiClient(), OfflineDb())..startAutoSync();
  runApp(const ProviderScope(child: FasalPramaanApp()));
}
