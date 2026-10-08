/// The adaptive home screen: radar-first on phones/TV, multi-column on desktop.
library;

import 'dart:async';
import 'dart:io';

import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  bool _dragging = false;

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
    final isDesktop =
        !kIsWeb && (Platform.isLinux || Platform.isWindows || Platform.isMacOS);
    final myDeviceName = ref.watch(deviceNameProvider);

    final body = SafeArea(
      child: isWide ? _desktopLayout() : _mobileLayout(),
    );

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyS, control: true):
            _choosePeerAndSend,
        const SingleActivator(LogicalKeyboardKey.keyA, control: true):
            _addFiles,
        const SingleActivator(LogicalKeyboardKey.escape): () =>
            ref.read(sendControllerProvider.notifier).clear(),
        const SingleActivator(LogicalKeyboardKey.select): _choosePeerAndSend,
      },
      child: Scaffold(
        appBar: AppBar(
          titleSpacing: 20,
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  gradient: AppColors.primaryGradient,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.accent.withValues(alpha: 0.3),
                      blurRadius: 10,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.share_rounded,
                  size: 18,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 12),
              const Text('LocalShare'),
              const Spacer(),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.surfaceHigh,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: AppColors.surfaceBorder.withValues(alpha: 0.6),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: AppColors.success,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      myDeviceName,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: IconButton(
                tooltip: 'Settings',
                onPressed: () => _showSettings(context),
                icon: const Icon(Icons.settings_outlined),
              ),
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _addFiles,
          icon: const Icon(Icons.add_rounded),
          label: const Text('Add files'),
          elevation: 4,
          backgroundColor: AppColors.accent,
          foregroundColor: AppColors.background,
        ),
        body: isDesktop
            ? DropTarget(
                onDragEntered: (_) => setState(() => _dragging = true),
                onDragExited: (_) => setState(() => _dragging = false),
                onDragDone: (details) {
                  setState(() => _dragging = false);
                  _addDroppedFiles(details.files.map((f) => f.path).toList());
                },
                child: _dropOverlay(body),
              )
            : body,
      ),
    );
  }

  Widget _dropOverlay(Widget child) {
    return Stack(
      children: [
        child,
        if (_dragging)
          Positioned.fill(
            child: IgnorePointer(
              child: Container(
                color: AppColors.background.withValues(alpha: 0.9),
                alignment: Alignment.center,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 48, vertical: 36),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: AppColors.accent,
                      width: 2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.accent.withValues(alpha: 0.3),
                        blurRadius: 30,
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppColors.accent.withValues(alpha: 0.15),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.file_download_outlined,
                          size: 56,
                          color: AppColors.accent,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Drop files to share',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Files will be added to your transfer list',
                        style:
                            TextStyle(color: AppColors.textMuted, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  void _addFiles() => ref.read(sendControllerProvider.notifier).pickFiles();

  void _addDroppedFiles(List<String> paths) {
    final files = paths
        .where((p) => File(p).existsSync())
        .map((p) => SelectedFile(
            path: p, fileName: p.split(Platform.pathSeparator).last))
        .toList();
    if (files.isNotEmpty) {
      ref.read(sendControllerProvider.notifier).addFiles(files);
    }
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
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.accent,
              ),
            ),
            SizedBox(width: 10),
            Text(
              'Looking for nearby devices…',
              style: TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
          ],
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
          avatar: const Icon(Icons.devices_rounded, size: 16),
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
              Text(
                'Selected Files',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (files.isNotEmpty) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${files.length}',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: AppColors.accent,
                    ),
                  ),
                ),
              ],
              const Spacer(),
              if (files.isNotEmpty)
                TextButton.icon(
                  onPressed: () =>
                      ref.read(sendControllerProvider.notifier).clear(),
                  icon: const Icon(Icons.clear_all_rounded, size: 18),
                  label: const Text('Clear'),
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
                      return Container(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color:
                                AppColors.surfaceBorder.withValues(alpha: 0.5),
                          ),
                        ),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 2),
                          leading: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: AppColors.accent.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(
                              Icons.insert_drive_file_outlined,
                              color: AppColors.accent,
                              size: 20,
                            ),
                          ),
                          title: Text(
                            file.fileName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.close_rounded, size: 20),
                            onPressed: () => ref
                                .read(sendControllerProvider.notifier)
                                .removeFile(file),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          if (send.jobs.isNotEmpty) ...[
            const Divider(),
            const SizedBox(height: 8),
            Text(
              'Transfers',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: AppColors.textMuted,
                  ),
            ),
            const SizedBox(height: 4),
            SizedBox(
              height: 140,
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
          if (files.isNotEmpty) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: send.busy ? null : _choosePeerAndSend,
                icon: const Icon(Icons.send_rounded),
                label: Text('Send ${files.length} file(s)'),
              ),
            ),
          ],
          if (send.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: AppColors.danger.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline_rounded,
                        color: AppColors.danger, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        send.error!,
                        style: const TextStyle(
                          color: AppColors.danger,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
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
        SnackBar(
          content: const Text('No nearby devices found yet.'),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
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
      isScrollControlled: true,
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
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.surfaceHigh,
              shape: BoxShape.circle,
              border: Border.all(
                color: AppColors.surfaceBorder.withValues(alpha: 0.5),
              ),
            ),
            child: Icon(
              Icons.cloud_upload_outlined,
              size: 44,
              color: AppColors.accent.withValues(alpha: 0.7),
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'Add files to share them with nearby devices',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Everything stays secure on your local network',
            style: TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
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
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Device Settings',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              Text(
                'Device name',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              TextFormField(
                initialValue: name,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.edit_outlined),
                  hintText: 'Enter visible device name',
                ),
                onChanged: (value) =>
                    ref.read(deviceNameProvider.notifier).state = value,
              ),
              const SizedBox(height: 20),
              if (caps != null) ...[
                Text(
                  'Capabilities',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final entry in caps.toJson().entries)
                      Chip(
                        avatar: Icon(
                          entry.value
                              ? Icons.check_circle_rounded
                              : Icons.cancel_rounded,
                          size: 16,
                          color: entry.value
                              ? AppColors.success
                              : AppColors.textMuted,
                        ),
                        label:
                            Text('${entry.key}: ${entry.value ? "yes" : "no"}'),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
