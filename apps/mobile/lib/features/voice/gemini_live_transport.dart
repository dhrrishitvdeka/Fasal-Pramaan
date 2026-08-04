import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:fasalpramaan/core/config.dart';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class GeminiLiveSessionConfig {
  const GeminiLiveSessionConfig({
    required this.token,
    required this.model,
    required this.websocketUrl,
    required this.sessionId,
    required this.expiresAt,
    this.outputSampleRateHz = 24000,
    this.useProxy = true,
    this.proxyPath = '/api/v1/voice/live',
    this.bearerAccessToken,
  });

  factory GeminiLiveSessionConfig.fromJson(
    Map<String, dynamic> value, {
    String? bearerAccessToken,
  }) {
    return GeminiLiveSessionConfig(
      token: value['token'] as String,
      model: value['model'] as String,
      websocketUrl: value['websocket_url'] as String,
      sessionId: value['session_id'] as String,
      expiresAt: DateTime.parse(value['expires_at'] as String),
      outputSampleRateHz:
          (value['output_sample_rate_hz'] as num?)?.toInt() ?? 24000,
      useProxy: value['use_proxy'] as bool? ?? true,
      proxyPath: value['proxy_path'] as String? ?? '/api/v1/voice/live',
      bearerAccessToken: bearerAccessToken,
    );
  }

  final String token;
  final String model;
  final String websocketUrl;
  final String sessionId;
  final DateTime expiresAt;
  final int outputSampleRateHz;
  final bool useProxy;
  final String proxyPath;
  /// App JWT used for the same-origin Live proxy (not the Gemini ephemeral token).
  final String? bearerAccessToken;

  /// Prefer the API Live proxy so the browser never opens Google WSS directly.
  bool get shouldUseProxy {
    // Always proxy on Flutter web. On other platforms, honour the server flag.
    if (kIsWeb) return true;
    return useProxy;
  }

  Uri buildSocketUri() {
    if (shouldUseProxy) {
      final bearer = bearerAccessToken?.trim() ?? '';
      if (bearer.isEmpty) {
        throw StateError(
          'Not signed in. Log in again, then start Fasal Saathi.',
        );
      }
      return buildProxyUri(
        proxyPath: proxyPath,
        bearerAccessToken: bearer,
      );
    }
    final endpoint = Uri.parse(websocketUrl);
    return endpoint.replace(
      queryParameters: {
        ...endpoint.queryParameters,
        'access_token': token,
      },
    );
  }

  static Uri buildProxyUri({
    required String proxyPath,
    required String bearerAccessToken,
  }) {
    final api = Uri.parse(AppConfig.resolvedApiBaseUrl);
    final scheme = api.scheme == 'https' ? 'wss' : 'ws';
    final basePath = api.path.endsWith('/')
        ? api.path.substring(0, api.path.length - 1)
        : api.path;
    final livePath = proxyPath.startsWith('/') ? proxyPath : '/$proxyPath';
    final fullPath = ('$basePath$livePath').replaceAll('//', '/');
    if (fullPath.isEmpty || fullPath == '/') {
      throw StateError('Invalid voice proxy path configuration');
    }
    return Uri(
      scheme: scheme,
      host: api.host.isEmpty ? Uri.base.host : api.host,
      port: api.hasPort
          ? api.port
          : (Uri.base.hasPort ? Uri.base.port : null),
      path: fullPath,
      queryParameters: {'access_token': bearerAccessToken},
    );
  }
}

sealed class GeminiLiveEvent {
  const GeminiLiveEvent();
}

class GeminiSetupComplete extends GeminiLiveEvent {
  const GeminiSetupComplete();
}

class GeminiAudioChunk extends GeminiLiveEvent {
  const GeminiAudioChunk(this.bytes);
  final Uint8List bytes;
}

class GeminiInputTranscription extends GeminiLiveEvent {
  const GeminiInputTranscription(this.text);
  final String text;
}

class GeminiOutputTranscription extends GeminiLiveEvent {
  const GeminiOutputTranscription(this.text);
  final String text;
}

class GeminiToolInvocation {
  const GeminiToolInvocation({
    required this.id,
    required this.name,
    required this.arguments,
  });

  final String id;
  final String name;
  final Map<String, dynamic> arguments;
}

class GeminiToolCalls extends GeminiLiveEvent {
  const GeminiToolCalls(this.calls);
  final List<GeminiToolInvocation> calls;
}

class GeminiTurnComplete extends GeminiLiveEvent {
  const GeminiTurnComplete();
}

class GeminiInterrupted extends GeminiLiveEvent {
  const GeminiInterrupted();
}

class GeminiTransportError extends GeminiLiveEvent {
  const GeminiTransportError(this.message);
  final String message;
}

/// Result of decoding one server WebSocket frame. Pure helper for tests and
/// the live transport so setup failures are never silently ignored.
class GeminiLiveMessageParse {
  const GeminiLiveMessageParse({
    this.events = const [],
    this.setupComplete = false,
    this.fatalError,
  });

  final List<GeminiLiveEvent> events;
  final bool setupComplete;
  final String? fatalError;
}

/// Decode a single Gemini Live JSON frame into events and setup/error signals.
GeminiLiveMessageParse parseGeminiLiveMessage(Map<String, dynamic> message) {
  final events = <GeminiLiveEvent>[];
  var setupComplete = false;
  String? fatalError;

  final error = message['error'];
  if (error != null) {
    fatalError = _describeGeminiError(error);
    events.add(GeminiTransportError(fatalError));
  }

  if (message.containsKey('setupComplete')) {
    setupComplete = true;
    events.add(const GeminiSetupComplete());
  }

  final serverContent = message['serverContent'];
  if (serverContent is Map) {
    final content = Map<String, dynamic>.from(serverContent);
    final input = _transcriptionText(content['inputTranscription']);
    if (input != null) events.add(GeminiInputTranscription(input));
    final output = _transcriptionText(content['outputTranscription']);
    if (output != null) events.add(GeminiOutputTranscription(output));
    final modelTurn = content['modelTurn'];
    if (modelTurn is Map && modelTurn['parts'] is List) {
      for (final rawPart in modelTurn['parts'] as List) {
        if (rawPart is! Map) continue;
        final inlineData = rawPart['inlineData'];
        if (inlineData is! Map || inlineData['data'] is! String) continue;
        events.add(
          GeminiAudioChunk(base64Decode(inlineData['data'] as String)),
        );
      }
    }
    if (content['interrupted'] == true) {
      events.add(const GeminiInterrupted());
    }
    if (content['turnComplete'] == true) {
      events.add(const GeminiTurnComplete());
    }
  }

  final toolCall = message['toolCall'];
  if (toolCall is Map && toolCall['functionCalls'] is List) {
    final calls = <GeminiToolInvocation>[];
    for (final rawCall in toolCall['functionCalls'] as List) {
      if (rawCall is! Map) continue;
      final call = Map<String, dynamic>.from(rawCall);
      final name = call['name']?.toString() ?? '';
      final id = call['id']?.toString() ?? '';
      if (name.isEmpty || id.isEmpty) continue;
      calls.add(
        GeminiToolInvocation(
          id: id,
          name: name,
          arguments: call['args'] is Map
              ? Map<String, dynamic>.from(call['args'] as Map)
              : const {},
        ),
      );
    }
    if (calls.isNotEmpty) events.add(GeminiToolCalls(calls));
  }

  if (message['goAway'] is Map) {
    events.add(
      const GeminiTransportError('Gemini Live requested a session restart.'),
    );
  }

  return GeminiLiveMessageParse(
    events: events,
    setupComplete: setupComplete,
    fatalError: fatalError,
  );
}

String? _transcriptionText(dynamic raw) {
  if (raw is! Map) return null;
  final text = raw['text']?.toString().trim() ?? '';
  return text.isEmpty ? null : text;
}

String _describeGeminiError(Object error) {
  if (error is Map) {
    final map = Map<String, dynamic>.from(error);
    final status = map['status']?.toString();
    final code = map['code']?.toString();
    final message = map['message']?.toString().trim();
    final parts = <String>[
      if (status != null && status.isNotEmpty) status,
      if (code != null && code.isNotEmpty) 'code $code',
      if (message != null && message.isNotEmpty) message,
    ];
    if (parts.isNotEmpty) {
      return GeminiLiveTransport.safeErrorText(parts.join(': '));
    }
  }
  return GeminiLiveTransport.safeErrorText(error.toString());
}

/// Raw Gemini Live WebSocket client. The long-lived Gemini key is never present
/// here; the URL is authenticated with the backend-minted ephemeral token.
class GeminiLiveTransport {
  GeminiLiveTransport({
    WebSocketChannel Function(Uri uri)? connector,
    Duration? connectTimeout,
    Duration? setupTimeout,
  })  : _connector = connector,
        connectTimeout = connectTimeout ?? defaultConnectTimeout,
        setupTimeout = setupTimeout ?? defaultSetupTimeout;

  final WebSocketChannel Function(Uri uri)? _connector;

  final _events = StreamController<GeminiLiveEvent>.broadcast();
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Completer<void>? _setupCompleter;
  bool _closed = false;
  bool _setupFinished = false;

  // Allow token mint + upstream Gemini open after the browser socket is accepted.
  static const Duration defaultConnectTimeout = Duration(seconds: 30);
  static const Duration defaultSetupTimeout = Duration(seconds: 30);

  final Duration connectTimeout;
  final Duration setupTimeout;

  static const String readyTimeoutMessage =
      'Could not open a secure connection to the voice service '
      '(network or firewall).';
  static const String setupTimeoutMessage =
      'Gemini did not confirm the voice session. Check that the server has a '
      'valid GEMINI_API_KEY, the Live model is enabled, and this device can '
      'reach Google over the internet.';
  static const String closedDuringSetupMessage =
      'Gemini closed the connection before the voice session was ready.';
  static const String connectionFailedMessage =
      'Gemini Live connection failed';

  Stream<GeminiLiveEvent> get events => _events.stream;

  Future<void> connect(GeminiLiveSessionConfig config) async {
    if (_channel != null) throw StateError('Gemini Live is already connected');
    _closed = false;
    _setupFinished = false;
    final uri = config.buildSocketUri();
    _setupCompleter = Completer<void>();
    final connector = _connector ?? WebSocketChannel.connect;
    final channel = connector(uri);
    _channel = channel;
    _subscription = channel.stream.listen(
      _onMessage,
      onError: (Object error) {
        _failSetup(StateError(connectionFailedMessage),
            detail: safeErrorText(error));
      },
      onDone: () {
        if (_closed) return;
        final code = channel.closeCode;
        final reason = channel.closeReason;
        final detail = [
          closedDuringSetupMessage,
          if (code != null) 'code $code',
          if (reason != null && reason.isNotEmpty) reason,
        ].join(' · ');
        if (!_setupFinished) {
          _failSetup(StateError(detail));
        } else {
          _emit(GeminiTransportError(
            'Gemini Live connection closed'
            '${code != null ? ' (code $code)' : ''}'
            '${reason != null && reason.isNotEmpty ? ': $reason' : '.'}',
          ));
        }
      },
      cancelOnError: false,
    );
    try {
      await channel.ready.timeout(
        connectTimeout,
        onTimeout: () => throw TimeoutException(readyTimeoutMessage),
      );
    } on TimeoutException {
      await _abortConnect();
      rethrow;
    } catch (error) {
      await _abortConnect();
      throw StateError(
        'Could not open a secure connection to the voice service: '
        '${safeErrorText(error)}',
      );
    }

    _send({
      'setup': {
        'model': 'models/${config.model}',
        'generationConfig': {
          'responseModalities': ['AUDIO'],
        },
      }
    });

    try {
      await _setupCompleter!.future.timeout(
        setupTimeout,
        onTimeout: () => throw TimeoutException(setupTimeoutMessage),
      );
    } on TimeoutException {
      await _abortConnect();
      rethrow;
    } catch (error) {
      await _abortConnect();
      if (error is StateError) rethrow;
      throw StateError(safeErrorText(error));
    }
  }

  void sendAudio(Uint8List pcm16Bytes) {
    if (pcm16Bytes.isEmpty || _channel == null) return;
    _send({
      'realtimeInput': {
        'audio': {
          'data': base64Encode(pcm16Bytes),
          'mimeType': 'audio/pcm;rate=16000',
        }
      }
    });
  }

  void sendText(String text) {
    if (text.trim().isEmpty || _channel == null) return;
    _send({
      'realtimeInput': {'text': text.trim()}
    });
  }

  void sendToolResponses(List<Map<String, dynamic>> functionResponses) {
    if (functionResponses.isEmpty) return;
    _send({
      'toolResponse': {
        'functionResponses': functionResponses,
      }
    });
  }

  void _send(Map<String, dynamic> value) {
    _channel?.sink.add(jsonEncode(value));
  }

  void _onMessage(dynamic raw) {
    try {
      final text = _frameToText(raw);
      final message = Map<String, dynamic>.from(jsonDecode(text) as Map);
      final parsed = parseGeminiLiveMessage(message);
      for (final event in parsed.events) {
        _emit(event);
      }
      if (parsed.fatalError != null) {
        _failSetup(StateError(parsed.fatalError!));
        return;
      }
      if (parsed.setupComplete) {
        final completer = _setupCompleter;
        if (completer != null && !completer.isCompleted) {
          completer.complete();
        }
        _setupFinished = true;
      }
    } catch (error) {
      final message =
          'Invalid Gemini Live message: ${safeErrorText(error)}';
      _emit(GeminiTransportError(message));
      if (!_setupFinished) {
        _failSetup(StateError(message));
      }
    }
  }

  void _failSetup(Object error, {String? detail}) {
    final completer = _setupCompleter;
    if (completer != null && !completer.isCompleted) {
      completer.completeError(error);
    }
    if (detail != null && detail.isNotEmpty) {
      _emit(GeminiTransportError(detail));
    } else if (error is StateError) {
      _emit(GeminiTransportError(error.message));
    } else {
      _emit(GeminiTransportError(safeErrorText(error)));
    }
  }

  Future<void> _abortConnect() async {
    _closed = true;
    final completer = _setupCompleter;
    if (completer != null && !completer.isCompleted) {
      completer.completeError(StateError(connectionFailedMessage));
    }
    await _subscription?.cancel();
    _subscription = null;
    try {
      await _channel?.sink.close();
    } catch (_) {
      // Best-effort close while reporting the original connect failure.
    }
    _channel = null;
  }

  void _emit(GeminiLiveEvent event) {
    if (!_events.isClosed) _events.add(event);
  }

  /// Gemini Live often returns binary JSON frames; Flutter web may deliver
  /// them as [Uint8List]/[ByteBuffer]/[List<int>] rather than [String].
  static String _frameToText(dynamic raw) {
    if (raw is String) return raw;
    if (raw is Uint8List) return utf8.decode(raw);
    if (raw is ByteBuffer) return utf8.decode(raw.asUint8List());
    if (raw is ByteData) {
      return utf8.decode(
        raw.buffer.asUint8List(raw.offsetInBytes, raw.lengthInBytes),
      );
    }
    if (raw is List<int>) return utf8.decode(raw);
    throw FormatException(
      'Unsupported Gemini Live frame type: ${raw.runtimeType}',
    );
  }

  Future<void> close() async {
    if (_closed && _channel == null && _events.isClosed) return;
    _closed = true;
    final completer = _setupCompleter;
    if (completer != null && !completer.isCompleted) {
      completer.completeError(StateError('Voice session closed during setup.'));
    }
    await _subscription?.cancel();
    _subscription = null;
    try {
      await _channel?.sink.close();
    } catch (_) {}
    _channel = null;
    if (!_events.isClosed) await _events.close();
  }

  /// Redact secrets and collapse multi-line exception text for UI/logs.
  static String safeErrorText(Object error) {
    final text = error
        .toString()
        .replaceAll(RegExp(r'access_token=[^&\s]+'), 'access_token=[REDACTED]')
        .replaceAll(RegExp(r'auth_tokens/[^&\s]+'), 'auth_tokens/[REDACTED]')
        .replaceAll(RegExp(r'AIza[0-9A-Za-z_\-]{10,}'), '[REDACTED_KEY]')
        .replaceAll(RegExp(r'[\r\n]+'), ' ');
    return text.length <= 160 ? text : '${text.substring(0, 160)}…';
  }
}
