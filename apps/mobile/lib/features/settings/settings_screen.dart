import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:fasalpramaan/core/l10n.dart';
import 'package:fasalpramaan/core/config.dart';
import 'package:fasalpramaan/services/api_client.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(ref);
    final isHindi = s.isHi;

    return Scaffold(
      appBar: AppBar(title: Text(s.settings)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            s.appPreferences,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 10),
          Card(
            child: Column(
              children: [
                SwitchListTile(
                  secondary: const Icon(Icons.language_rounded,
                      color: Color(0xFF059669)),
                  title: Text(
                    s.hindiLanguage,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    isHindi ? 'हिन्दी भाषा मोड सक्रिय' : 'English language mode active',
                    style: const TextStyle(fontSize: 12),
                  ),
                  value: isHindi,
                  activeColor: const Color(0xFF059669),
                  onChanged: (v) {
                    ref
                        .read(localeProvider.notifier)
                        .setLocale(Locale(v ? 'hi' : 'en'));
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          Text(
            s.isHi ? 'सिस्टम और नेटवर्क' : 'System & Network Endpoint',
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 10),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.dns_rounded,
                      color: Color(0xFF2563EB)),
                  title: Text(s.targetApiBase,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: const Text(
                    AppConfig.apiBaseUrl,
                    style: TextStyle(
                        fontFamily: 'monospace',
                        color: Color(0xFF059669),
                        fontWeight: FontWeight.bold),
                  ),
                ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.shield_outlined,
                      color: Color(0xFFD97706)),
                  title: Text(s.systemSecurity,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: const Text(
                    'AES-256-GCM field encryption active',
                    style: TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Account Logout Section
          Card(
            child: ListTile(
              leading: const Icon(Icons.logout_rounded, color: Colors.redAccent),
              title: Text(
                s.logout,
                style: const TextStyle(
                  color: Colors.redAccent,
                  fontWeight: FontWeight.bold,
                ),
              ),
              subtitle: Text(s.isHi
                  ? 'सत्र टोकन रद्द करें और साइन इन पर लौटें'
                  : 'Revoke JWT session token & return to login'),
              onTap: () async {
                await ApiClient().logout();
                if (context.mounted) context.go('/login');
              },
            ),
          ),

          const SizedBox(height: 32),
          Center(
            child: Column(
              children: [
                const Text(
                  'FasalPramaan AI v0.1.0 (SVH26007)',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF94A3B8),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  s.tagline,
                  style: const TextStyle(fontSize: 11, color: Color(0xFFCBD5E1)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
