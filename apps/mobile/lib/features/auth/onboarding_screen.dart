import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:fasalpramaan/core/widgets/fade_slide_transition.dart';

class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: FadeSlideTransition(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Spacer(),
                // Hero Icon Badge with Gradient Container
                Center(
                  child: Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF064E3B), Color(0xFF059669)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF059669).withOpacity(0.35),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.eco_rounded,
                      size: 52,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // App Title & Tagline
                const Text(
                  'FasalPramaan AI',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF064E3B),
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Digital Evidence for Every Crop',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'हर फसल का डिजिटल प्रमाण',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF059669),
                  ),
                ),
                const SizedBox(height: 20),

                // Feature Cards List with English & Hindi
                _buildBilingualFeatureRow(
                  icon: Icons.center_focus_strong_rounded,
                  titleEn: 'Guided Multi-Angle Capture',
                  titleHi: 'मार्गदर्शित फोटो कैप्चर',
                  descEn: 'GPS-verified crop photos with automatic blur checks.',
                  descHi: 'GPS-सत्यापित फसल फोटो और स्वचालित स्पष्टता जांच।',
                ),
                const SizedBox(height: 10),
                _buildBilingualFeatureRow(
                  icon: Icons.wifi_off_rounded,
                  titleEn: 'Offline Encrypted Sync',
                  titleHi: 'ऑफ़लाइन सुरक्षित सिंक',
                  descEn: 'Capture photos anywhere offline; sync securely online.',
                  descHi: 'बिना इंटरनेट फोटो खींचें, ऑनलाइन होने पर सुरक्षित सिंक करें।',
                ),
                const SizedBox(height: 10),
                _buildBilingualFeatureRow(
                  icon: Icons.verified_user_outlined,
                  titleEn: 'Transparent Assessment',
                  titleHi: 'पारदर्शी निष्पक्ष मूल्यांकन',
                  descEn: 'Assistive AI combined with human reviewer validation.',
                  descHi: 'सहायक AI जांच और अधिकारी द्वारा सत्यापित निर्णय।',
                ),

                const Spacer(),

                ElevatedButton(
                  onPressed: () => context.go('/language'),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Get Started / शुरू करें'),
                      SizedBox(width: 8),
                      Icon(Icons.arrow_forward_rounded, size: 20),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBilingualFeatureRow({
    required IconData icon,
    required String titleEn,
    required String titleHi,
    required String descEn,
    required String descHi,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFECFDF5),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: const Color(0xFF064E3B), size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$titleEn · $titleHi',
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  descEn,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: Color(0xFF475569),
                  ),
                ),
                Text(
                  descHi,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF059669),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
