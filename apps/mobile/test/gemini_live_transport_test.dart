import 'package:fasalpramaan/features/voice/gemini_live_transport.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parseGeminiLiveMessage', () {
    test('marks setupComplete and emits event', () {
      final parsed = parseGeminiLiveMessage({'setupComplete': {}});
      expect(parsed.setupComplete, isTrue);
      expect(parsed.fatalError, isNull);
      expect(parsed.events.whereType<GeminiSetupComplete>(), hasLength(1));
    });

    test('surfaces Gemini error frames as fatal setup failures', () {
      final parsed = parseGeminiLiveMessage({
        'error': {
          'code': 401,
          'status': 'UNAUTHENTICATED',
          'message': 'invalid access_token=super-secret-value',
        },
      });
      expect(parsed.setupComplete, isFalse);
      expect(parsed.fatalError, isNotNull);
      expect(parsed.fatalError!, contains('UNAUTHENTICATED'));
      expect(parsed.fatalError!, isNot(contains('super-secret-value')));
      expect(parsed.fatalError!, contains('access_token=[REDACTED]'));
      expect(parsed.events.whereType<GeminiTransportError>(), hasLength(1));
    });

    test('describes sparse error objects without crashing', () {
      final parsed = parseGeminiLiveMessage({
        'error': {'code': 503},
      });
      expect(parsed.fatalError, contains('code 503'));
    });

    test('parses tool calls and turn completion', () {
      final parsed = parseGeminiLiveMessage({
        'serverContent': {'turnComplete': true},
        'toolCall': {
          'functionCalls': [
            {
              'id': 'call-1',
              'name': 'list_my_farms',
              'args': {'unused': true},
            }
          ],
        },
      });
      expect(parsed.events.whereType<GeminiTurnComplete>(), hasLength(1));
      final tools = parsed.events.whereType<GeminiToolCalls>().single;
      expect(tools.calls.single.name, 'list_my_farms');
      expect(tools.calls.single.id, 'call-1');
    });

    test('emits goAway as a transport error without fatal setup flag', () {
      final parsed = parseGeminiLiveMessage({
        'goAway': {'timeLeft': '10s'},
      });
      expect(parsed.fatalError, isNull);
      expect(
        parsed.events.whereType<GeminiTransportError>().single.message,
        contains('session restart'),
      );
    });

    test('parses input and output transcriptions', () {
      final parsed = parseGeminiLiveMessage({
        'serverContent': {
          'inputTranscription': {'text': '  मेरे खेत  '},
          'outputTranscription': {'text': ' तीन खेत हैं '},
        },
      });
      expect(
        parsed.events.whereType<GeminiInputTranscription>().single.text,
        'मेरे खेत',
      );
      expect(
        parsed.events.whereType<GeminiOutputTranscription>().single.text,
        'तीन खेत हैं',
      );
    });
  });

  group('GeminiLiveTransport.safeErrorText', () {
    test('redacts tokens and keys', () {
      final text = GeminiLiveTransport.safeErrorText(
        'fail access_token=abc123 auth_tokens/xyz AIzaSyDummyKeyValue123',
      );
      expect(text, contains('access_token=[REDACTED]'));
      expect(text, contains('auth_tokens/[REDACTED]'));
      expect(text, contains('[REDACTED_KEY]'));
      expect(text, isNot(contains('abc123')));
    });

    test('exposes distinct timeout copy for UI mapping', () {
      expect(
        GeminiLiveTransport.readyTimeoutMessage,
        contains('network or firewall'),
      );
      expect(
        GeminiLiveTransport.setupTimeoutMessage,
        contains('did not confirm the voice session'),
      );
      expect(
        GeminiLiveTransport.closedDuringSetupMessage,
        contains('closed the connection before'),
      );
    });
  });

  group('GeminiLiveSessionConfig', () {
    test('parses API session-token payload', () {
      final config = GeminiLiveSessionConfig.fromJson({
        'token': 'auth_tokens/demo',
        'model': 'gemini-3.1-flash-live-preview',
        'websocket_url':
            'wss://generativelanguage.googleapis.com/ws/example',
        'session_id': '11111111-1111-1111-1111-111111111111',
        'expires_at': '2030-01-01T00:00:00Z',
        'output_sample_rate_hz': 24000,
        'use_proxy': true,
        'proxy_path': '/api/v1/voice/live',
      }, bearerAccessToken: 'jwt-demo');
      expect(config.token, 'auth_tokens/demo');
      expect(config.model, 'gemini-3.1-flash-live-preview');
      expect(config.outputSampleRateHz, 24000);
      expect(config.shouldUseProxy, isTrue);
      final uri = config.buildSocketUri();
      expect(uri.path, contains('/api/v1/voice/live'));
      expect(uri.queryParameters['access_token'], 'jwt-demo');
    });

    test('direct mode keeps Gemini websocket host', () {
      final config = GeminiLiveSessionConfig.fromJson({
        'token': 'auth_tokens/demo',
        'model': 'gemini-3.1-flash-live-preview',
        'websocket_url':
            'wss://generativelanguage.googleapis.com/ws/example',
        'session_id': '11111111-1111-1111-1111-111111111111',
        'expires_at': '2030-01-01T00:00:00Z',
        'use_proxy': false,
      });
      expect(config.shouldUseProxy, isFalse);
      final uri = config.buildSocketUri();
      expect(uri.host, 'generativelanguage.googleapis.com');
      expect(uri.queryParameters['access_token'], 'auth_tokens/demo');
    });
  });
}
