/// LocalSend multicast & broadcast discovery (protocol §3.1).
///
/// Announcements are JSON datagrams sent to `224.0.0.167:53317`, `255.255.255.255`,
/// and local interface subnet broadcast addresses. Peers answer with a unicast
/// datagram or an HTTP `register` callback.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../../protocol/models.dart';
import 'localsend_models.dart';

/// A discovered LocalSend peer plus the protocol details we need to dial it.
class LocalSendSighting {
  const LocalSendSighting({
    required this.device,
    required this.info,
    required this.address,
  });

  final DeviceInfo device;
  final LocalSendInfo info;
  final String address;

  bool get isHttps => info.protocol == 'https';
}

class LocalSendDiscovery {
  LocalSendDiscovery({this.port = kLocalSendPort});

  final int port;

  /// Our own announced info, so peers can reply to us.
  LocalSendInfo? ownInfo;

  /// Our compat listener port (where peers' `register` callbacks arrive).
  int callbackPort = kLocalSendPort;

  final StreamController<LocalSendSighting> _sightings =
      StreamController.broadcast();
  RawDatagramSocket? _socket;
  Timer? _announcer;

  Stream<LocalSendSighting> get sightings => _sightings.stream;

  Future<void> start() async {
    try {
      final socket =
          await RawDatagramSocket.bind(InternetAddress.anyIPv4, port);
      socket.broadcastEnabled = true;
      socket.multicastHops = 1;
      try {
        socket.joinMulticast(InternetAddress(kLocalSendMulticastAddress));
      } on Object {
        // Some networks/containers forbid multicast joins; announcement still works.
      }
      socket.listen(_onEvent);
      _socket = socket;
    } on SocketException {
      // Port busy (another LocalSend instance). Discovery degrades to mDNS/BLE.
      _socket = null;
    }
    announce();
    _announcer = Timer.periodic(const Duration(seconds: 4), (_) => announce());
  }

  /// Broadcast our identity to multicast, global broadcast and subnet broadcast.
  void announce() {
    _send({...?ownInfo?.toJson(), 'announce': true});
  }

  /// Send the fallback unicast reply the spec allows.
  void replyUnicast(InternetAddress address, LocalSendInfo info) {
    final datagram =
        utf8.encode(jsonEncode({...info.toJson(), 'announce': false}));
    try {
      _socket?.send(datagram, address, port);
    } catch (_) {}
  }

  void _send(Map<String, Object?> payload) {
    final socket = _socket;
    if (socket == null) return;
    final datagram = utf8.encode(jsonEncode(payload));

    // 1. Multicast
    try {
      socket.send(datagram, InternetAddress(kLocalSendMulticastAddress), port);
    } catch (_) {}

    // 2. Global Broadcast
    try {
      socket.send(datagram, InternetAddress('255.255.255.255'), port);
    } catch (_) {}

    // 3. Interface Subnet Broadcasts
    _sendInterfaceBroadcasts(socket, datagram);
  }

  Future<void> _sendInterfaceBroadcasts(
      RawDatagramSocket socket, List<int> datagram) async {
    try {
      final interfaces = await NetworkInterface.list(
        includeLinkLocal: false,
        type: InternetAddressType.IPv4,
      );
      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          final ip = addr.address;
          final parts = ip.split('.');
          if (parts.length == 4) {
            final subnetBroadcast = '${parts[0]}.${parts[1]}.${parts[2]}.255';
            try {
              socket.send(datagram, InternetAddress(subnetBroadcast), port);
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }

  void _onEvent(RawSocketEvent event) {
    if (event != RawSocketEvent.read) return;
    final datagram = _socket?.receive();
    if (datagram == null) return;
    final Map<String, Object?> json;
    try {
      json = (jsonDecode(utf8.decode(datagram.data)) as Map)
          .cast<String, Object?>();
    } on Object {
      return;
    }
    // Ignore our own announcement: announce=true with our fingerprint.
    final info = LocalSendInfo.fromJson(json);
    if (info.fingerprint.isNotEmpty &&
        info.fingerprint == ownInfo?.fingerprint) {
      return;
    }
    if ((json['announce'] as bool?) ?? false) {
      // A peer is announcing; answer so it learns about us.
      replyUnicast(datagram.address, ownInfo ?? _defaultInfo);
      return;
    }
    _emit(info, datagram.address.address, json);
  }

  /// Accept a peer learned via its HTTP `register` callback.
  void ingestRegister(Map<String, Object?> json, String address) {
    _emit(LocalSendInfo.fromJson(json), address, json);
  }

  void _emit(LocalSendInfo info, String address, Map<String, Object?> json) {
    final port = (json['port'] as num?)?.toInt() ?? kLocalSendPort;
    _sightings.add(LocalSendSighting(
      device: DeviceInfo(
        deviceId:
            info.fingerprint.isEmpty ? '$address:$port' : info.fingerprint,
        displayName: info.alias,
        fingerprint: info.fingerprint,
        port: port,
        platform: info.protocol == 'https' ? 'localsend-https' : 'localsend',
        addresses: [address],
        discoveredVia: DiscoveryChannel.mdns,
      ),
      info: info,
      address: address,
    ));
  }

  LocalSendInfo get _defaultInfo => LocalSendInfo(
        alias: 'LocalShare',
        version: kLocalSendVersion,
        fingerprint: '',
        port: callbackPort,
        protocol: 'http',
      );

  Future<void> dispose() async {
    _announcer?.cancel();
    _announcer = null;
    await _sightings.close();
    _socket?.close();
    _socket = null;
  }
}
