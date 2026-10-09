/// Thin app shell: engine wiring, navigation and desktop drop-target.
///
/// All Bento content lives in `screens/` and all chrome in
/// `widgets/app_chrome.dart`, so this file only owns cross-cutting concerns:
/// engine events, PIN prompts, peer picking, shortcuts and tab state.
///
/// Tabs mirror the O+ Connect information architecture: Share Hub (send),
/// Devices (pairing + favorites), Transfers (unified history), Settings.
library;

import 'dart:async';
import 'dart:io';

import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../core/node.dart';
import '../core/protocol/models.dart';
import 'format.dart';
import 'providers.dart';
import 'receive_controller.dart';
import 'screens/devices_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/share_hub_screen.dart';
import 'screens/transfers_screen.dart';
import 'send_controller.dart';
import 'sent_history.dart';
import 'theme.dart';
import 'widgets/app_chrome.dart';
import 'widgets/dialogs.dart';
import 'widgets/feedback.dart';
import 'widgets/note_sheet.dart';

/// Tab indices shared by the shell, shortcuts and snack-bar actions.
abstract final class HomeTabs {
  static const int hub = 0;
  static const int devices = 1;
  static const int transfers = 2;
  static const int settings = 3;
}

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  StreamSubscription<EngineEvent>? _sub;
  bool _dragging = false;
  int _selectedIndex = HomeTabs.hub;

  @override
  void initState() {
    super.initState();
    _listenToEngine();
  }

  Future<void> _listenToEngine() async {
    try {
      final node = await ref.read(nodeStartedProvider.future);
      if (!mounted) return;
      _sub = node.events.listen(
        _handleEvent,
        onError: (Object error, StackTrace stack) {
          if (mounted) {
            showTransferNotice(context, 'Transfer service error: $error');
          }
        },
      );
    } on Object catch (error) {
      if (mounted) {
        showTransferNotice(
          context,
          'Unable to start transfer service: $error',
          icon: Icons.error_outline_rounded,
          color: AppColors.danger,
          duration: const Duration(seconds: 5),
        );
      }
    }
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
        final job = ref.read(sendControllerProvider).jobs[fileId];
        if (job != null) {
          ref.read(sentHistoryProvider.notifier).add(
                fileName: job.fileName,
                size: job.total,
              );
        }
        if (mounted) {
          showTransferNotice(
            context,
            'File sent successfully!',
            icon: Icons.check_circle_rounded,
            color: AppColors.success,
            action: SnackBarAction(
              label: 'View',
              onPressed: () =>
                  setState(() => _selectedIndex = HomeTabs.transfers),
            ),
          );
        }
      case SendFailed(:final fileId, :final error):
        send.markFailed(fileId, error);
      case FileReceived(:final file, :final path):
        ref.read(receivedFilesHistoryProvider.notifier).add(file, path);
        if (mounted) {
          showTransferNotice(
            context,
            'Received: ${file.fileName} (${formatBytes(file.size)})',
            icon: Icons.download_done_rounded,
            color: AppColors.success,
            duration: const Duration(seconds: 5),
            action: SnackBarAction(
              label: 'View',
              onPressed: () =>
                  setState(() => _selectedIndex = HomeTabs.transfers),
            ),
          );
        }
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
    ref.listen<SendState>(sendControllerProvider, (prev, next) {
      if (next.pinRequest != null && prev?.pinRequest == null) {
        showPinDialog(context, next.pinRequest!.deviceName).then((pin) {
          if (pin != null && pin.isNotEmpty) {
            ref.read(sendControllerProvider.notifier).submitPin(pin);
          } else {
            ref.read(sendControllerProvider.notifier).cancelPin();
          }
        });
      }
      if (next.error != null && next.error != prev?.error) {
        showTransferNotice(
          context,
          'Transfer failed: ${next.error}',
          icon: Icons.error_outline_rounded,
          color: AppColors.danger,
          duration: const Duration(seconds: 5),
        );
      }
    });

    final size = MediaQuery.sizeOf(context);
    final isWide = AppBreakpoints.isWide(size.width);
    final isCompact = AppBreakpoints.isCompact(size.width);
    final isDesktop =
        !kIsWeb && (Platform.isLinux || Platform.isWindows || Platform.isMacOS);
    final myDeviceName = ref.watch(deviceNameProvider);
    final hasStagedFiles = ref.watch(sendControllerProvider).files.isNotEmpty;

    final mainContent = AnimatedSwitcher(
      duration: AppMotion.normal,
      switchInCurve: AppMotion.easeOut,
      switchOutCurve: AppMotion.easeOut,
      transitionBuilder: (child, animation) => FadeTransition(
        opacity: animation,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.02),
            end: Offset.zero,
          ).animate(animation),
          child: child,
        ),
      ),
      child: IndexedStack(
        key: ValueKey<int>(_selectedIndex),
        index: _selectedIndex,
        children: [
          ShareHubScreen(
            isActive: _selectedIndex == HomeTabs.hub,
            onRescan: _rescan,
            onManualConnect: _openManualConnect,
            onAddFiles: _addFiles,
            onAddNote: _addNote,
            onClearQueue: () =>
                ref.read(sendControllerProvider.notifier).clear(),
            onRemoveFile: (file) =>
                ref.read(sendControllerProvider.notifier).removeFile(file),
            onSendTo: _sendTo,
            onSendAll: _choosePeerAndSend,
            onViewHistory: () =>
                setState(() => _selectedIndex = HomeTabs.transfers),
          ),
          DevicesScreen(
            onSendTo: _sendTo,
            onManualConnect: _openManualConnect,
            onRescan: _rescan,
          ),
          const TransfersScreen(),
          const SettingsScreen(),
        ],
      ),
    );

    final body = SafeArea(
      child: isWide
          ? Row(
              children: [
                SpatialNavRail(
                  selectedIndex: _selectedIndex,
                  onSelect: (idx) => setState(() => _selectedIndex = idx),
                ),
                const VerticalDivider(width: 1, color: AppColors.glassBorder),
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
        extendBodyBehindAppBar: false,
        appBar: SpatialAppBar(
          myDeviceName: myDeviceName,
          isWide: isWide,
          isCompact: isCompact,
          onRescan: _rescan,
          onManualConnect: _openManualConnect,
          onOpenSettings: () =>
              setState(() => _selectedIndex = HomeTabs.settings),
        ),
        bottomNavigationBar: isWide
            ? null
            : SpatialBottomBar(
                selectedIndex: _selectedIndex,
                onSelect: (idx) => setState(() => _selectedIndex = idx),
              ),
        floatingActionButton:
            (_selectedIndex == HomeTabs.hub && !hasStagedFiles)
                ? SpatialFab(onTap: _addFiles)
                : null,
        body: isDesktop
            ? DropTarget(
                onDragEntered: (_) => setState(() => _dragging = true),
                onDragExited: (_) => setState(() => _dragging = false),
                onDragDone: (details) {
                  setState(() => _dragging = false);
                  _addDroppedFiles(details.files.map((f) => f.path).toList());
                },
                child: DragDropOverlay(dragging: _dragging, child: body),
              )
            : body,
      ),
    );
  }

  // -- Actions ---------------------------------------------------------------

  void _addFiles() => ref.read(sendControllerProvider.notifier).pickFiles();

  /// Stages a typed note as `Note.txt` through the normal file pipeline.
  Future<void> _addNote() async {
    final text = await showNoteComposer(context);
    if (text == null || text.isEmpty || !mounted) return;
    try {
      final tmp = await getTemporaryDirectory();
      final file = File(
        '${tmp.path}${Platform.pathSeparator}'
        'localshare-note-${DateTime.now().millisecondsSinceEpoch}.txt',
      );
      await file.writeAsString(text);
      final size = await file.length();
      ref.read(sendControllerProvider.notifier).addFiles([
        SelectedFile(path: file.path, fileName: 'Note.txt', sizeBytes: size),
      ]);
      setState(() => _selectedIndex = HomeTabs.hub);
    } on Object catch (error) {
      if (mounted) {
        showTransferNotice(
          context,
          'Could not stage note: $error',
          icon: Icons.error_outline_rounded,
          color: AppColors.danger,
        );
      }
    }
  }

  void _addDroppedFiles(List<String> paths) {
    final files = <SelectedFile>[];
    for (final p in paths) {
      final file = File(p);
      if (!file.existsSync()) continue;
      int? size;
      try {
        size = file.lengthSync();
      } on Object {
        size = null;
      }
      files.add(
        SelectedFile(
          path: p,
          fileName: p.split(Platform.pathSeparator).last,
          sizeBytes: size,
        ),
      );
    }
    if (files.isNotEmpty) {
      ref.read(sendControllerProvider.notifier).addFiles(files);
      setState(() => _selectedIndex = HomeTabs.hub);
    }
  }

  Future<void> _rescan() async {
    final node = await ref.read(nodeStartedProvider.future);
    node.rescan();
    if (!mounted) return;
    showTransferNotice(
      context,
      'Holographic radar scanning local network...',
      icon: Icons.radar_rounded,
      duration: const Duration(seconds: 2),
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
    showTransferNotice(
      context,
      'Added target ${peer.displayName} (${result.address}:${result.port})',
      action: SnackBarAction(
        label: 'Send',
        onPressed: () => _sendTo(peer),
      ),
    );
  }

  Future<void> _sendTo(DeviceInfo peer) async {
    final send = ref.read(sendControllerProvider);
    if (send.files.isEmpty) {
      showTransferNotice(
        context,
        'Add at least one file before choosing a device.',
        icon: Icons.attach_file_rounded,
        color: AppColors.warning,
      );
      return;
    }
    await ref.read(sendControllerProvider.notifier).sendTo(peer);
  }

  Future<void> _choosePeerAndSend() async {
    final peers = ref.read(peersProvider).valueOrNull ?? const <DeviceInfo>[];
    if (!mounted) return;
    if (peers.isEmpty) {
      showTransferNotice(
        context,
        'No nearby devices found yet. Tap "Add IP" or "Rescan".',
        icon: Icons.devices_rounded,
      );
      return;
    }
    if (peers.length == 1) {
      await _sendTo(peers.first);
      return;
    }
    final peer = await showDevicePicker(context, peers);
    if (peer != null) await _sendTo(peer);
  }
}
