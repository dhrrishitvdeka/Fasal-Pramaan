import 'package:fasalpramaan/features/auth/startup_choice_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('voice-first choice is persisted before entering the app',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final router = GoRouter(
      initialLocation: '/start',
      routes: [
        GoRoute(
          path: '/start',
          builder: (_, __) => const StartupChoiceScreen(destination: '/home'),
        ),
        GoRoute(
          path: '/home',
          builder: (_, __) => const Scaffold(body: Text('Farmer home')),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    expect(find.text('Talk to Fasal Saathi'), findsOneWidget);
    expect(find.text('Use touch controls'), findsOneWidget);

    await tester.tap(find.text('Talk to Fasal Saathi'));
    await tester.pumpAndSettle();

    expect(find.text('Farmer home'), findsOneWidget);
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getBool('voice_first_enabled'), isTrue);
  });
}
