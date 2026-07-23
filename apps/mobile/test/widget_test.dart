import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fasalpramaan/features/auth/onboarding_screen.dart';

void main() {
  testWidgets('FasalPramaan app smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: OnboardingScreen(),
        ),
      ),
    );
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
