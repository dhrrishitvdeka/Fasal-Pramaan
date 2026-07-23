import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Authenticated encryption helpers for offline evidence and cached payloads.
class SecureStoreConfig {
  static const dbPasswordKey = 'fasalpramaan_db_key_v1';
  static const encryptionEnabledKey = 'fasalpramaan_db_encrypted';
}

/// Derive stable 32-byte key material from the random secret held by secure storage.
Uint8List deriveKeyMaterial(String passphrase, {List<int>? salt}) {
  final s = salt ?? utf8.encode('fasalpramaan-offline-v1');
  final digest = sha256.convert([...utf8.encode(passphrase), ...s]);
  return Uint8List.fromList(digest.bytes);
}

/// Encrypt bytes with AES-256-GCM and a fresh nonce. The output includes the
/// nonce and authentication tag, so tampering and incorrect keys are rejected.
Future<Uint8List> encryptBytes(Uint8List plain, Uint8List keyMaterial) async {
  final algorithm = AesGcm.with256bits();
  final nonce = algorithm.newNonce();
  final box = await algorithm.encrypt(
    plain,
    secretKey: SecretKey(keyMaterial),
    nonce: nonce,
  );
  return Uint8List.fromList([...nonce, ...box.mac.bytes, ...box.cipherText]);
}

Future<Uint8List> decryptBytes(
    Uint8List envelope, Uint8List keyMaterial) async {
  const nonceLength = 12;
  const macLength = 16;
  if (envelope.length < nonceLength + macLength) {
    throw const FormatException('Encrypted envelope is truncated');
  }
  final algorithm = AesGcm.with256bits();
  final box = SecretBox(
    envelope.sublist(nonceLength + macLength),
    nonce: envelope.sublist(0, nonceLength),
    mac: Mac(envelope.sublist(nonceLength, nonceLength + macLength)),
  );
  return Uint8List.fromList(
    await algorithm.decrypt(box, secretKey: SecretKey(keyMaterial)),
  );
}

Future<String> encryptUtf8(String plain, String passphrase) async {
  final key = deriveKeyMaterial(passphrase);
  final cipher =
      await encryptBytes(Uint8List.fromList(utf8.encode(plain)), key);
  return base64Encode(cipher);
}

Future<String> decryptUtf8(String b64Cipher, String passphrase) async {
  final key = deriveKeyMaterial(passphrase);
  final plain = await decryptBytes(base64Decode(b64Cipher), key);
  return utf8.decode(plain);
}

/// Generate a random DB passphrase for SQLCipher / field encryption.
String generateDbPassphrase({int bytes = 32}) {
  final rng = Random.secure();
  final data = List<int>.generate(bytes, (_) => rng.nextInt(256));
  return base64UrlEncode(data);
}

String? _cachedPassphrase;

/// Resolve (or create) the offline DB encryption passphrase from secure storage.
Future<String> resolveDbPassphrase({FlutterSecureStorage? storage}) async {
  if (_cachedPassphrase != null && _cachedPassphrase!.isNotEmpty) {
    return _cachedPassphrase!;
  }
  final store = storage ?? const FlutterSecureStorage();
  var existing = await store.read(key: SecureStoreConfig.dbPasswordKey);
  if (existing == null || existing.isEmpty) {
    existing = generateDbPassphrase();
    await store.write(key: SecureStoreConfig.dbPasswordKey, value: existing);
    await store.write(
        key: SecureStoreConfig.encryptionEnabledKey, value: 'true');
  }
  _cachedPassphrase = existing;
  return existing;
}
