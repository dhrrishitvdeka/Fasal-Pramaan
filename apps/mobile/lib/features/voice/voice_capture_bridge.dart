import 'dart:async';

typedef VoiceCaptureHandler = Future<Map<String, dynamic>> Function();
typedef VoiceObservationHandler = Future<Map<String, dynamic>> Function(
  String observation,
);

/// Narrow bridge between the global voice overlay and the mounted capture UI.
/// A handler exists only while GuidedCaptureScreen is active.
class VoiceCaptureBridge {
  Object? _owner;
  VoiceCaptureHandler? _capture;
  VoiceCaptureHandler? _guidance;
  VoiceCaptureHandler? _save;
  VoiceObservationHandler? _setObservation;

  void register({
    required Object owner,
    required VoiceCaptureHandler capture,
    required VoiceCaptureHandler guidance,
    required VoiceCaptureHandler save,
    required VoiceObservationHandler setObservation,
  }) {
    _owner = owner;
    _capture = capture;
    _guidance = guidance;
    _save = save;
    _setObservation = setObservation;
  }

  void unregister(Object owner) {
    if (!identical(_owner, owner)) return;
    _owner = null;
    _capture = null;
    _guidance = null;
    _save = null;
    _setObservation = null;
  }

  Future<Map<String, dynamic>> captureCurrentAngle() =>
      _invoke(_capture, 'Guided capture is not open.');

  Future<Map<String, dynamic>> readGuidance() =>
      _invoke(_guidance, 'Guided capture is not open.');

  Future<Map<String, dynamic>> saveOffline() =>
      _invoke(_save, 'Guided capture is not open.');

  Future<Map<String, dynamic>> setObservation(String observation) async {
    final handler = _setObservation;
    if (handler == null) {
      return {'ok': false, 'message': 'Guided capture is not open.'};
    }
    return handler(observation);
  }

  Future<Map<String, dynamic>> _invoke(
    VoiceCaptureHandler? handler,
    String unavailableMessage,
  ) async {
    if (handler == null) return {'ok': false, 'message': unavailableMessage};
    return handler();
  }
}

final voiceCaptureBridge = VoiceCaptureBridge();
