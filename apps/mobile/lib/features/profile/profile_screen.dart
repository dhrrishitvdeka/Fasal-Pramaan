import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:fasalpramaan/core/l10n.dart';
import 'package:fasalpramaan/services/api_client.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});
  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  Map<String, dynamic>? me;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      me = await ApiClient().me();
    } catch (_) {}
    if (mounted) setState(() => loading = false);
  }

  Future<void> _logout() async {
    try {
      await ApiClient().logout();
    } catch (_) {}
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(ref);
    final isHi = s.isHi;

    return Scaffold(
      appBar: AppBar(title: Text(s.profile)),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : me == null
              ? _buildSignedOutState(isHi)
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    // Profile Avatar Card
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFF064E3B), Color(0xFF059669)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF059669).withOpacity(0.25),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.person_rounded,
                                size: 48, color: Color(0xFF064E3B)),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            me!['full_name'] ?? 'FasalPramaan User',
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            me!['email'] ?? '',
                            style: const TextStyle(
                              fontSize: 14,
                              color: Color(0xFFA7F3D0),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // User Info Details Card
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            _buildInfoRow(
                              icon: Icons.badge_outlined,
                              label: s.assignedRoles,
                              value: (me!['roles'] as List?)?.join(', ') ?? 'Farmer',
                            ),
                            const Divider(),
                            _buildInfoRow(
                              icon: Icons.language_outlined,
                              label: s.preferredLanguage,
                              value: isHi ? 'हिन्दी (Hindi)' : 'English (EN)',
                            ),
                            const Divider(),
                            _buildInfoRow(
                              icon: Icons.phone_outlined,
                              label: isHi ? 'फ़ोन संपर्क' : 'Phone Contact',
                              value: me!['phone'] ?? (isHi ? 'उपलब्ध नहीं' : 'Not provided'),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Sign Out Button
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red.shade700,
                      ),
                      onPressed: _logout,
                      icon: const Icon(Icons.logout_rounded, size: 20, color: Colors.white),
                      label: Text(s.signOut, style: const TextStyle(color: Colors.white)),
                    ),
                  ],
                ),
    );
  }

  Widget _buildInfoRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF059669), size: 22),
          const SizedBox(width: 14),
          Text(
            label,
            style: const TextStyle(
              fontSize: 14,
              color: Color(0xFF64748B),
              fontWeight: FontWeight.w500,
            ),
          ),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSignedOutState(bool isHi) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.account_circle_outlined,
                size: 64, color: Color(0xFF64748B)),
            const SizedBox(height: 16),
            Text(
              isHi ? 'साइन इन नहीं हैं' : 'Not Signed In',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => context.go('/login'),
              child: Text(isHi ? 'साइन इन पर जाएं' : 'Go to Login'),
            ),
          ],
        ),
      ),
    );
  }
}
