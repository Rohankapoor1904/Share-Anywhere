/// Ephemeral, per-run TLS material.
///
/// Every launch generates a fresh self-signed certificate. Its SHA-256
/// fingerprint *is* the device identity: peers pin to it on first use, so a
/// swapped certificate (spoofing) is detected immediately. Nothing is written
/// to disk, so the key cannot be stolen at rest.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:basic_utils/basic_utils.dart';
import 'package:crypto/crypto.dart';

/// A generated certificate + private key plus derived identity.
class EphemeralCertificate {
  EphemeralCertificate({
    required this.certificatePem,
    required this.privateKeyPem,
    required this.fingerprint,
  });

  /// PEM-encoded X.509 certificate.
  final String certificatePem;
  final String privateKeyPem;

  /// Lowercase hex SHA-256 of the DER certificate. This is the device id peers
  /// pin against.
  final String fingerprint;

  /// Build a `SecurityContext` usable by `SecureServerSocket` / `HttpServer`.
  SecurityContext toSecurityContext() {
    final context = SecurityContext(withTrustedRoots: false);
    // dart:io auto-detects PEM, so hand it the encoded text directly.
    context.useCertificateChainBytes(utf8.encode(certificatePem));
    context.usePrivateKeyBytes(utf8.encode(privateKeyPem));
    return context;
  }

  static List<int> _pemToBytes(String pem) => base64.decode(
        pem
            .replaceAll(RegExp(r'-----[A-Z ]+-----'), '')
            .replaceAll(RegExp(r'\s'), ''),
      );

  /// DER bytes of the certificate (used to derive the fingerprint).
  List<int> get derBytes => _pemToBytes(certificatePem);

  static String _randomSerial() {
    final random = Random.secure();
    // basic_utils parses this as a decimal BigInt, so emit decimal digits.
    final value = BigInt.parse(
      List<int>.generate(19, (_) => random.nextInt(10)).join(),
    );
    return value.toString();
  }

  /// Generate a fresh self-signed certificate valid for [validity].
  ///
  /// [subjectAltNames] should include every address peers may dial, otherwise
  /// hostname verification fails. We accept the fingerprint pin as the primary
  /// identity, but correct SANs still keep clients happy.
  static EphemeralCertificate generate({
    String commonName = 'localshare.local',
    Map<String, String> subject = const {},
    List<String> subjectAltNames = const ['localhost', '127.0.0.1'],
    Duration validity = const Duration(days: 3650),
  }) {
    final pair = CryptoUtils.generateRSAKeyPair(keySize: 2048);
    final privateKey = pair.privateKey as RSAPrivateKey;
    final publicKey = pair.publicKey as RSAPublicKey;

    final dn = {'CN': commonName, ...subject};
    final csrPem = X509Utils.generateRsaCsrPem(
      dn,
      privateKey,
      publicKey,
      san: subjectAltNames,
    );
    final certPem = X509Utils.generateSelfSignedCertificate(
      privateKey,
      csrPem,
      validity.inDays,
      sans: subjectAltNames,
      extKeyUsage: [ExtendedKeyUsage.SERVER_AUTH, ExtendedKeyUsage.CLIENT_AUTH],
      serialNumber: _randomSerial(),
    );

    final der = _pemToBytes(certPem);
    final fingerprint = sha256.convert(der).toString();
    return EphemeralCertificate(
      certificatePem: certPem,
      privateKeyPem: CryptoUtils.encodeRSAPrivateKeyToPem(privateKey),
      fingerprint: fingerprint,
    );
  }
}
