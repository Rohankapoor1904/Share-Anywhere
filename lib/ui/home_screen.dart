/// The adaptive home screen: radar-first on phones/TV, multi-column on desktop.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/node.dart';
import '../core/protocol/models.dart';
import 'providers.dart';
import 'receive_controller.dart';
import 'send_controller.dart';
import 'theme.dart';
import 'widgets/dialogs.dart';
import 'widgets/radar_view.dart';
import 'widgets/tiles.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  StreamSubscription<EngineEvent>? _sub;

  @override
  void initState() {
    super.initState();
    _listenToEngine();
  }

  Future<void> _listenToEngine() async {
    final node = await ref.read(nodeStartedProvider.future);
    _sub = node.events.listen(_handleEvent);
  }

  void _handleEvent(EngineEvent event) {
    final send = ref.read(sendControllerProvider.notifier);
    switch (event) {
      case IncomingSessionRequested(:final transfer):
        unawaited(_promptIncoming(transfer));
      case ReceiveProgress(:final progress):
        ref.read(receiveProgressProvider.notifier).update(progress);
      case SendProgress(:final fileId, :final progress):
        send.applyProgress(fileId, progress);
      case SendFinished(:final fileId):
        send.markDone(fileId);
      case SendFailed(:final fileId, :final error):
        send.markFailed(fileId, error);
      case FileReceived():
      case EngineReady():
        break;
    }
  }

  Future<void> _promptIncoming(IncomingTransfer transfer) async {
    final accepted = await showIncomingRequestDialog(
      context,
      fromDevice: transfer.request.displayName,
      files: transfer.files,
    );
    if (!mounted) return;
    final node = await ref.read(nodeStartedProvider.future);
    if (accepted) {
      await node.approve(transfer);
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final isWide = size.width >= 900;

    return Scaffold(
      appBar: AppBar(
        title: const Text('LocalShare'),
        actions: [
          IconButton(
            tooltip: 'Settings',
            onPressed: () => _showSettings(context),
            icon: const Icon(Icons.settings_outlined),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => ref.read(sendControllerProvider.notifier).pickFiles(),
        icon: const Icon(Icons.add),
        label: const Text('Add files'),
      ),
      body: SafeArea(
        child: isWide ? _desktopLayout() : _mobileLayout(),
      ),
    );
  }

  Widget _mobileLayout() {
    return Column(
      children: [
        const SizedBox(height: 8),
        _radar(flex: 5),
        _peerStrip(),
        const Divider(height: 1),
        Expanded(child: _fileSection()),
      ],
    );
  }

  Widget _desktopLayout() {
    return Row(
      children: [
        Expanded(flex: 3, child: _radar()),
        const VerticalDivider(width: 1),
        Expanded(
          flex: 2,
          child: Column(
            children: [
              Expanded(child: _fileSection()),
            ],
          ),
        ),
      ],
    );
  }

  Widget _radar({int flex = 1}) {
    final peers = ref.watch(peersProvider).valueOrNull ?? const <DeviceInfo>[];
    return Expanded(
      flex: flex,
      child: Center(
        child: RadarView(
          size: 320,
          devices: peers,
          active: peers.isEmpty,
          onDeviceTap: _sendTo,
        ),
      ),
    );
  }

  Widget _peerStrip() {
    final peers = ref.watch(peersProvider).valueOrNull ?? const <DeviceInfo>[];
    if (peers.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Text(
          'Looking for nearby devices…',
          style: TextStyle(color: AppColors.textMuted),
        ),
      );
    }
    return SizedBox(
      height: 64,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: peers.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) => ActionChip(
          avatar: const Icon(Icons.devices, size: 16),
          label: Text(peers[i].displayName),
          onPressed: () => _sendTo(peers[i]),
        ),
      ),
    );
  }

  Widget _fileSection() {
    final send = ref.watch(sendControllerProvider);
    final files = send.files;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Selected', style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              if (files.isNotEmpty)
                TextButton(
                  onPressed: () => ref.read(sendControllerProvider.notifier).clear(),
                  child: const Text('Clear'),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Expanded(
            child: files.isEmpty
                ? const _EmptyState()
                : ListView.builder(
                    itemCount: files.length,
                    itemBuilder: (context, i) {
                      final file = files[i];
                      return ListTile(
                        leading: const Icon(Icons.insert_drive_file_outlined),
                        title: Text(file.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
                        trailing: IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () =>
                              ref.read(sendControllerProvider.notifier).removeFile(file),
                        ),
                      );
                    },
                  ),
          ),
          if (send.jobs.isNotEmpty) ...[
            const Divider(),
            SizedBox(
              height: 120,
              child: ListView(
                children: [
                  for (final job in send.jobs.values)
                    TransferTile(
                      fileName: job.fileName,
                      transferred: job.transferred,
                      total: job.total,
                      speed: job.bytesPerSecond,
                      status: job.status,
                    ),
                ],
              ),
            ),
          ],
          if (files.isNotEmpty)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: send.busy ? null : _choosePeerAndSend,
                icon: const Icon(Icons.send),
                label: Text('Send ${files.length} file(s)'),
              ),
            ),
          if (send.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(send.error!, style: const TextStyle(color: AppColors.danger)),
            ),
        ],
      ),
    );
  }

  Future<void> _sendTo(DeviceInfo peer) async {
    await ref.read(sendControllerProvider.notifier).sendTo(peer);
  }

  Future<void> _choosePeerAndSend() async {
    final peers = ref.read(peersProvider).valueOrNull ?? const <DeviceInfo>[];
    if (peers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No nearby devices yet.')),
      );
      return;
    }
    final peer = await showDevicePicker(context, peers);
    if (peer != null) await _sendTo(peer);
  }

  void _showSettings(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => const _SettingsSheet(),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_upload_outlined, size: 56, color: AppColors.textMuted.withValues(alpha: 0.6)),
          const SizedBox(height: 12),
          const Text('Add files to share them with nearby devices'),
          const SizedBox(height: 4),
          const Text('Everything stays on your local network', style: TextStyle(fontSize: 12)),
        ],
      ),
    );
  }
}

class _SettingsSheet extends ConsumerWidget {
  const _SettingsSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = ref.watch(deviceNameProvider);
    final caps = ref.watch(capabilitiesProvider).valueOrNull;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Device name', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            TextFormField(
              initialValue: name,
              decoration: const InputDecoration(border: OutlineInputBorder()),
              onChanged: (value) => ref.read(deviceNameProvider.notifier).state = value,
            ),
            const SizedBox(height: 16),
            if (caps != null) ...[
              Text('Capabilities', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final entry in caps.toJson().entries)
                    Chip(
                      label: Text('${entry.key}: ${entry.value ? "yes" : "no"}'),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
