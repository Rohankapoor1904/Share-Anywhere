/// Root providers wiring the engine into the widget tree.
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/node.dart';
import '../core/platform/radio_adapter.dart';
import '../core/protocol/models.dart';
import '../core/session/pairing_manager.dart';
import '../core/session/trust_store.dart';
import '../platform/create_adapter.dart';

/// The device's display name; later this becomes user-editable.
final deviceNameProvider = StateProvider<String>((ref) => 'My Device');

const _storagePathKey = 'download_directory';

final storagePathProvider = FutureProvider<String?>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString(_storagePathKey);
});

/// Where received files land and where the trust store is persisted.
///
/// Falls back to a temp directory when the platform cannot report a documents
/// directory (e.g. a headless Linux session without XDG user dirs).
final storageDirProvider = FutureProvider<Directory>((ref) async {
  final configuredPath = await ref.watch(storagePathProvider.future);
  if (configuredPath != null && configuredPath.trim().isNotEmpty) {
    final configured = Directory(configuredPath);
    await configured.create(recursive: true);
    return configured;
  }
  Directory base;
  try {
    base = await getApplicationDocumentsDirectory();
  } on MissingPlatformDirectoryException {
    base = Directory.systemTemp;
  }
  final dir = Directory('${base.path}${Platform.pathSeparator}LocalShare');
  await dir.create(recursive: true);
  return dir;
});

Future<void> saveStorageDirectory(WidgetRef ref, String path) async {
  final directory = Directory(path);
  await directory.create(recursive: true);
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_storagePathKey, directory.path);
  ref.invalidate(storagePathProvider);
  ref.invalidate(storageDirProvider);
  ref.invalidate(localShareNodeProvider);
  ref.invalidate(nodeStartedProvider);
  ref.invalidate(peersProvider);
  ref.invalidate(capabilitiesProvider);
}

class PairingSettingsController extends Notifier<PairingSettings> {
  static const _trustedKey = 'pairing_auto_accept_trusted';
  static const _allKey = 'pairing_auto_accept_all';

  @override
  PairingSettings build() {
    final settings = PairingSettings();
    unawaited(_load(settings));
    return settings;
  }

  Future<void> _load(PairingSettings settings) async {
    final prefs = await SharedPreferences.getInstance();
    final autoAcceptTrusted = prefs.getBool(_trustedKey) ?? true;
    final autoAcceptAll = prefs.getBool(_allKey) ?? false;
    settings.autoAcceptTrusted = autoAcceptTrusted;
    settings.autoAcceptAll = autoAcceptAll;
    state = PairingSettings(
      autoAcceptTrusted: autoAcceptTrusted,
      autoAcceptAll: autoAcceptAll,
    );
  }

  Future<void> setAutoAcceptTrusted(bool value) async {
    state.autoAcceptTrusted = value;
    state = PairingSettings(
      autoAcceptTrusted: value,
      autoAcceptAll: state.autoAcceptAll,
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_trustedKey, value);
  }

  Future<void> setAutoAcceptAll(bool value) async {
    state.autoAcceptAll = value;
    state = PairingSettings(
      autoAcceptTrusted: state.autoAcceptTrusted,
      autoAcceptAll: value,
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_allKey, value);
  }
}

final pairingSettingsProvider =
    NotifierProvider<PairingSettingsController, PairingSettings>(
  PairingSettingsController.new,
);

/// The engine node, constructed once the storage directory is known.
final localShareNodeProvider = FutureProvider<LocalShareNode>((ref) async {
  final dir = await ref.watch(storageDirProvider.future);
  final initialName = ref.read(deviceNameProvider);
  final initialPairingSettings = ref.read(pairingSettingsProvider);
  final node = LocalShareNode(
    config: NodeConfig(
      displayName: initialName,
      downloadDirectory: dir,
    ),
    adapter: createRadioAdapter(),
    trustPersistence: FileTrustPersistence(
      File('${dir.path}${Platform.pathSeparator}trust.json'),
    ),
    pairingSettings: initialPairingSettings,
  );
  ref.listen(deviceNameProvider, (_, next) {
    node.setDisplayName(next);
  });
  ref.listen(pairingSettingsProvider, (_, next) {
    node.pairingManager.settings.autoAcceptTrusted = next.autoAcceptTrusted;
    node.pairingManager.settings.autoAcceptAll = next.autoAcceptAll;
  });
  ref.onDispose(() => unawaited(node.stop()));
  return node;
});

/// The node after it has started advertising, ready to send/receive.
final nodeStartedProvider = FutureProvider<LocalShareNode>((ref) async {
  final node = await ref.watch(localShareNodeProvider.future);
  await node.start();
  await node.startBlePresence();
  return node;
});

/// Live list of nearby peers.
final peersProvider = StreamProvider<List<DeviceInfo>>((ref) async* {
  final node = await ref.watch(nodeStartedProvider.future);
  yield node.peers.toList();
  await for (final list in node.peerStream) {
    yield list;
  }
});

/// Radio capabilities, used to hide unsupported actions.
final capabilitiesProvider = FutureProvider<RadioCapabilities>((ref) async {
  final node = await ref.watch(localShareNodeProvider.future);
  return node.adapter.capabilities();
});

/// This device's LAN identity for the Devices tab pairing card.
///
/// Addresses exclude loopback aliases that are useless to a peer; the port
/// and fingerprint are what a sender needs for manual connect + PIN trust.
final myDeviceInfoProvider =
    FutureProvider<({List<String> addresses, int port, String fingerprint})>(
        (ref) async {
  final node = await ref.watch(nodeStartedProvider.future);
  final ips = (await node.getLocalIpAddresses())
      .where((ip) => ip != '0.0.0.0' && ip != 'localhost')
      .toList()
    ..sort();
  return (addresses: ips, port: node.port, fingerprint: node.fingerprint);
});
