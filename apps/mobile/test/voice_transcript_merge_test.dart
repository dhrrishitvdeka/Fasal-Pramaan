import 'package:fasalpramaan/features/voice/voice_assistant_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('mergeStreamingTranscript', () {
    test('keeps cumulative full text', () {
      expect(
        VoiceAssistantController.mergeStreamingTranscript('नमस्ते', 'नमस्ते किसान'),
        'नमस्ते किसान',
      );
    });

    test('appends pure delta fragments (last-word bug)', () {
      // Model streams one token at a time; UI used to show only the last piece.
      var text = '';
      for (final piece in ['ऐप', ' की', ' भाषा', ' हिन्दी', ' कर', ' दी', ' गई', ' है', '?']) {
        text = VoiceAssistantController.mergeStreamingTranscript(text, piece);
      }
      expect(text, 'ऐप की भाषा हिन्दी कर दी गई है?');
    });

    test('repairs overlapping deltas', () {
      expect(
        VoiceAssistantController.mergeStreamingTranscript('नमस्ते कि', 'किसान'),
        'नमस्ते किसान',
      );
    });

    test('ignores exact trailing duplicates', () {
      expect(
        VoiceAssistantController.mergeStreamingTranscript('hello world', 'world'),
        'hello world',
      );
    });

    test('adds space between latin word deltas', () {
      expect(
        VoiceAssistantController.mergeStreamingTranscript('Found', '0'),
        'Found 0',
      );
    });

    test('preserves leading spaces on hindi deltas (trim regression)', () {
      var text = '';
      for (final piece in [
        'खेत',
        ' की',
        ' जानकारी',
        ' देख',
        ' सकता',
        ' हूँ',
      ]) {
        text = VoiceAssistantController.mergeStreamingTranscript(text, piece);
      }
      expect(text, 'खेत की जानकारी देख सकता हूँ');
    });

    test('adds space between bare hindi word deltas', () {
      var text = '';
      for (final piece in ['खेत', 'की', 'जानकारी', 'देख', 'सकता', 'हूँ']) {
        text = VoiceAssistantController.mergeStreamingTranscript(text, piece);
      }
      expect(text, 'खेत की जानकारी देख सकता हूँ');
    });

    test('does not split devanagari matra or virama clusters', () {
      // Matra attaches to previous consonant (U+0940 ी).
      expect(
        VoiceAssistantController.mergeStreamingTranscript('क', 'ी'),
        'की',
      );
      // Halant + consonant continues the same cluster.
      expect(
        VoiceAssistantController.mergeStreamingTranscript('क्', 'ष'),
        'क्ष',
      );
      // Word-level deltas without spaces still get a separator.
      expect(
        VoiceAssistantController.mergeStreamingTranscript('मदद', 'कर'),
        'मदद कर',
      );
    });
  });
}
