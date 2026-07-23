import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fasalpramaan/features/auth/login_screen.dart';

void main() {
  group('LoginScreen Widget Tests', () {
    testWidgets('renders login form, fields, and submit buttons', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      // Verify Header and Form Labels
      expect(find.text('FasalPramaan'), findsOneWidget);
      expect(find.text('Sign In / साइन इन करें'), findsOneWidget);
      expect(find.text('Email / ईमेल'), findsOneWidget);
      expect(find.text('Password / पासवर्ड'), findsOneWidget);

      // Verify Action Buttons
      expect(find.widgetWithText(ElevatedButton, 'Sign In / प्रवेश करें'), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Create Account'), findsOneWidget);
    });

    testWidgets('allows typing into email and password fields', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );

      final emailFinder = find.byType(TextField).at(0);
      final passwordFinder = find.byType(TextField).at(1);

      await tester.enterText(emailFinder, 'test@fasalpramaan.local');
      await tester.enterText(passwordFinder, 'TestPassword123');

      expect(find.text('test@fasalpramaan.local'), findsOneWidget);
      expect(find.text('TestPassword123'), findsOneWidget);
    });
  });
}
