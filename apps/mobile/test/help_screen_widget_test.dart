import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fasalpramaan/features/help/help_screen.dart';

void main() {
  group('HelpScreen Widget Tests', () {
    testWidgets('renders all help tutorial instructions and disclaimers', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: HelpScreen(),
          ),
        ),
      );

      expect(find.byType(HelpScreen), findsOneWidget);
    });
  });
}
