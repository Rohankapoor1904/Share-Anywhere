/// Connection to a peer over TLS with certificate pinning.
library;

import 'dart:io';

import '../crypto/hashing.dart';

/// Builds a client [HttpClient] that trusts exactly one peer: the one whose
/// certificate DER hashes to [expectedFingerprint].
HttpClient pinnedHttpClient(String expectedFingerprint) {
  return HttpClient(context: SecurityContext(withTrustedRoots: false))
    ..badCertificateCallback = (X509Certificate cert, String host, int port) {
      final fingerprint = hashBytes(cert.der);
      return fingerprint == expectedFingerprint;
    };
}
