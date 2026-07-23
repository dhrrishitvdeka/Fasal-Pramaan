import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fasalpramaan/app.dart';
import 'package:fasalpramaan/core/config.dart';
import 'package:fasalpramaan/services/api_client.dart';
import 'package:fasalpramaan/services/offline_db.dart';
import 'package:fasalpramaan/services/sync_service.dart';

late final SyncService backgroundSync;

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  AppConfig.assertSafeRuntime();
  backgroundSync = SyncService(ApiClient(), OfflineDb())..startAutoSync();
  runApp(const ProviderScope(child: FasalPramaanApp()));
}
