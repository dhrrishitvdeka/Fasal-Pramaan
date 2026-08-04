import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A secure storage wrapper that gracefully falls back to SharedPreferences /
/// in-memory storage on web browsers accessed over HTTP (where SubtleCrypto is
/// disabled by browser security policies).
class SafeStorage {
  const SafeStorage();

  static const _secure = FlutterSecureStorage();
  static final Map<String, String> _memFallback = {};

  Future<String?> read({required String key}) async {
    try {
      return await _secure.read(key: key);
    } catch (_) {
      if (kIsWeb) {
        try {
          final prefs = await SharedPreferences.getInstance();
          return prefs.getString(key) ?? _memFallback[key];
        } catch (_) {
          return _memFallback[key];
        }
      }
      return null;
    }
  }

  Future<void> write({required String key, required String value}) async {
    try {
      await _secure.write(key: key, value: value);
    } catch (_) {
      if (kIsWeb) {
        _memFallback[key] = value;
        try {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(key, value);
        } catch (_) {}
      }
    }
  }

  Future<void> delete({required String key}) async {
    try {
      await _secure.delete(key: key);
    } catch (_) {
      if (kIsWeb) {
        _memFallback.remove(key);
        try {
          final prefs = await SharedPreferences.getInstance();
          await prefs.remove(key);
        } catch (_) {}
      }
    }
  }
}
