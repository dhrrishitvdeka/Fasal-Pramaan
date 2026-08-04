import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:fasalpramaan/services/secure_store.dart';
import 'package:cryptography/cryptography.dart';

void main() {
  test('encrypt/decrypt round-trip for draft payload', () async {
    const passphrase = 'unit-test-passphrase';
    const plain = '{"capture_lat":23.2,"capture_lon":77.4,"sha":"abc"}';
    final cipher = await encryptUtf8(plain, passphrase);
    expect(cipher, isNot(equals(plain)));
    expect(cipher, isNot(contains('23.2')));
    final back = await decryptUtf8(cipher, passphrase);
    expect(back, plain);
  });

  test('wrong passphrase fails authentication', () async {
    final cipher = await encryptUtf8('{"secret":true}', 'key-a');
    await expectLater(
      decryptUtf8(cipher, 'key-b'),
      throwsA(isA<SecretBoxAuthenticationError>()),
    );
  });

  test('deriveKeyMaterial is stable', () {
    final a = deriveKeyMaterial('same');
    final b = deriveKeyMaterial('same');
    expect(a, orderedEquals(b));
    expect(a.length, 32);
  });

  test('encryptBytes is authenticated and reversible', () async {
    final key = deriveKeyMaterial('k');
    final plain = Uint8List.fromList(utf8.encode('geo-hash-data'));
    final c = await encryptBytes(plain, key);
    final p = await decryptBytes(c, key);
    expect(p, orderedEquals(plain));
  });
}
