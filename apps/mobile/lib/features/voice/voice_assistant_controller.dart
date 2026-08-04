import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:fasalpramaan/features/voice/gemini_live_transport.dart';
import 'package:fasalpramaan/features/voice/voice_action_broker.dart';
import 'package:fasalpramaan/services/api_client.dart';
import 'package:flutter/foundation.dart';
import 'package:record/record.dart';

enum VoiceAssistantState {
  idle,
  connecting,
  listening,
  acting,
  speaking,
  waitingForConfirmation,
  error,
}

class VoiceActionActivity {
  const VoiceActionActivity({
    required this.callId,
    required this.action,
    required this.message,
    required this.startedAt,
    this.outcome,
  });

  final String callId;
  final String action;
  final String message;
  final DateTime startedAt;
  final VoiceActionOutcome? outcome;

  bool get running => outcome == null;
}

class VoiceAssistantController extends ChangeNotifier {
  VoiceAssistantController({
    required this.api,
    required this.broker,
  }) {
    _playerCompleteSubscription = _player.onPlayerComplete.listen((_) {
      if (_active) unawaited(_resumeListening());
    });
  }

  final ApiClient api;
  final VoiceActionBroker broker;
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();

  GeminiLiveTransport? _transport;
  GeminiLiveSessionConfig? _session;
  StreamSubscription<GeminiLiveEvent>? _eventSubscription;
  StreamSubscription<Uint8List>? _microphoneSubscription;
  StreamSubscription<void>? _playerCompleteSubscription;
  final BytesBuilder _responsePcm = BytesBuilder(copy: false);
  final List<VoiceActionActivity> _actionActivities = [];

  VoiceAssistantState state = VoiceAssistantState.idle;
  String statusMessage = 'Tap the microphone to talk.';
  String farmerTranscript = '';
  String assistantTranscript = '';
  int _userTurn = 0;
  String _lastInputTranscription = '';
  bool _active = false;
  bool _recording = false;
  bool _pausingForResponse = false;
  bool _disposed = false;
  bool _reconnecting = false;
  int _reconnectAttempts = 0;
  /// Browser AudioContext is often 48 kHz even when we request 16 kHz.
  int _inputSampleRateHz = 16000;
  int _audioChunksSent = 0;
  Timer? _resumeFallbackTimer;
  /// After the model finishes a turn, clear the assistant bubble when the user
  /// starts speaking again so replies do not concatenate forever.
  bool _clearAssistantOnNextUserSpeech = false;

  bool get isActive => _active;
  bool get isBusy => state == VoiceAssistantState.connecting;
  bool get needsConfirmation => broker.hasPendingConfirmation;
  List<VoiceActionActivity> get actionActivities =>
      List.unmodifiable(_actionActivities);

  Future<void> start() async {
    if (_active || state == VoiceAssistantState.connecting) return;
    _setState(
      VoiceAssistantState.connecting,
      'Connecting securely to the Gemini Live demo…',
    );
    try {
      _actionActivities.clear();
      final hasPermission = await _recorder.hasPermission();
      if (!hasPermission) {
        throw StateError(
          'Microphone permission was not granted. Allow the mic and try again.',
        );
      }
      _setState(
        VoiceAssistantState.connecting,
        'Checking your sign-in session…',
      );
      // Access JWTs expire (~30 min). Refresh or force re-login before voice.
      final me = await api.ensureSession();
      if (me == null) {
        throw StateError(
          'Session expired. Log in again as a farmer, then start Fasal Saathi.',
        );
      }
      final roles =
          (me['roles'] as List?)?.map((role) => '$role').toSet() ?? {};
      if (!roles.contains('farmer')) {
        throw StateError(
          'Fasal Saathi is available for farmer accounts only.',
        );
      }
      final bearer = await api.readAccessToken();
      if (bearer == null || bearer.isEmpty) {
        throw StateError(
          'Not signed in. Log in as a farmer, then start Fasal Saathi.',
        );
      }
      _setState(
        VoiceAssistantState.connecting,
        'Requesting a secure voice session…',
      );
      final session = GeminiLiveSessionConfig.fromJson(
        await api.createVoiceSession(),
        bearerAccessToken: bearer,
      );
      final transport = GeminiLiveTransport();
      _session = session;
      _transport = transport;
      _eventSubscription = transport.events.listen(
        (event) => unawaited(_handleEvent(event)),
      );
      final socketUri = session.buildSocketUri();
      _setState(
        VoiceAssistantState.connecting,
        'Opening secure voice channel via ${socketUri.host}…',
      );
      await transport.connect(session);
      _active = true;
      await _startMicrophone();
      _setState(
        VoiceAssistantState.listening,
        'Listening. You can speak in Hindi or English.',
      );
      // Small delay so the mic stream is flowing before the model greets.
      await Future<void>.delayed(const Duration(milliseconds: 250));
      if (!_active) return;
      transport.sendText(
        'Greet the farmer briefly in Hindi or English, introduce yourself as '
        'Fasal Saathi, then ask how you can help. Keep it short.',
      );
    } catch (error) {
      await _closeResources();
      _setState(VoiceAssistantState.error, _userFacingError(error));
    }
  }

  Future<void> stop() async {
    if (!_active && state == VoiceAssistantState.idle) return;
    await _closeResources();
    broker.clearPendingAction();
    _reconnectAttempts = 0;
    _reconnecting = false;
    farmerTranscript = '';
    assistantTranscript = '';
    _setState(VoiceAssistantState.idle, 'Voice session ended.');
  }

  Future<void> _startMicrophone() async {
    if (!_active || _recording) return;
    // Request 16 kHz; on web the AudioContext often forces 44.1/48 kHz.
    // We resample outbound PCM to 16 kHz before sending to Gemini.
    const requestedRate = 16000;
    final stream = await _recorder.startStream(
      const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: requestedRate,
        numChannels: 1,
        autoGain: true,
        echoCancel: true,
        noiseSuppress: true,
      ),
    );
    // Best-effort: many web paths ignore the requested rate.
    _inputSampleRateHz = kIsWeb ? 48000 : requestedRate;
    _recording = true;
    _audioChunksSent = 0;
    _microphoneSubscription = stream.listen(
      (chunk) {
        if (!_active || _pausingForResponse) return;
        final pcm16 = _resamplePcm16Mono(
          chunk,
          fromHz: _inputSampleRateHz,
          toHz: 16000,
        );
        if (pcm16.isEmpty) return;
        _transport?.sendAudio(pcm16);
        _audioChunksSent++;
        // Surface first successful mic hop once so demos aren't silent failures.
        if (_audioChunksSent == 8 &&
            state == VoiceAssistantState.listening &&
            farmerTranscript.isEmpty) {
          statusMessage = 'Listening… speak now (mic is live).';
          _notify();
        }
      },
      onError: (Object error) {
        _setState(
          VoiceAssistantState.error,
          'Microphone stream failed: ${_safeError(error)}',
        );
      },
    );
  }

  Future<void> _stopMicrophone() async {
    if (!_recording) return;
    _recording = false;
    await _microphoneSubscription?.cancel();
    _microphoneSubscription = null;
    try {
      await _recorder.stop();
    } catch (_) {
      // Web recorder may already be stopped.
    }
  }

  Future<void> _handleEvent(GeminiLiveEvent event) async {
    if (event is GeminiSetupComplete) {
      _reconnectAttempts = 0;
      return;
    }
    if (event is GeminiInputTranscription) {
      final piece = event.text.trimRight();
      if (piece.isEmpty) return;
      if (_clearAssistantOnNextUserSpeech) {
        assistantTranscript = '';
        farmerTranscript = '';
        _clearAssistantOnNextUserSpeech = false;
      }
      final merged = mergeStreamingTranscript(farmerTranscript, event.text);
      if (merged != farmerTranscript) {
        farmerTranscript = merged;
        if (merged != _lastInputTranscription) {
          _lastInputTranscription = merged;
          _userTurn++;
        }
        _notify();
      }
      return;
    }
    if (event is GeminiOutputTranscription) {
      // Live API streams partial tokens; each event is often only the newest
      // fragment ("हैं?"), not the full sentence — always merge, never replace.
      assistantTranscript =
          mergeStreamingTranscript(assistantTranscript, event.text);
      _notify();
      return;
    }
    if (event is GeminiAudioChunk) {
      _responsePcm.add(event.bytes);
      if (!_pausingForResponse) {
        _pausingForResponse = true;
        _setState(
            VoiceAssistantState.speaking, 'Preparing the spoken response…');
        await _stopMicrophone();
      }
      return;
    }
    if (event is GeminiToolCalls) {
      // Keep tools flowing even while a spoken turn is finishing.
      await _runToolCalls(event.calls);
      return;
    }
    if (event is GeminiInterrupted) {
      _resumeFallbackTimer?.cancel();
      _responsePcm.clear();
      await _player.stop();
      _pausingForResponse = false;
      await _resumeListening();
      return;
    }
    if (event is GeminiTurnComplete) {
      await _playResponse();
      return;
    }
    if (event is GeminiTransportError) {
      await _recoverTransport(event.message);
    }
  }

  Future<void> _recoverTransport(String message) async {
    if (!_active || _reconnecting || _reconnectAttempts >= 2) {
      _setState(VoiceAssistantState.error, message);
      return;
    }
    _reconnecting = true;
    _reconnectAttempts++;
    broker.clearPendingAction();
    await _closeResources();
    _setState(
      VoiceAssistantState.idle,
      'Connection interrupted. Reconnecting ($_reconnectAttempts/2)…',
    );
    await Future<void>.delayed(Duration(seconds: _reconnectAttempts));
    _reconnecting = false;
    if (!_disposed) await start();
  }

  Future<void> _runToolCalls(List<GeminiToolInvocation> calls) async {
    final session = _session;
    final transport = _transport;
    if (session == null || transport == null) return;
    final functionResponses = <Map<String, dynamic>>[];
    for (final call in calls) {
      _setState(VoiceAssistantState.acting, 'Working in the app: ${call.name}');
      _actionActivities.insert(
        0,
        VoiceActionActivity(
          callId: call.id,
          action: call.name,
          message: _actionLabel(call.name),
          startedAt: DateTime.now(),
        ),
      );
      if (_actionActivities.length > 8) _actionActivities.removeLast();
      _notify();
      final result = await broker.execute(
        call.name,
        call.arguments,
        userTurn: _userTurn,
      );
      final activityIndex = _actionActivities.indexWhere(
        (activity) => activity.callId == call.id,
      );
      if (activityIndex >= 0) {
        final current = _actionActivities[activityIndex];
        _actionActivities[activityIndex] = VoiceActionActivity(
          callId: current.callId,
          action: current.action,
          message: result.message,
          startedAt: current.startedAt,
          outcome: result.outcome,
        );
        _notify();
      }
      functionResponses.add({
        'id': call.id,
        'name': call.name,
        'response': {'result': result.toJson()},
      });
      try {
        await api.auditVoiceAction(
          sessionId: session.sessionId,
          action: call.name,
          outcome: result.outcome.apiValue,
          entityId: result.entityId,
        );
      } catch (_) {
        // The app action result is returned even if best-effort audit delivery
        // is temporarily unavailable; domain endpoints retain their own audit.
      }
      if (result.outcome == VoiceActionOutcome.confirmationRequired) {
        _setState(
          VoiceAssistantState.waitingForConfirmation,
          'Waiting for your clear yes or no.',
        );
      } else {
        statusMessage = result.message;
        _notify();
      }
    }
    transport.sendToolResponses(functionResponses);
  }

  Future<void> _playResponse() async {
    final pcm = _responsePcm.takeBytes();
    if (pcm.isEmpty) {
      _pausingForResponse = false;
      await _resumeListening();
      return;
    }
    final sampleRate = _session?.outputSampleRateHz ?? 24000;
    final wav = _pcm16MonoToWav(pcm, sampleRate: sampleRate);
    _setState(VoiceAssistantState.speaking, 'Speaking…');
    // audioplayers play() resolves when playback *starts*, not when it ends.
    // onPlayerComplete resumes the mic; a duration fallback covers web misses.
    final durationMs =
        ((pcm.length / 2) / sampleRate * 1000).ceil() + 400;
    _resumeFallbackTimer?.cancel();
    _resumeFallbackTimer = Timer(Duration(milliseconds: durationMs), () {
      if (_active && _pausingForResponse) {
        unawaited(_resumeListening());
      }
    });
    try {
      await _player.stop();
      await _player.play(BytesSource(wav));
    } catch (error) {
      // If playback fails, still reopen the mic so conversation can continue.
      _resumeFallbackTimer?.cancel();
      _pausingForResponse = false;
      await _resumeListening();
      statusMessage = 'Playback issue; still listening. ${_safeError(error)}';
      _notify();
    }
  }

  Future<void> _resumeListening() async {
    if (!_active) return;
    _resumeFallbackTimer?.cancel();
    _resumeFallbackTimer = null;
    _pausingForResponse = false;
    _clearAssistantOnNextUserSpeech = true;
    try {
      // Ensure prior recorder session is fully torn down on web before restart.
      if (_recording) await _stopMicrophone();
      await _startMicrophone();
      _setState(
        broker.hasPendingConfirmation
            ? VoiceAssistantState.waitingForConfirmation
            : VoiceAssistantState.listening,
        broker.hasPendingConfirmation
            ? 'Say yes to confirm, or no to cancel.'
            : 'Listening… speak now.',
      );
    } catch (error) {
      _setState(VoiceAssistantState.error, _safeError(error));
    }
  }

  Future<void> _closeResources() async {
    _active = false;
    _pausingForResponse = false;
    _resumeFallbackTimer?.cancel();
    _resumeFallbackTimer = null;
    _responsePcm.clear();
    _audioChunksSent = 0;
    await _stopMicrophone();
    await _player.stop();
    await _eventSubscription?.cancel();
    _eventSubscription = null;
    await _transport?.close();
    _transport = null;
    _session = null;
    _lastInputTranscription = '';
    _userTurn = 0;
  }

  /// Merge Live API streaming transcription fragments into full text.
  ///
  /// Gemini may send either cumulative text or tiny deltas (last word only).
  /// Replacing the bubble with [incoming] alone drops the rest of the reply.
  @visibleForTesting
  static String mergeStreamingTranscript(String previous, String incoming) {
    final next = incoming;
    if (next.isEmpty) return previous;
    if (previous.isEmpty) return next;

    // Cumulative stream: full text so far.
    if (next.startsWith(previous)) return next;
    // Duplicate / re-send of a trailing slice.
    if (previous.endsWith(next)) return previous;
    // Overlap repair: "...नमस्ते कि" + "किरसान" → "...नमस्ते किरसान"
    final maxOverlap = previous.length < next.length ? previous.length : next.length;
    for (var n = maxOverlap; n > 0; n--) {
      if (previous.endsWith(next.substring(0, n))) {
        return previous + next.substring(n);
      }
    }
    // Pure delta fragment.
    final needsSpace = !_endsWithSpaceOrJoin(previous) &&
        !_startsWithSpaceOrPunct(next) &&
        _isLatinBoundary(previous, next);
    return needsSpace ? '$previous $next' : previous + next;
  }

  static bool _endsWithSpaceOrJoin(String value) {
    if (value.isEmpty) return true;
    final c = value[value.length - 1];
    return c == ' ' || c == '\n' || c == '\t';
  }

  static bool _startsWithSpaceOrPunct(String value) {
    if (value.isEmpty) return true;
    final c = value[0];
    return c == ' ' ||
        c == '\n' ||
        c == '?' ||
        c == '!' ||
        c == ',' ||
        c == '.' ||
        c == '।' ||
        c == '؟';
  }

  /// Insert a space between Latin words; Devanagari usually joins without spaces
  /// when the model streams syllable fragments.
  static bool _isLatinBoundary(String previous, String next) {
    if (previous.isEmpty || next.isEmpty) return false;
    final a = previous.codeUnitAt(previous.length - 1);
    final b = next.codeUnitAt(0);
    bool latin(int u) =>
        (u >= 0x41 && u <= 0x5A) ||
        (u >= 0x61 && u <= 0x7A) ||
        (u >= 0x30 && u <= 0x39);
    return latin(a) && latin(b);
  }

  /// Downsample or upsample mono PCM16 for Gemini Live (expects ~16 kHz).
  static Uint8List _resamplePcm16Mono(
    Uint8List input, {
    required int fromHz,
    required int toHz,
  }) {
    if (input.isEmpty || fromHz <= 0 || toHz <= 0) return input;
    if (fromHz == toHz) return input;
    // Ensure even length (2 bytes per sample).
    final usable = input.length - (input.length % 2);
    if (usable < 2) return Uint8List(0);
    final inSamples = usable ~/ 2;
    final outSamples = (inSamples * toHz / fromHz).floor();
    if (outSamples <= 0) return Uint8List(0);
    final out = ByteData(outSamples * 2);
    final inView = ByteData.sublistView(input, 0, usable);
    for (var i = 0; i < outSamples; i++) {
      final src = (i * fromHz / toHz);
      final i0 = src.floor().clamp(0, inSamples - 1);
      final i1 = (i0 + 1).clamp(0, inSamples - 1);
      final frac = src - i0;
      final s0 = inView.getInt16(i0 * 2, Endian.little);
      final s1 = inView.getInt16(i1 * 2, Endian.little);
      final mixed = (s0 + (s1 - s0) * frac).round().clamp(-32768, 32767);
      out.setInt16(i * 2, mixed, Endian.little);
    }
    return out.buffer.asUint8List();
  }

  void _setState(VoiceAssistantState value, String message) {
    state = value;
    statusMessage = message;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_closeResources());
    unawaited(_playerCompleteSubscription?.cancel());
    unawaited(_recorder.dispose());
    unawaited(_player.dispose());
    super.dispose();
  }

  static String _safeError(Object error) {
    return GeminiLiveTransport.safeErrorText(
      error.toString().replaceFirst('Bad state: ', ''),
    );
  }

  /// Prefer actionable copy over raw Dart timeout/stack strings in the overlay.
  static String _userFacingError(Object error) {
    if (error is TimeoutException) {
      final message = error.message?.trim();
      if (message != null &&
          message.isNotEmpty &&
          message != 'Future not completed') {
        return GeminiLiveTransport.safeErrorText(message);
      }
      return GeminiLiveTransport.readyTimeoutMessage;
    }
    final raw = _safeError(error);
    final lower = raw.toLowerCase();
    if (lower.contains('timeoutexception') ||
        lower.contains('future not completed')) {
      return GeminiLiveTransport.readyTimeoutMessage;
    }
    if (lower.contains('session expired') ||
        lower.contains('not signed in') ||
        lower.contains('log in') ||
        lower.contains('farmer accounts only') ||
        lower.contains('microphone permission') ||
        lower.contains('not enabled') ||
        lower.contains('not configured') ||
        lower.contains('temporarily unavailable') ||
        lower.contains('network or firewall') ||
        lower.contains('could not open a secure connection') ||
        lower.contains('did not confirm') ||
        lower.contains('closed the connection before') ||
        lower.contains('connection failed') ||
        lower.contains('unauthorized') ||
        lower.contains('401')) {
      if (lower.contains('unauthorized') || lower.contains('401')) {
        return 'Session expired. Log in again, then start Fasal Saathi.';
      }
      return raw;
    }
    return raw;
  }

  static String _actionLabel(String action) {
    const labels = <String, String>{
      'navigate_to_screen': 'Opening a screen',
      'change_language': 'Changing the app language',
      'list_my_farms': 'Reading farm records',
      'list_plots': 'Reading plot records',
      'list_crop_types': 'Reading crop types',
      'list_growth_stages': 'Reading growth stages',
      'list_crop_cycles': 'Reading crop cycles',
      'list_my_submissions': 'Checking submission status',
      'list_notifications': 'Reading notifications',
      'list_evidence_reminders': 'Checking evidence reminders',
      'begin_guided_capture': 'Opening the camera workflow',
      'read_capture_guidance': 'Reading capture guidance',
      'capture_current_angle': 'Capturing the current photo',
      'set_capture_observation': 'Adding the field observation',
      'save_guided_capture_offline': 'Saving encrypted evidence',
      'prepare_sync_offline_queue': 'Preparing evidence upload',
      'prepare_finalize_submission': 'Preparing final submission',
      'prepare_create_farm': 'Preparing a new farm',
      'prepare_create_plot': 'Preparing a new plot',
      'prepare_create_crop_cycle': 'Preparing a crop cycle',
      'prepare_update_evidence_reminder': 'Preparing reminder changes',
      'prepare_snooze_evidence_reminder': 'Preparing reminder snooze',
      'prepare_mark_notification_read': 'Preparing notification update',
      'prepare_logout': 'Preparing sign out',
      'confirm_pending_action': 'Executing your confirmed action',
      'cancel_pending_action': 'Cancelling the pending action',
      'read_offline_queue': 'Checking the offline queue',
    };
    return labels[action] ?? action.replaceAll('_', ' ');
  }

  static Uint8List _pcm16MonoToWav(
    Uint8List pcm, {
    required int sampleRate,
  }) {
    const channels = 1;
    const bitsPerSample = 16;
    final output = Uint8List(44 + pcm.length);
    final data = ByteData.sublistView(output);

    void writeAscii(int offset, String value) {
      output.setRange(offset, offset + value.length, ascii.encode(value));
    }

    writeAscii(0, 'RIFF');
    data.setUint32(4, 36 + pcm.length, Endian.little);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    data.setUint32(16, 16, Endian.little);
    data.setUint16(20, 1, Endian.little);
    data.setUint16(22, channels, Endian.little);
    data.setUint32(24, sampleRate, Endian.little);
    data.setUint32(
      28,
      sampleRate * channels * bitsPerSample ~/ 8,
      Endian.little,
    );
    data.setUint16(32, channels * bitsPerSample ~/ 8, Endian.little);
    data.setUint16(34, bitsPerSample, Endian.little);
    writeAscii(36, 'data');
    data.setUint32(40, pcm.length, Endian.little);
    output.setRange(44, output.length, pcm);
    return output;
  }
}
