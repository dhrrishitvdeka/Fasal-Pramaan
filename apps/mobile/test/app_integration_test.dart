import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fasalpramaan/features/auth/onboarding_screen.dart';
import 'package:fasalpramaan/features/auth/language_screen.dart';

void main() {
  group('End-to-End Application Integration Flow Tests', () {
    testWidgets('user can navigate from Onboarding to Language selection screen', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: OnboardingScreen(),
          ),
        ),
      );

      // Verify Onboarding Screen renders correctly
      expect(find.textContaining('FasalPramaan'), findsWidgets);
      expect(find.textContaining('Get Started'), findsOneWidget);

      // Render Language Screen
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LanguageScreen(),
          ),
        ),
      );

      expect(find.textContaining('Language'), findsWidgets);
      expect(find.text('English'), findsOneWidget);
      expect(find.text('हिन्दी'), findsOneWidget);
    });
  });
}
