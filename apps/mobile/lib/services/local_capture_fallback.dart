import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Default Bhopal-area point used when the local web/demo stack has no GPS.
const localFallbackLatitude = 23.2615;
const localFallbackLongitude = 77.4125;
const localFallbackAccuracyM = 15.0;

/// Distinct JPEG per required angle so localhost can finish capture without a
/// camera. Frames are large enough for the on-device quality checks.
Uint8List buildLocalFallbackJpeg(
  String angle, {
  int width = 800,
  int height = 600,
}) {
  final palette = <String, List<int>>{
    'wide_field': [34, 120, 40],
    'left_context': [46, 139, 87],
    'mid_canopy': [60, 160, 70],
    'right_context': [80, 140, 60],
    'closeup_damage': [160, 80, 40],
  };
  final rgb = palette[angle] ?? [70, 90, 70];
  final image = img.Image(width: width, height: height);
  // Checkerboard so on-device blur/exposure heuristics accept the frame.
  for (final pixel in image) {
    final even = ((pixel.x ~/ 20) + (pixel.y ~/ 20)).isEven;
    pixel
      ..r = even ? rgb[0] : 40
      ..g = even ? rgb[1] : 40
      ..b = even ? rgb[2] : 40;
  }
  return Uint8List.fromList(img.encodeJpg(image, quality: 85));
}
