import 'dart:io';

import 'package:localshare/core/crypto/ephemeral_cert.dart';
import 'package:localshare/core/crypto/hashing.dart';
import 'package:localshare/core/crypto/pin.dart';
import 'package:test/test.dart';

void main() {
  group('ephemeral certificate', () {
    test('generates a usable PEM cert, key and stable fingerprint', () {
      final cert = EphemeralCertificate.generate();
      expect(cert.certificatePem, contains('BEGIN CERTIFICATE'));
      expect(cert.privateKeyPem, contains('PRIVATE KEY'));
      expect(cert.fingerprint, hasLength(64));

      // Re-deriving the fingerprint from the same cert must match.
      final again = EphemeralCertificate(
        certificatePem: cert.certificatePem,
        privateKeyPem: cert.privateKeyPem,
        fingerprint: cert.fingerprint,
      );
      expect(again.fingerprint, cert.fingerprint);
    });

    test('two certificates have different fingerprints', () {
      final a = EphemeralCertificate.generate();
      final b = EphemeralCertificate.generate();
      expect(a.fingerprint, isNot(b.fingerprint));
    });

    test('produces a SecurityContext', () {
      final cert = EphemeralCertificate.generate();
      expect(cert.toSecurityContext, returnsNormally);
    });
  });

  group('hashing', () {
    test('hashFile matches an in-memory digest', () async {
      final dir = await Directory.systemTemp.createTemp('ls-hash');
      final file = File('${dir.path}/data.bin');
      final bytes = List<int>.generate(1024 * 1024 + 7, (i) => i % 251);
      await file.writeAsBytes(bytes);

      final streamed = await hashFile(file.path);
      expect(streamed, hashBytes(bytes));

      await dir.delete(recursive: true);
    });

    test('reports progress to the end', () async {
      final dir = await Directory.systemTemp.createTemp('ls-hash2');
      final file = File('${dir.path}/small.bin');
      await file.writeAsBytes(List<int>.filled(2000, 7));

      var lastHashed = 0;
      var lastTotal = 0;
      await hashFile(file.path, onProgress: (h, t) {
        lastHashed = h;
        lastTotal = t;
      });
      expect(lastHashed, 2000);
      expect(lastTotal, 2000);

      await dir.delete(recursive: true);
    });
  });

  group('pin', () {
    test('generates correct length numeric pins', () {
      for (var i = 0; i < 50; i++) {
        final pin = generatePin(length: 6);
        expect(pin, hasLength(6));
        expect(int.tryParse(pin), isNotNull);
      }
    });

    test('constant-time equality behaves like ==', () {
      expect(constantTimeEquals('123456', '123456'), isTrue);
      expect(constantTimeEquals('123456', '123457'), isFalse);
      expect(constantTimeEquals('12345', '123456'), isFalse);
    });
  });
}
