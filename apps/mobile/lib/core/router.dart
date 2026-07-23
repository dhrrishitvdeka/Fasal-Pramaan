import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:fasalpramaan/features/auth/login_screen.dart';
import 'package:fasalpramaan/features/auth/register_screen.dart';
import 'package:fasalpramaan/features/auth/language_screen.dart';
import 'package:fasalpramaan/features/auth/onboarding_screen.dart';
import 'package:fasalpramaan/features/auth/splash_screen.dart';
import 'package:fasalpramaan/features/home/farmer_home_screen.dart';
import 'package:fasalpramaan/features/home/officer_home_screen.dart';
import 'package:fasalpramaan/features/farms/farms_screen.dart';
import 'package:fasalpramaan/features/capture/guided_capture_screen.dart';
import 'package:fasalpramaan/features/offline/queue_screen.dart';
import 'package:fasalpramaan/features/results/results_screen.dart';
import 'package:fasalpramaan/features/notifications/notifications_screen.dart';
import 'package:fasalpramaan/features/settings/settings_screen.dart';
import 'package:fasalpramaan/features/help/help_screen.dart';
import 'package:fasalpramaan/features/profile/profile_screen.dart';
import 'package:fasalpramaan/services/api_client.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) async {
      const publicRoutes = {
        '/splash',
        '/onboarding',
        '/language',
        '/login',
        '/register',
        '/help'
      };
      if (!publicRoutes.contains(state.matchedLocation) &&
          !await ApiClient().hasSession()) {
        return '/login';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(
          path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
      GoRoute(path: '/language', builder: (_, __) => const LanguageScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
      GoRoute(path: '/home', builder: (_, __) => const FarmerHomeScreen()),
      GoRoute(path: '/officer', builder: (_, __) => const OfficerHomeScreen()),
      GoRoute(path: '/farms', builder: (_, __) => const FarmsScreen()),
      GoRoute(
        path: '/capture',
        builder: (_, state) => GuidedCaptureScreen(
          recaptureSubmissionId: state.uri.queryParameters['submission_id'],
          initialCycleId: state.uri.queryParameters['crop_cycle_id'],
        ),
      ),
      GoRoute(path: '/queue', builder: (_, __) => const QueueScreen()),
      GoRoute(path: '/results', builder: (_, __) => const ResultsScreen()),
      GoRoute(
          path: '/notifications',
          builder: (_, __) => const NotificationsScreen()),
      GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
      GoRoute(path: '/help', builder: (_, __) => const HelpScreen()),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
    ],
  );
});
