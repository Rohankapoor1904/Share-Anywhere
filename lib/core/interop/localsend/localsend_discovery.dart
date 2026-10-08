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
import '../../protocol/protocol.dart';
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

  /// Known local IP addresses of this device to filter out loopback/self-sightings.
  Set<String> ownAddresses = const {};

  /// Our compat listener port (where peers' `register` callbacks arrive).
  int callbackPort = kLocalSendPort;

  final StreamController<LocalSendSighting> _sightings =
      StreamController.broadcast();
  RawDatagramSocket? _socket;
  Timer? _announcer;
  Timer? _subnetScanner;

  Stream<LocalSendSighting> get sightings => _sightings.stream;

  Future<void> start() async {
    try {
      final canReusePort = !Platform.isWindows;
      final socket = await RawDatagramSocket.bind(
        InternetAddress.anyIPv4,
        port,
        reuseAddress: true,
        reusePort: canReusePort,
      );
      socket.broadcastEnabled = true;
      socket.multicastHops = 1;
      try {
        socket.joinMulticast(InternetAddress(kLocalSendMulticastAddress));
      } on Object {
        // Some networks/containers forbid multicast joins; announcement still works.
      }
      // Join multicast on all available network interfaces (WiFi, Hotspot AP)
      try {
        final interfaces = await NetworkInterface.list(
          includeLinkLocal: false,
          type: InternetAddressType.IPv4,
        );
        for (final iface in interfaces) {
          try {
            socket.joinMulticast(
              InternetAddress(kLocalSendMulticastAddress),
              iface,
            );
          } catch (_) {
            // Ignore interface join failures.
          }
        }
      } catch (_) {
        // Ignore interface list failures.
      }

      socket.listen(_onEvent);
      _socket = socket;
    } on SocketException {
      // Port busy (another LocalSend instance). Discovery degrades to mDNS/BLE.
      _socket = null;
    }
    // Burst of 3 rapid announces so we're found quickly on first start.
    announce();
    unawaited(Future<void>.delayed(const Duration(milliseconds: 600))
        .then((_) => announce()));
    unawaited(Future<void>.delayed(const Duration(milliseconds: 1800))
        .then((_) => announce()));
    // Periodic re-announce every 4 seconds so new peers find us quickly.
    _announcer = Timer.periodic(const Duration(seconds: 4), (_) => announce());
    // Active subnet probe for mobile hotspot / AP isolation fallback
    unawaited(Future<void>.delayed(const Duration(milliseconds: 1000))
        .then((_) => probeSubnet()));
    _subnetScanner =
        Timer.periodic(const Duration(seconds: 15), (_) => probeSubnet());
  }

  /// Broadcast our identity to multicast, global broadcast and subnet broadcast.
  void announce() {
    _send({...?ownInfo?.toJson(), 'announce': true});
  }

  /// Send the fallback unicast reply the spec allows.
  void replyUnicast(InternetAddress address, LocalSendInfo info) {
    if (ownAddresses.contains(address.address) ||
        address.address == '127.0.0.1') {
      return;
    }
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
          if (ip.startsWith('169.254.') || ip == '127.0.0.1') continue;
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

    var senderAddress = datagram.address.address;
    if (senderAddress.startsWith('::ffff:')) {
      senderAddress = senderAddress.substring(7);
    }
    if (senderAddress == '127.0.0.1' || ownAddresses.contains(senderAddress)) {
      return;
    }

    final Map<String, Object?> json;
    try {
      json = (jsonDecode(utf8.decode(datagram.data)) as Map)
          .cast<String, Object?>();
    } on Object {
      return;
    }
    final info = LocalSendInfo.fromJson(json);
    // Ignore our own datagrams (compare by fingerprint when available).
    if (info.fingerprint.isNotEmpty &&
        info.fingerprint == ownInfo?.fingerprint) {
      return;
    }
    if ((json['announce'] as bool?) ?? false) {
      // A peer is announcing: emit them immediately, reply via UDP unicast,
      // and send an HTTP /register post (as per LocalSend spec) for reliable TCP handshake.
      _emit(info, senderAddress, json);
      replyUnicast(datagram.address, ownInfo ?? _defaultInfo);
      unawaited(_replyHttpRegister(senderAddress, info.port));
    } else {
      // A unicast reply (announce=false) — emit as a discovered peer.
      _emit(info, senderAddress, json);
    }
  }

  Future<void> _replyHttpRegister(String address, int peerPort) async {
    var targetAddress = address;
    if (targetAddress.startsWith('::ffff:')) {
      targetAddress = targetAddress.substring(7);
    }
    if (ownAddresses.contains(targetAddress) || targetAddress == '127.0.0.1')
      return;
    try {
      final client = HttpClient()
        ..connectionTimeout = const Duration(milliseconds: 1500);
      final uri = Uri.parse(
          'http://$targetAddress:$peerPort$kLocalSendApiPrefix/register');
      final req = await client.postUrl(uri);
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode((ownInfo ?? _defaultInfo).toJson()));
      final res = await req.close();
      await res.drain<void>();
      client.close(force: true);
    } catch (_) {}
  }

  /// Accept a peer learned via its HTTP `register` callback.
  void ingestRegister(Map<String, Object?> json, String address) {
    var cleanAddress = address;
    if (cleanAddress.startsWith('::ffff:')) {
      cleanAddress = cleanAddress.substring(7);
    }
    if (ownAddresses.contains(cleanAddress) || cleanAddress == '127.0.0.1')
      return;
    final info = LocalSendInfo.fromJson(json);
    if (info.fingerprint.isNotEmpty &&
        info.fingerprint == ownInfo?.fingerprint) {
      return;
    }
    _emit(info, cleanAddress, json);
  }

  void _emit(LocalSendInfo info, String address, Map<String, Object?> json) {
    if (_sightings.isClosed) return;
    var cleanAddress = address;
    if (cleanAddress.startsWith('::ffff:')) {
      cleanAddress = cleanAddress.substring(7);
    }
    if (ownAddresses.contains(cleanAddress) || cleanAddress == '127.0.0.1')
      return;
    if (info.fingerprint.isNotEmpty &&
        info.fingerprint == ownInfo?.fingerprint) {
      return;
    }

    final port = (json['port'] as num?)?.toInt() ?? kLocalSendPort;
    _sightings.add(LocalSendSighting(
      device: DeviceInfo(
        deviceId:
            info.fingerprint.isEmpty ? '$cleanAddress:$port' : info.fingerprint,
        displayName: info.alias,
        fingerprint: info.fingerprint,
        port: port,
        platform: info.protocol == 'https' ? 'localsend-https' : 'localsend',
        addresses: [cleanAddress],
        discoveredVia: DiscoveryChannel.mdns,
      ),
      info: info,
      address: cleanAddress,
    ));
  }

  LocalSendInfo get _defaultInfo => LocalSendInfo(
        alias: 'LocalShare',
        version: kLocalSendVersion,
        fingerprint: '',
        port: callbackPort,
        protocol: 'http',
      );

  /// Actively probes the local subnet via HTTP /info and /register in case UDP multicast/broadcast
  /// is blocked by the AP/hotspot router (AP isolation).
  Future<void> probeSubnet() async {
    final primarySubnets = <String>{};
    final fallbackSubnets = <String>{};

    try {
      final interfaces = await NetworkInterface.list(
        includeLinkLocal: false,
        type: InternetAddressType.IPv4,
      );
      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          final ip = addr.address;
          if (ip == '127.0.0.1' || ip.startsWith('169.254.')) continue;
          final parts = ip.split('.');
          if (parts.length == 4) {
            primarySubnets.add('${parts[0]}.${parts[1]}.${parts[2]}');
          }
        }
      }
    } catch (_) {}

    // Fallback hotspot subnets only if not already discovered
    fallbackSubnets
        .addAll(['192.168.43', '192.168.49', '172.20.10', '192.168.137']);
    final subnetsToScan = [
      ...primarySubnets,
      ...fallbackSubnets.where((s) => !primarySubnets.contains(s)),
    ];

    final client = HttpClient()
      ..connectionTimeout = const Duration(milliseconds: 400);

    for (final prefix in subnetsToScan) {
      final isHotspotSubnet = prefix == '192.168.43' ||
          prefix == '192.168.49' ||
          prefix == '172.20.10' ||
          prefix == '192.168.137';
      final maxHost = isHotspotSubnet ? 35 : 254;

      final hosts = <int>[];
      for (var i = 1; i <= maxHost; i++) {
        hosts.add(i);
      }

      const batchSize = 50;
      for (var i = 0; i < hosts.length; i += batchSize) {
        final batch = hosts.skip(i).take(batchSize);
        await Future.wait(batch.map((host) async {
          final targetIp = '$prefix.$host';
          if (ownAddresses.contains(targetIp)) return;
          await _probeHost(client, targetIp);
        }));
      }
    }
    client.close(force: true);
  }

  Future<void> _probeHost(HttpClient client, String targetIp) async {
    for (final targetPort in [port, kDefaultPort]) {
      try {
        final uri =
            Uri.parse('http://$targetIp:$targetPort$kLocalSendApiPrefix/info');
        final req = await client.getUrl(uri);
        final res = await req.close();
        if (res.statusCode == 200) {
          final body = await utf8.decoder.bind(res).join();
          final json = (jsonDecode(body) as Map).cast<String, Object?>();
          final info = LocalSendInfo.fromJson(json);
          if (info.fingerprint.isNotEmpty &&
              info.fingerprint == ownInfo?.fingerprint) {
            return;
          }
          _emit(info, targetIp, json);

          // Send register back so peer discovers us simultaneously
          try {
            final regUri = Uri.parse(
                'http://$targetIp:$targetPort$kLocalSendApiPrefix/register');
            final regReq = await client.postUrl(regUri);
            regReq.headers.contentType = ContentType.json;
            regReq.write(jsonEncode((ownInfo ?? _defaultInfo).toJson()));
            final regRes = await regReq.close();
            await regRes.drain<void>();
          } catch (_) {}
          break;
        }
      } catch (_) {}
    }
  }

  Future<void> dispose() async {
    _announcer?.cancel();
    _announcer = null;
    _subnetScanner?.cancel();
    _subnetScanner = null;
    await _sightings.close();
    _socket?.close();
    _socket = null;
  }
}
