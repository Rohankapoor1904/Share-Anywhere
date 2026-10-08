/// The adaptive home screen: radar-first on phones/TV, multi-column tabbed interface on desktop.
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
import 'format.dart';
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
  int _selectedIndex = 0;

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
      case FileReceived(:final file, :final path):
        ref.read(receivedFilesHistoryProvider.notifier).add(file, path);
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

    final mainContent = IndexedStack(
      index: _selectedIndex,
      children: [
        isWide ? _desktopShareLayout() : _mobileShareLayout(),
        _receivedFilesLayout(),
        _settingsLayout(),
      ],
    );

    final body = SafeArea(
      child: isWide
          ? Row(
              children: [
                NavigationRail(
                  selectedIndex: _selectedIndex,
                  onDestinationSelected: (idx) =>
                      setState(() => _selectedIndex = idx),
                  labelType: NavigationRailLabelType.all,
                  backgroundColor: AppColors.surface,
                  indicatorColor: AppColors.accent.withValues(alpha: 0.2),
                  leading: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: const BoxDecoration(
                        gradient: AppColors.primaryGradient,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.share_rounded,
                        size: 22,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  destinations: const [
                    NavigationRailDestination(
                      icon: Icon(Icons.radar_rounded),
                      selectedIcon:
                          Icon(Icons.radar_rounded, color: AppColors.accent),
                      label: Text('Share'),
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.download_done_rounded),
                      selectedIcon: Icon(Icons.download_done_rounded,
                          color: AppColors.accent),
                      label: Text('Received'),
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.settings_outlined),
                      selectedIcon:
                          Icon(Icons.settings_rounded, color: AppColors.accent),
                      label: Text('Settings'),
                    ),
                  ],
                ),
                const VerticalDivider(width: 1),
                Expanded(child: mainContent),
              ],
            )
          : mainContent,
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
              if (!isWide) ...[
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
              ],
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
            IconButton(
              tooltip: 'Rescan network',
              onPressed: _rescan,
              icon: const Icon(Icons.refresh_rounded),
            ),
            IconButton(
              tooltip: 'Connect via IP',
              onPressed: _openManualConnect,
              icon: const Icon(Icons.add_link_rounded),
            ),
            const SizedBox(width: 8),
          ],
        ),
        bottomNavigationBar: isWide
            ? null
            : NavigationBar(
                selectedIndex: _selectedIndex,
                onDestinationSelected: (idx) =>
                    setState(() => _selectedIndex = idx),
                backgroundColor: AppColors.surface,
                indicatorColor: AppColors.accent.withValues(alpha: 0.2),
                destinations: const [
                  NavigationDestination(
                    icon: Icon(Icons.radar_rounded),
                    selectedIcon:
                        Icon(Icons.radar_rounded, color: AppColors.accent),
                    label: 'Share',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.download_done_rounded),
                    selectedIcon: Icon(Icons.download_done_rounded,
                        color: AppColors.accent),
                    label: 'Received',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.settings_outlined),
                    selectedIcon:
                        Icon(Icons.settings_rounded, color: AppColors.accent),
                    label: 'Settings',
                  ),
                ],
              ),
        floatingActionButton: _selectedIndex == 0
            ? FloatingActionButton.extended(
                onPressed: _addFiles,
                icon: const Icon(Icons.add_rounded),
                label: const Text('Add files'),
                elevation: 4,
                backgroundColor: AppColors.accent,
                foregroundColor: AppColors.background,
              )
            : null,
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
      setState(() => _selectedIndex = 0);
    }
  }

  Future<void> _rescan() async {
    final node = await ref.read(nodeStartedProvider.future);
    node.rescan();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Scanning network for devices...'),
        duration: Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _openManualConnect() async {
    final result = await showManualConnectDialog(context);
    if (result == null) return;
    final node = await ref.read(nodeStartedProvider.future);
    final peer = node.addManualPeer(
      address: result.address,
      port: result.port,
      displayName: result.displayName,
      isLocalSend: result.isLocalSend,
    );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
            'Added target ${peer.displayName} (${result.address}:${result.port})'),
        behavior: SnackBarBehavior.floating,
        action: SnackBarAction(
          label: 'Send',
          onPressed: () => _sendTo(peer),
        ),
      ),
    );
  }

  Widget _mobileShareLayout() {
    return Column(
      children: [
        const SizedBox(height: 8),
        _radar(flex: 4),
        _peerCardsList(),
        const Divider(height: 1),
        Expanded(flex: 3, child: _fileSection()),
      ],
    );
  }

  Widget _desktopShareLayout() {
    return Row(
      children: [
        Expanded(
          flex: 3,
          child: Column(
            children: [
              Expanded(child: _radar()),
              const Divider(height: 1),
              SizedBox(height: 160, child: _peerCardsList()),
            ],
          ),
        ),
        const VerticalDivider(width: 1),
        Expanded(
          flex: 2,
          child: _fileSection(),
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
          size: 300,
          devices: peers,
          active: true,
          onDeviceTap: _sendTo,
        ),
      ),
    );
  }

  Widget _peerCardsList() {
    final peers = ref.watch(peersProvider).valueOrNull ?? const <DeviceInfo>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Row(
            children: [
              Text(
                'Nearby Devices (${peers.length})',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  color: AppColors.textSecondary,
                ),
              ),
              const Spacer(),
              TextButton.icon(
                style: TextButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                onPressed: _rescan,
                icon: const Icon(Icons.refresh_rounded, size: 16),
                label: const Text('Rescan', style: TextStyle(fontSize: 12)),
              ),
              const SizedBox(width: 8),
              TextButton.icon(
                style: TextButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                onPressed: _openManualConnect,
                icon: const Icon(Icons.add_link_rounded, size: 16),
                label: const Text('Add IP', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
        ),
        if (peers.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
            child: Row(
              children: [
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.accent,
                  ),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Searching on local Wi-Fi & Bluetooth… Tap "Add IP" if target isn\'t visible.',
                    style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ),
              ],
            ),
          )
        else
          SizedBox(
            height: 90,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              itemCount: peers.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (context, i) {
                final peer = peers[i];
                final addressStr = peer.bestAddress ?? 'No IP';
                return Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => _sendTo(peer),
                    child: Container(
                      width: 210,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: AppColors.surfaceBorder.withValues(alpha: 0.6),
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: AppColors.accent.withValues(alpha: 0.15),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.devices_rounded,
                              color: AppColors.accent,
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  peer.displayName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '$addressStr:${peer.port}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                DiscoveryBadge(channel: peer.discoveredVia),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
      ],
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
              'Active Transfers',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: AppColors.textMuted,
                  ),
            ),
            const SizedBox(height: 4),
            SizedBox(
              height: 130,
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

  Widget _receivedFilesLayout() {
    final history = ref.watch(receivedFilesHistoryProvider);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'Received Files History',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const Spacer(),
              if (history.isNotEmpty)
                TextButton.icon(
                  onPressed: () =>
                      ref.read(receivedFilesHistoryProvider.notifier).clear(),
                  icon: const Icon(Icons.delete_sweep_rounded, size: 18),
                  label: const Text('Clear History'),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: history.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceHigh,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.folder_open_rounded,
                            size: 48,
                            color: AppColors.textMuted,
                          ),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'No received files yet',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Files transferred to this device will appear here.',
                          style: TextStyle(
                              color: AppColors.textMuted, fontSize: 13),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    itemCount: history.length,
                    itemBuilder: (context, i) {
                      final item = history[i];
                      return Container(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color:
                                AppColors.surfaceBorder.withValues(alpha: 0.6),
                          ),
                        ),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 4),
                          leading: Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppColors.success.withValues(alpha: 0.15),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.download_done_rounded,
                              color: AppColors.success,
                              size: 22,
                            ),
                          ),
                          title: Text(
                            item.file.fileName,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${formatBytes(item.file.size)} • ${item.path}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textMuted,
                                ),
                              ),
                            ],
                          ),
                          trailing: IconButton(
                            tooltip: 'Copy path',
                            icon: const Icon(Icons.copy_rounded, size: 18),
                            onPressed: () {
                              Clipboard.setData(
                                ClipboardData(text: item.path),
                              );
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Path copied to clipboard'),
                                  behavior: SnackBarBehavior.floating,
                                ),
                              );
                            },
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _settingsLayout() {
    final name = ref.watch(deviceNameProvider);
    final caps = ref.watch(capabilitiesProvider).valueOrNull;
    final storageDir = ref.watch(storageDirProvider).valueOrNull;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Settings & Preferences',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: AppColors.surfaceBorder.withValues(alpha: 0.6),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Device Visible Name',
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
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (storageDir != null)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: AppColors.surfaceBorder.withValues(alpha: 0.6),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Download Directory',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 6),
                  SelectableText(
                    storageDir.path,
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 16),
          if (caps != null)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: AppColors.surfaceBorder.withValues(alpha: 0.6),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Radio Capabilities',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
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
                          label: Text(
                              '${entry.key}: ${entry.value ? "yes" : "no"}'),
                        ),
                    ],
                  ),
                ],
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
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surfaceHigh,
                shape: BoxShape.circle,
                border: Border.all(
                  color: AppColors.surfaceBorder.withValues(alpha: 0.5),
                ),
              ),
              child: Icon(
                Icons.cloud_upload_outlined,
                size: 32,
                color: AppColors.accent.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Add files to share them with nearby devices',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 13,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 2),
            const Text(
              'Everything stays secure on your local network',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}
