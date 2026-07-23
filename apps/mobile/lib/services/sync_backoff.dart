import 'dart:math';

/// Exponential backoff with full jitter for offline sync (xyz.md §2).
///
/// delay = random_between(0, min(cap, base * 2^retry))
/// Prevents thundering herd when many devices reconnect after disasters.
class SyncBackoff {
  SyncBackoff({
    this.baseSeconds = 5,
    this.capSeconds = 300,
    this.maxRetries = 12,
    Random? random,
  }) : _random = random ?? Random();

  final int baseSeconds;
  final int capSeconds;
  final int maxRetries;
  final Random _random;

  /// Next wait in seconds for [retryCount] (0-based).
  int nextDelaySeconds(int retryCount) {
    final exp = retryCount.clamp(0, 16);
    final raw = baseSeconds * (1 << exp);
    final ceiling = raw > capSeconds ? capSeconds : raw;
    if (ceiling <= 0) return 0;
    // Full jitter: uniform in [0, ceiling]
    return _random.nextInt(ceiling + 1);
  }

  /// Deterministic max ceiling (no jitter) for tests / UI display.
  int maxDelaySeconds(int retryCount) {
    final exp = retryCount.clamp(0, 16);
    final raw = baseSeconds * (1 << exp);
    return raw > capSeconds ? capSeconds : raw;
  }

  bool shouldGiveUp(int retryCount) => retryCount >= maxRetries;
}

/// Shared default used by [SyncService] and [OfflineDb].
final defaultSyncBackoff = SyncBackoff();
