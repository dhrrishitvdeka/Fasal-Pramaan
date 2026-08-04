import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:fasalpramaan/services/sync_backoff.dart';

void main() {
  test('exponential ceiling grows then caps', () {
    final b = SyncBackoff(baseSeconds: 5, capSeconds: 300, random: Random(1));
    expect(b.maxDelaySeconds(0), 5);
    expect(b.maxDelaySeconds(1), 10);
    expect(b.maxDelaySeconds(2), 20);
    expect(b.maxDelaySeconds(10), 300); // capped
  });

  test('jitter is within [0, ceiling]', () {
    final b = SyncBackoff(baseSeconds: 5, capSeconds: 40, random: Random(42));
    for (var i = 0; i < 20; i++) {
      final d = b.nextDelaySeconds(3); // ceiling 40
      expect(d, inInclusiveRange(0, 40));
    }
  });

  test('give up after max retries', () {
    final b = SyncBackoff(maxRetries: 3);
    expect(b.shouldGiveUp(2), isFalse);
    expect(b.shouldGiveUp(3), isTrue);
  });
}
