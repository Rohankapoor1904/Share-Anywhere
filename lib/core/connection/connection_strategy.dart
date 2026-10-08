/// Chooses how to reach a peer.
///
/// Order of preference:
///   1. Same LAN  -> connect straight to the peer's IP (fastest, no setup).
///   2. Wi-Fi Direct / SoftAP -> sender creates a group, receiver joins.
///
/// The strategy is deliberately explicit so the UI can show *why* a fallback
/// was taken, and so platforms lacking a capability are handled gracefully.
library;

import '../platform/radio_adapter.dart';
import '../protocol/models.dart';
import '../util/errors.dart';

enum ConnectionMode { lan, wifiDirect, softAp, unavailable }

/// The outcome of planning a connection.
class ConnectionPlan {
  const ConnectionPlan({
    required this.mode,
    this.address,
    this.hotspot,
    this.note,
  });

  final ConnectionMode mode;

  /// Direct dial address (LAN / after hotspot join).
  final String? address;

  /// Credentials the receiver must use when [mode] is softAp/wifiDirect.
  final HotspotCredentials? hotspot;
  final String? note;
}

class ConnectionStrategy {
  ConnectionStrategy(this.adapter);

  final RadioAdapter adapter;

  /// Decide how to connect to [peer].
  ///
  /// [assumeSameLan] is set by the discovery layer when both devices answered on
  /// the local subnet. When false, we attempt a radio-mediated path.
  Future<ConnectionPlan> plan(DeviceInfo peer, {required bool assumeSameLan}) async {
    final caps = await adapter.capabilities();

    if (assumeSameLan && peer.bestAddress != null) {
      return ConnectionPlan(mode: ConnectionMode.lan, address: peer.bestAddress);
    }

    if (caps.wifiDirect) {
      return const ConnectionPlan(
        mode: ConnectionMode.wifiDirect,
        note: 'same subnet not detected; using Wi-Fi Direct',
      );
    }

    if (caps.softApCreate) {
      final hotspot = await adapter.createHotspot();
      return ConnectionPlan(
        mode: ConnectionMode.softAp,
        hotspot: hotspot,
        note: 'created a temporary hotspot for the transfer',
      );
    }

    if (peer.bestAddress != null) {
      // Last resort: the peer has an address (maybe a VPN or routed subnet).
      return ConnectionPlan(
        mode: ConnectionMode.lan,
        address: peer.bestAddress,
        note: 'no P2P radio available; trying the known address',
      );
    }

    return const ConnectionPlan(
      mode: ConnectionMode.unavailable,
      note: 'no shared network and no P2P radio on this device',
    );
  }

  /// On the receiver side, join the group the sender set up.
  Future<void> join(ConnectionPlan plan) async {
    switch (plan.mode) {
      case ConnectionMode.softAp:
        if (plan.hotspot == null) {
          throw const CapabilityUnavailable('missing hotspot credentials');
        }
        await adapter.joinHotspot(plan.hotspot!);
      case ConnectionMode.wifiDirect:
        await adapter.connectWifiDirect(plan.address ?? '');
      case ConnectionMode.lan:
      case ConnectionMode.unavailable:
        break;
    }
  }
}
