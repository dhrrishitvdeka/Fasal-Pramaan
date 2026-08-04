import 'dart:async';
import 'dart:ui';

import 'package:fasalpramaan/core/config.dart';
import 'package:fasalpramaan/core/l10n.dart';
import 'package:fasalpramaan/features/voice/voice_action_broker.dart';
import 'package:fasalpramaan/features/voice/voice_assistant_controller.dart';
import 'package:fasalpramaan/services/api_client.dart';
import 'package:fasalpramaan/services/offline_db.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

class VoiceAssistantOverlay extends ConsumerStatefulWidget {
  const VoiceAssistantOverlay({
    super.key,
    required this.router,
    required this.child,
  });

  final GoRouter router;
  final Widget child;

  @override
  ConsumerState<VoiceAssistantOverlay> createState() =>
      _VoiceAssistantOverlayState();
}

class _VoiceAssistantOverlayState extends ConsumerState<VoiceAssistantOverlay>
    with TickerProviderStateMixin {
  late final ApiClient _api;
  late final VoiceAssistantController _controller;
  late final AnimationController _panelController;
  late final AnimationController _fabPulseController;
  late final Animation<double> _panelScale;
  late final Animation<double> _panelFade;
  late final Animation<Offset> _panelSlide;
  late final Animation<double> _fabScale;

  bool _expanded = false;
  bool _visible = false;
  bool _autoStartAttempted = false;

  static const _publicRoutes = {
    '/splash',
    '/start',
    '/onboarding',
    '/language',
    '/login',
    '/register',
    '/officer',
  };

  @override
  void initState() {
    super.initState();
    _api = ApiClient();
    final db = OfflineDb();
    _controller = VoiceAssistantController(
      api: _api,
      broker: VoiceActionBroker(
        gateway: DefaultVoiceActionGateway(api: _api, db: db),
        navigate: widget.router.go,
        changeLanguage: (code) =>
            ref.read(localeProvider.notifier).setLocale(Locale(code)),
      ),
    );
    _controller.addListener(_onControllerTick);

    _panelController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 320),
      reverseDuration: const Duration(milliseconds: 240),
    );
    _panelScale = CurvedAnimation(
      parent: _panelController,
      curve: Curves.easeOutBack,
      reverseCurve: Curves.easeInCubic,
    );
    _panelFade = CurvedAnimation(
      parent: _panelController,
      curve: const Interval(0, 0.7, curve: Curves.easeOut),
      reverseCurve: Curves.easeIn,
    );
    _panelSlide = Tween<Offset>(
      begin: const Offset(0.08, 0.18),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _panelController,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      ),
    );

    _fabPulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _fabScale = Tween<double>(begin: 1, end: 1.08).animate(
      CurvedAnimation(parent: _fabPulseController, curve: Curves.easeInOut),
    );

    widget.router.routerDelegate.addListener(_onRouteChanged);
    unawaited(_refreshVisibility());
  }

  void _onControllerTick() {
    final listening = _controller.state == VoiceAssistantState.listening ||
        _controller.state == VoiceAssistantState.waitingForConfirmation;
    if (listening && !_fabPulseController.isAnimating) {
      unawaited(_fabPulseController.repeat(reverse: true));
    } else if (!listening && _fabPulseController.isAnimating) {
      _fabPulseController
        ..stop()
        ..value = 0;
    }
    if (mounted) setState(() {});
  }

  void _onRouteChanged() => unawaited(_refreshVisibility());

  Future<void> _refreshVisibility() async {
    final path = widget.router.routerDelegate.currentConfiguration.uri.path;
    var isFarmer = false;
    if (AppConfig.voiceAssistantEnabled && !_publicRoutes.contains(path)) {
      try {
        final me = await _api.ensureSession();
        final roles = (me?['roles'] as List?)?.map((role) => '$role').toSet() ??
            const <String>{};
        isFarmer = roles.contains('farmer');
      } catch (_) {
        isFarmer = false;
      }
    }
    final visible = isFarmer;
    if (!visible && _controller.isActive) await _controller.stop();
    if (!visible && _expanded) {
      _expanded = false;
      _panelController.value = 0;
    }
    if (mounted && _visible != visible) setState(() => _visible = visible);
    if (visible && !_autoStartAttempted) {
      _autoStartAttempted = true;
      final preferences = await SharedPreferences.getInstance();
      if (preferences.getBool('voice_first_enabled') == true && mounted) {
        await _openPanel(start: true);
      }
    }
  }

  Future<void> _openPanel({bool start = false}) async {
    if (!_expanded) {
      setState(() => _expanded = true);
      await _panelController.forward();
    }
    if (start && !_controller.isActive) {
      await _controller.start();
    }
  }

  Future<void> _closePanel() async {
    await _panelController.reverse();
    if (mounted) setState(() => _expanded = false);
  }

  Future<void> _toggleFab() async {
    if (_expanded) {
      await _closePanel();
      return;
    }
    await _openPanel(start: !_controller.isActive);
  }

  @override
  void dispose() {
    widget.router.routerDelegate.removeListener(_onRouteChanged);
    _controller.removeListener(_onControllerTick);
    _panelController.dispose();
    _fabPulseController.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        if (_visible)
          AnimatedBuilder(
            animation: Listenable.merge([_controller, _panelController, _fabPulseController]),
            builder: (context, _) => _buildLayer(context),
          ),
      ],
    );
  }

  Widget _buildLayer(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom + 16;
    final width = MediaQuery.sizeOf(context).width;
    final panelWidth = width < 420 ? width - 24 : 360.0;

    return Stack(
      children: [
        if (_expanded || _panelController.isAnimating)
          Positioned(
            left: width < 420 ? 12 : null,
            right: 12,
            bottom: bottom + 72,
            child: FadeTransition(
              opacity: _panelFade,
              child: SlideTransition(
                position: _panelSlide,
                child: ScaleTransition(
                  scale: Tween<double>(begin: 0.92, end: 1).animate(_panelScale),
                  alignment: Alignment.bottomRight,
                  child: _AssistantPanel(
                    width: panelWidth,
                    controller: _controller,
                    onMinimize: () => unawaited(_closePanel()),
                    onPrimary: () async {
                      if (_controller.isActive) {
                        await _controller.stop();
                      } else {
                        await _controller.start();
                      }
                    },
                  ),
                ),
              ),
            ),
          ),
        Positioned(
          right: 16,
          bottom: bottom,
          child: ScaleTransition(
            scale: _controller.state == VoiceAssistantState.listening ||
                    _controller.state == VoiceAssistantState.waitingForConfirmation
                ? _fabScale
                : const AlwaysStoppedAnimation(1),
            child: _VoiceFab(
              controller: _controller,
              expanded: _expanded,
              onPressed: () => unawaited(_toggleFab()),
            ),
          ),
        ),
      ],
    );
  }
}

class _AssistantPanel extends StatelessWidget {
  const _AssistantPanel({
    required this.width,
    required this.controller,
    required this.onMinimize,
    required this.onPrimary,
  });

  final double width;
  final VoiceAssistantController controller;
  final VoidCallback onMinimize;
  final Future<void> Function() onPrimary;

  static const _emerald = Color(0xFF064E3B);
  static const _mint = Color(0xFF059669);
  static const _slate = Color(0xFF64748B);
  static const _ink = Color(0xFF0F172A);

  @override
  Widget build(BuildContext context) {
    final isError = controller.state == VoiceAssistantState.error;
    final isLive = controller.isActive && !isError;

    return Material(
      color: Colors.transparent,
      elevation: 0,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
          child: Container(
            width: width,
            constraints: const BoxConstraints(maxHeight: 420),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.96),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: const Color(0xFFE2E8F0)),
              boxShadow: [
                BoxShadow(
                  color: _emerald.withValues(alpha: 0.14),
                  blurRadius: 28,
                  offset: const Offset(0, 14),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Header
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 14, 8, 12),
                  decoration: const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: Color(0xFFF1F5F9)),
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [_emerald, _mint],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.record_voice_over_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Fasal Saathi',
                              style: TextStyle(
                                color: _ink,
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.2,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Row(
                              children: [
                                Container(
                                  width: 7,
                                  height: 7,
                                  decoration: BoxDecoration(
                                    color: isError
                                        ? const Color(0xFFDC2626)
                                        : isLive
                                            ? _mint
                                            : const Color(0xFF94A3B8),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  isError
                                      ? 'Needs attention'
                                      : isLive
                                          ? 'Listening'
                                          : 'Ready',
                                  style: TextStyle(
                                    color: isError
                                        ? const Color(0xFFB91C1C)
                                        : _slate,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Close',
                        visualDensity: VisualDensity.compact,
                        onPressed: onMinimize,
                        icon: const Icon(
                          Icons.close_rounded,
                          color: _slate,
                          size: 22,
                        ),
                      ),
                    ],
                  ),
                ),

                // Body
                Flexible(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          controller.statusMessage,
                          style: TextStyle(
                            color: isError
                                ? const Color(0xFFB91C1C)
                                : const Color(0xFF334155),
                            fontSize: 13.5,
                            height: 1.35,
                          ),
                        ),
                        if (controller.farmerTranscript.isNotEmpty)
                          _TranscriptBubble(
                            label: 'You',
                            text: controller.farmerTranscript,
                            alignEnd: true,
                            color: const Color(0xFFEFF6FF),
                            accent: const Color(0xFF2563EB),
                          ),
                        if (controller.assistantTranscript.isNotEmpty)
                          _TranscriptBubble(
                            label: 'Fasal Saathi',
                            text: controller.assistantTranscript,
                            alignEnd: false,
                            color: const Color(0xFFECFDF5),
                            accent: _mint,
                          ),
                        if (controller.needsConfirmation)
                          Container(
                            margin: const EdgeInsets.only(top: 10),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFFBEB),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: const Color(0xFFFCD34D),
                              ),
                            ),
                            child: const Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(
                                  Icons.priority_high_rounded,
                                  size: 18,
                                  color: Color(0xFFD97706),
                                ),
                                SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'Say a clear “yes” to continue, or “no” to cancel.',
                                    style: TextStyle(
                                      color: Color(0xFF92400E),
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w600,
                                      height: 1.35,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        if (controller.actionActivities.isNotEmpty) ...[
                          const SizedBox(height: 14),
                          const Text(
                            'Activity',
                            style: TextStyle(
                              color: _slate,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.3,
                            ),
                          ),
                          const SizedBox(height: 8),
                          for (final activity
                              in controller.actionActivities.take(4))
                            _ActionActivityRow(activity: activity),
                        ],
                      ],
                    ),
                  ),
                ),

                // Footer actions
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
                  child: Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: controller.isBusy
                              ? null
                              : () => unawaited(onPrimary()),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: _emerald,
                            side: const BorderSide(color: Color(0xFFD1D5DB)),
                            minimumSize: const Size(0, 44),
                            padding: const EdgeInsets.symmetric(horizontal: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: Text(
                            controller.isActive ? 'End session' : 'Start',
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 13.5,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          onPressed: controller.isBusy
                              ? null
                              : () => unawaited(
                                    controller.isActive
                                        ? controller.stop()
                                        : controller.start(),
                                  ),
                          style: FilledButton.styleFrom(
                            backgroundColor: isError ? const Color(0xFFB91C1C) : _emerald,
                            foregroundColor: Colors.white,
                            minimumSize: const Size(0, 44),
                            padding: const EdgeInsets.symmetric(horizontal: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: Text(
                            controller.isActive
                                ? 'Mute & stop'
                                : isError
                                    ? 'Try again'
                                    : 'Talk',
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 13.5,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _VoiceFab extends StatelessWidget {
  const _VoiceFab({
    required this.controller,
    required this.expanded,
    required this.onPressed,
  });

  final VoiceAssistantController controller;
  final bool expanded;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final error = controller.state == VoiceAssistantState.error;
    final listening = controller.state == VoiceAssistantState.listening ||
        controller.state == VoiceAssistantState.waitingForConfirmation;
    final color = error
        ? const Color(0xFFB91C1C)
        : listening
            ? const Color(0xFF059669)
            : const Color(0xFF064E3B);

    return Semantics(
      button: true,
      label: expanded ? 'Close voice assistant' : 'Open Fasal Saathi',
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        width: 60,
        height: 60,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: listening ? 0.45 : 0.28),
              blurRadius: listening ? 18 : 12,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Material(
          color: color,
          shape: const CircleBorder(),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: controller.isBusy ? null : onPressed,
            child: Center(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                switchInCurve: Curves.easeOutBack,
                switchOutCurve: Curves.easeIn,
                transitionBuilder: (child, animation) {
                  return ScaleTransition(
                    scale: animation,
                    child: FadeTransition(opacity: animation, child: child),
                  );
                },
                child: controller.isBusy
                    ? const SizedBox(
                        key: ValueKey('busy'),
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          color: Colors.white,
                        ),
                      )
                    : Icon(
                        expanded
                            ? Icons.close_rounded
                            : controller.isActive
                                ? Icons.graphic_eq_rounded
                                : Icons.mic_rounded,
                        key: ValueKey(
                          expanded
                              ? 'close'
                              : controller.isActive
                                  ? 'live'
                                  : 'mic',
                        ),
                        color: Colors.white,
                        size: 28,
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionActivityRow extends StatelessWidget {
  const _ActionActivityRow({required this.activity});

  final VoiceActionActivity activity;

  @override
  Widget build(BuildContext context) {
    final outcome = activity.outcome;
    final color = switch (outcome) {
      null => const Color(0xFF2563EB),
      VoiceActionOutcome.succeeded => const Color(0xFF059669),
      VoiceActionOutcome.confirmationRequired => const Color(0xFFD97706),
      VoiceActionOutcome.cancelled => const Color(0xFF64748B),
      VoiceActionOutcome.failed => const Color(0xFFB91C1C),
    };
    final icon = switch (outcome) {
      null => Icons.sync_rounded,
      VoiceActionOutcome.succeeded => Icons.check_circle_rounded,
      VoiceActionOutcome.confirmationRequired => Icons.lock_clock_rounded,
      VoiceActionOutcome.cancelled => Icons.cancel_rounded,
      VoiceActionOutcome.failed => Icons.error_rounded,
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          activity.running
              ? SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: color),
                )
              : Icon(icon, color: color, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              activity.message,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                color: Color(0xFF334155),
                height: 1.3,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TranscriptBubble extends StatelessWidget {
  const _TranscriptBubble({
    required this.label,
    required this.text,
    required this.color,
    required this.accent,
    required this.alignEnd,
  });

  final String label;
  final String text;
  final Color color;
  final Color accent;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: alignEnd ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        constraints: const BoxConstraints(maxWidth: 300),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(alignEnd ? 14 : 4),
            bottomRight: Radius.circular(alignEnd ? 4 : 14),
          ),
        ),
        child: Column(
          crossAxisAlignment:
              alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                color: accent,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              text,
              style: const TextStyle(
                color: Color(0xFF0F172A),
                fontSize: 13.5,
                height: 1.35,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
