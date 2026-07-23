import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fasalpramaan/core/l10n.dart';

class HelpScreen extends ConsumerWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(ref);
    final isHi = s.isHi;

    return Scaffold(
      appBar: AppBar(title: Text(isHi ? 'सहायता और कैप्चर ट्यूटोरियल' : 'Help & Capture Tutorial')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF064E3B), Color(0xFF059669)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.center_focus_strong_rounded,
                        color: Colors.white, size: 28),
                    const SizedBox(width: 12),
                    Text(
                      isHi ? 'साक्ष्य कैप्चर गाइड' : 'Evidence Capture Guide',
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  isHi
                      ? 'वैध मूल्यांकन साक्ष्य सुनिश्चित करने के लिए इन 3 कोणों का पालन करें।'
                      : 'Follow these three guided angles to ensure valid assessment evidence.',
                  style: const TextStyle(fontSize: 13, color: Color(0xFFA7F3D0)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          Text(
            isHi ? 'आवश्यक कोण चेकलिस्ट (Required Angles)' : 'Required Angle Checklist',
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 12),

          _buildAngleCard(
            stepNumber: '1',
            titleEn: 'Wide Field View',
            titleHi: 'खेत का समग्र दृश्य',
            descEn: 'Stand at the plot boundary edge. Capture a broad panoramic view showing the overall crop field.',
            descHi: 'खेत के किनारे खड़े होकर पूरी फसल क्षेत्र का व्यापक दृश्य लें।',
            icon: Icons.landscape_rounded,
            isHi: isHi,
          ),
          const SizedBox(height: 12),
          _buildAngleCard(
            stepNumber: '2',
            titleEn: 'Mid Canopy View',
            titleHi: 'फसल कैनोपी दृश्य',
            descEn: 'Step closer into the plot. Capture the crop canopy so leaves, stems, and plant stand are clearly visible.',
            descHi: 'मध्यम दूरी से पत्तियों और फसल कैनोपी की स्पष्ट फोटो लें।',
            icon: Icons.grass_rounded,
            isHi: isHi,
          ),
          const SizedBox(height: 12),
          _buildAngleCard(
            stepNumber: '3',
            titleEn: 'Close-Up Damage View',
            titleHi: 'क्षतिग्रस्त हिस्सा',
            descEn: 'Move close to affected or damaged plants. Fill the camera frame with leaf disease or pest damage details.',
            descHi: 'प्रभावित या क्षतिग्रस्त फसल के करीब जाकर स्पष्ट चित्र लें।',
            icon: Icons.zoom_in_rounded,
            isHi: isHi,
          ),

          const SizedBox(height: 24),
          Text(
            isHi ? 'जरूरी सुझाव (Best Practice Tips)' : 'Best Practice Tips',
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 12),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  _buildTipItem(
                    Icons.stay_current_portrait_rounded,
                    isHi
                        ? 'पोर्ट्रेट मोड में फोन स्थिर रखें (Hold steady in portrait mode).'
                        : 'Hold your phone steady in portrait mode.',
                  ),
                  const Divider(height: 20),
                  _buildTipItem(
                    Icons.gps_fixed_rounded,
                    isHi
                        ? 'GPS सटीकता 50 मीटर से कम रखें (GPS accuracy under 50m).'
                        : 'Ensure GPS accuracy is under 50 meters.',
                  ),
                  const Divider(height: 20),
                  _buildTipItem(
                    Icons.wifi_off_rounded,
                    isHi
                        ? 'ऑफ़लाइन खींचें? ड्राफ्ट सुरक्षित रहेंगे और नेटवर्क मिलने पर सिंक होंगे।'
                        : 'Captured offline? Drafts save safely and sync when signal returns.',
                  ),
                  const Divider(height: 20),
                  _buildTipItem(
                    Icons.no_photography_outlined,
                    isHi
                        ? 'गैलरी की पुरानी फोटो या स्क्रीनशॉट का उपयोग न करें।'
                        : 'Do not take screenshots or upload old gallery photos.',
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFF59E0B)),
            ),
            child: Row(
              children: [
                const Icon(Icons.info_outline_rounded,
                    color: Color(0xFFD97706), size: 24),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    isHi
                        ? 'AI जांच सहायक है। अंतिम मूल्यांकन का सत्यापन हमेशा कमांड सेंटर के अधिकारी द्वारा किया जाता है।'
                        : 'AI check is assistive and non-production. Final assessment is always validated by a human reviewer in the Command Centre.',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF92400E),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAngleCard({
    required String stepNumber,
    required String titleEn,
    required String titleHi,
    required String descEn,
    required String descHi,
    required IconData icon,
    required bool isHi,
  }) {
    return Container(
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
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFFECFDF5),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              isHi ? 'चरण $stepNumber' : 'Step $stepNumber',
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                color: Color(0xFF064E3B),
                fontSize: 13,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(icon, size: 20, color: const Color(0xFF059669)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        isHi ? '$titleHi ($titleEn)' : titleEn,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  isHi ? descHi : descEn,
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF475569),
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTipItem(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, color: const Color(0xFF059669), size: 22),
        const SizedBox(width: 14),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 13.5,
              color: Color(0xFF334155),
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
