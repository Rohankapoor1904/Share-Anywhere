/// Pairing + acceptance policy.
///
/// Decides whether an incoming session is auto-accepted, rejected, or requires
/// a PIN. Known (trusted) peers are auto-accepted; unknown peers must prove
/// knowledge of the PIN shown to the user. Timing-safe comparison prevents the
/// PIN from leaking.
library;

import '../crypto/pin.dart';
import '../protocol/models.dart';
import '../transport/transfer_server.dart';
import '../util/errors.dart';
import 'trust_store.dart';

/// Settings that steer the accept policy.
class PairingSettings {
  PairingSettings({
    this.autoAcceptTrusted = true,
    this.autoAcceptAll = false,
    this.pinLength = 6,
    this.maxPinAttempts = 3,
  });

  /// Auto-accept peers we already trust.
  bool autoAcceptTrusted;

  /// Danger: auto-accept anyone (no PIN). Off by default.
  bool autoAcceptAll;
  int pinLength;
  int maxPinAttempts;
}

/// Manages the PIN challenge lifecycle for incoming requests.
class PairingManager {
  PairingManager({
    required this.trustStore,
    PairingSettings? settings,
  }) : settings = settings ?? PairingSettings();

  final TrustStore trustStore;
  final PairingSettings settings;

  /// Active challenges: deviceId -> (pin, attempts, expiresAt).
  final Map<String, _Challenge> _challenges = {};

  /// Callback the UI sets to show a PIN prompt to the user.
  void Function(String deviceId, String displayName, String pin)? onChallenge;

  /// Evaluate an incoming request against policy.
  ///
  /// Returns a decision for the transport layer. When a PIN is required and the
  /// caller supplied the wrong (or no) PIN, we re-issue a challenge.
  SessionDecision evaluate(SessionRequest request) {
    if (settings.autoAcceptAll) {
      return const SessionDecision.accept();
    }
    if (trustStore.isTrusted(request.fingerprint)) {
      if (settings.autoAcceptTrusted) return const SessionDecision.accept();
    }

    // Unknown peer (or trusted-but-manual): PIN gate.
    final challenge = _challengeFor(request.deviceId);
    if (request.pin == null || request.pin!.isEmpty) {
      onChallenge?.call(request.deviceId, request.displayName, challenge.pin);
      return const SessionDecision.challenge();
    }

    if (challenge.expired) {
      _challenges.remove(request.deviceId);
      return const SessionDecision.reject('pin_expired');
    }
    if (challenge.attempts >= settings.maxPinAttempts) {
      _challenges.remove(request.deviceId);
      return const SessionDecision.reject('too_many_attempts');
    }
    challenge.attempts++;

    if (!constantTimeEquals(challenge.pin, request.pin!)) {
      return const SessionDecision.challenge();
    }
    return const SessionDecision.accept();
  }

  _Challenge _challengeFor(String deviceId) {
    final existing = _challenges[deviceId];
    if (existing != null && !existing.expired) return existing;
    final challenge = _Challenge(
      pin: generatePin(length: settings.pinLength),
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
    );
    _challenges[deviceId] = challenge;
    return challenge;
  }

  /// The PIN currently shown for a device (regenerating if needed).
  String currentPin(String deviceId) => _challengeFor(deviceId).pin;

  void clearChallenge(String deviceId) => _challenges.remove(deviceId);

  /// Verify a PIN typed out-of-band (e.g. delivered over BLE control channel).
  bool verifyPin(String deviceId, String pin) {
    final challenge = _challenges[deviceId];
    if (challenge == null || challenge.expired) {
      throw PinMismatch('no active PIN challenge for this device');
    }
    if (!constantTimeEquals(challenge.pin, pin)) {
      throw const PinMismatch('incorrect PIN');
    }
    return true;
  }
}

class _Challenge {
  _Challenge({required this.pin, required this.expiresAt});
  final String pin;
  final DateTime expiresAt;
  int attempts = 0;

  bool get expired => DateTime.now().isAfter(expiresAt);
}
