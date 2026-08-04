import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Lets a farmer choose the interaction mode before entering the app.
/// The choice is refreshed on every app launch and never blocks touch controls.
class StartupChoiceScreen extends StatefulWidget {
  const StartupChoiceScreen({super.key, required this.destination});

  final String destination;

  @override
  State<StartupChoiceScreen> createState() => _StartupChoiceScreenState();
}

class _StartupChoiceScreenState extends State<StartupChoiceScreen> {
  bool _saving = false;

  Future<void> _continue({required bool voiceFirst}) async {
    if (_saving) return;
    setState(() => _saving = true);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool('voice_first_enabled', voiceFirst);
    const allowedDestinations = {'/home', '/onboarding'};
    final destination = allowedDestinations.contains(widget.destination)
        ? widget.destination
        : '/onboarding';
    if (mounted) context.go(destination);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF022C22), Color(0xFF047857)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Column(
                  children: [
                    const CircleAvatar(
                      radius: 42,
                      backgroundColor: Colors.white,
                      child: Icon(
                        Icons.record_voice_over_rounded,
                        size: 44,
                        color: Color(0xFF047857),
                      ),
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      'How would you like to use FasalPramaan?',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 27,
                        height: 1.15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'आप बोलकर ऐप चला सकते हैं — स्क्रीन पर हर कार्रवाई दिखाई देगी।',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFFA7F3D0), fontSize: 15),
                    ),
                    const SizedBox(height: 30),
                    _ChoiceCard(
                      icon: Icons.mic_rounded,
                      title: 'Talk to Fasal Saathi',
                      subtitle:
                          'Voice-first mode. Open pages, fill records, capture photos, and upload with spoken confirmations.',
                      badge: 'RECOMMENDED',
                      enabled: !_saving,
                      onTap: () => _continue(voiceFirst: true),
                    ),
                    const SizedBox(height: 14),
                    _ChoiceCard(
                      icon: Icons.touch_app_rounded,
                      title: 'Use touch controls',
                      subtitle:
                          'Use the normal app. The voice button remains available whenever you need it.',
                      enabled: !_saving,
                      onTap: () => _continue(voiceFirst: false),
                    ),
                    if (_saving) ...[
                      const SizedBox(height: 22),
                      const CircularProgressIndicator(color: Colors.white),
                    ],
                    const SizedBox(height: 22),
                    const Text(
                      'Sensitive actions always require a separate spoken confirmation.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFFD1FAE5), fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ChoiceCard extends StatelessWidget {
  const _ChoiceCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.enabled,
    required this.onTap,
    this.badge,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String? badge;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(13),
                decoration: BoxDecoration(
                  color: const Color(0xFFD1FAE5),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(icon, size: 30, color: const Color(0xFF047857)),
              ),
              const SizedBox(width: 15),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (badge != null)
                      Text(
                        badge!,
                        style: const TextStyle(
                          color: Color(0xFFD97706),
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          letterSpacing: .6,
                        ),
                      ),
                    Text(
                      title,
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(
                          fontSize: 12.5, color: Color(0xFF475569)),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward_rounded, color: Color(0xFF047857)),
            ],
          ),
        ),
      ),
    );
  }
}
