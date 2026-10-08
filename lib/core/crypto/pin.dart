/// PIN generation and verification for the "accept from unknown device" gate.
///
/// The PIN is displayed on the receiver and must be supplied by the sender.
/// Comparison is constant-time to avoid leaking the PIN through timing.
library;

import 'dart:math';

/// A cryptographically-seeded source of PINs and tokens.
final Random _secureRandom = Random.secure();

/// Generate an [length]-digit numeric PIN (leading zeros allowed).
String generatePin({int length = 6}) {
  final buffer = StringBuffer();
  for (var i = 0; i < length; i++) {
    buffer.write(_secureRandom.nextInt(10));
  }
  return buffer.toString();
}

/// Generate a URL-safe random token used for session/resume auth.
String generateToken({int byteLength = 24}) {
  const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  final buffer = StringBuffer();
  for (var i = 0; i < byteLength; i++) {
    buffer.write(alphabet[_secureRandom.nextInt(alphabet.length)]);
  }
  return buffer.toString();
}

/// Constant-time string equality. Returns false if lengths differ.
bool constantTimeEquals(String a, String b) {
  if (a.length != b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
  }
  return diff == 0;
}
