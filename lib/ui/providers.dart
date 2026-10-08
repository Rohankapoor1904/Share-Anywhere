/// Root providers wiring the engine into the widget tree.
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../core/node.dart';
import '../core/platform/radio_adapter.dart';
import '../core/protocol/models.dart';
import '../core/session/trust_store.dart';
import '../platform/create_adapter.dart';

/// The device's display name; later this becomes user-editable.
final deviceNameProvider = StateProvider<String>((ref) => 'My Device');

/// Where received files land and where the trust store is persisted.
///
/// Falls back to a temp directory when the platform cannot report a documents
/// directory (e.g. a headless Linux session without XDG user dirs).
final storageDirProvider = FutureProvider<Directory>((ref) async {
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

/// The engine node, constructed once the storage directory is known.
final localShareNodeProvider = FutureProvider<LocalShareNode>((ref) async {
  final dir = await ref.watch(storageDirProvider.future);
  final node = LocalShareNode(
    config: NodeConfig(
      displayName: ref.read(deviceNameProvider),
      downloadDirectory: dir,
    ),
    adapter: createRadioAdapter(),
    trustPersistence: FileTrustPersistence(
      File('${dir.path}${Platform.pathSeparator}trust.json'),
    ),
  );
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
  await for (final _ in node.events) {
    yield node.peers.toList();
  }
});

/// Radio capabilities, used to hide unsupported actions.
final capabilitiesProvider = FutureProvider<RadioCapabilities>((ref) async {
  final node = await ref.watch(localShareNodeProvider.future);
  return node.adapter.capabilities();
});
