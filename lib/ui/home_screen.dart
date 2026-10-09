/// The Spatial Bento Grid Home Screen for LocalShare.
///
/// Features a modular Bento Grid architecture combining Liquid Glass surfaces,
/// holographic radar telemetry, interactive dropzones, live peer tracking,
/// and instant P2P local file transfers.
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
import 'widgets/glass_card.dart';
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
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Row(
                children: [
                  Icon(Icons.check_circle_rounded, color: AppColors.success),
                  SizedBox(width: 10),
                  Text('File sent successfully!'),
                ],
              ),
              behavior: SnackBarBehavior.floating,
              duration: Duration(seconds: 3),
            ),
          );
        }
      case SendFailed(:final fileId, :final error):
        send.markFailed(fileId, error);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Row(
                children: [
                  const Icon(Icons.error_outline_rounded,
                      color: AppColors.danger),
                  const SizedBox(width: 10),
                  Expanded(child: Text('Send failed: $error')),
                ],
              ),
              behavior: SnackBarBehavior.floating,
              duration: const Duration(seconds: 4),
            ),
          );
        }
      case FileReceived(:final file, :final path):
        ref.read(receivedFilesHistoryProvider.notifier).add(file, path);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Row(
                children: [
                  const Icon(Icons.download_done_rounded,
                      color: AppColors.success),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Received: ${file.fileName} (${formatBytes(file.size)})',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              behavior: SnackBarBehavior.floating,
              duration: const Duration(seconds: 4),
              action: SnackBarAction(
                label: 'View',
                textColor: AppColors.accent,
                onPressed: () => setState(() => _selectedIndex = 1),
              ),
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
    });

    final size = MediaQuery.sizeOf(context);
    final isWide = size.width >= 960;
    final isDesktop =
        !kIsWeb && (Platform.isLinux || Platform.isWindows || Platform.isMacOS);
    final myDeviceName = ref.watch(deviceNameProvider);

    final mainContent = IndexedStack(
      index: _selectedIndex,
      children: [
        isWide ? _desktopBentoLayout() : _mobileBentoLayout(),
        _receivedFilesLayout(),
        _settingsLayout(),
      ],
    );

    final body = SafeArea(
      child: isWide
          ? Row(
              children: [
                _buildSpatialNavigationRail(),
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
        appBar: _buildSpatialAppBar(isWide, myDeviceName),
        bottomNavigationBar: isWide ? null : _buildSpatialBottomBar(),
        floatingActionButton: (_selectedIndex == 0 &&
                ref.watch(sendControllerProvider).files.isEmpty)
            ? _buildSpatialFab()
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

  PreferredSizeWidget _buildSpatialAppBar(bool isWide, String myDeviceName) {
    return AppBar(
      titleSpacing: 20,
      backgroundColor: AppColors.background.withValues(alpha: 0.85),
      elevation: 0,
      title: Row(
        children: [
          // Spatial Logo
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              gradient: AppColors.spatialGradient,
              borderRadius: BorderRadius.circular(14),
              boxShadow: const [
                BoxShadow(
                  color: AppColors.accentGlow,
                  blurRadius: 14,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: const Icon(
              Icons.share_rounded,
              size: 20,
              color: Colors.white,
            ),
          ),
          const SizedBox(width: 14),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              ShaderMask(
                shaderCallback: (bounds) =>
                    AppColors.spatialGradient.createShader(bounds),
                child: const Text(
                  'LocalShare',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                    color: Colors.white,
                  ),
                ),
              ),
              const Text(
                'Spatial P2P Mesh',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textMuted,
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
          const Spacer(),
          // Spatial Identity Pill
          SpatialStatusPill(
            label: myDeviceName,
            sublabel: 'Online',
            dotColor: AppColors.success,
            onTap: () => setState(() => _selectedIndex = 2),
          ),
        ],
      ),
      actions: [
        IconButton(
          tooltip: 'Rescan network',
          onPressed: _rescan,
          icon: Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: AppColors.surfaceGlass,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.glassBorder),
            ),
            child: const Icon(Icons.refresh_rounded,
                size: 18, color: AppColors.accent),
          ),
        ),
        IconButton(
          tooltip: 'Connect via Direct IP',
          onPressed: _openManualConnect,
          icon: Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: AppColors.surfaceGlass,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.glassBorder),
            ),
            child: const Icon(Icons.add_link_rounded,
                size: 18, color: AppColors.accentPurple),
          ),
        ),
        const SizedBox(width: 12),
      ],
    );
  }

  Widget _buildSpatialNavigationRail() {
    return NavigationRail(
      selectedIndex: _selectedIndex,
      onDestinationSelected: (idx) => setState(() => _selectedIndex = idx),
      labelType: NavigationRailLabelType.all,
      backgroundColor: AppColors.surfaceGlass,
      indicatorColor: AppColors.accent.withValues(alpha: 0.2),
      leading: Padding(
        padding: const EdgeInsets.symmetric(vertical: 18),
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            gradient: AppColors.cardGradient,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.glassBorder),
          ),
          child: const Icon(
            Icons.grid_view_rounded,
            size: 22,
            color: AppColors.accent,
          ),
        ),
      ),
      destinations: const [
        NavigationRailDestination(
          icon: Icon(Icons.radar_rounded),
          selectedIcon: Icon(Icons.radar_rounded, color: AppColors.accent),
          label: Text('Bento Hub',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.download_done_rounded),
          selectedIcon:
              Icon(Icons.download_done_rounded, color: AppColors.accent),
          label: Text('Received',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.settings_outlined),
          selectedIcon: Icon(Icons.settings_rounded, color: AppColors.accent),
          label: Text('Settings',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }

  Widget _buildSpatialBottomBar() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceGlass,
        border: const Border(top: BorderSide(color: AppColors.glassBorder)),
      ),
      child: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: (idx) => setState(() => _selectedIndex = idx),
        backgroundColor: Colors.transparent,
        elevation: 0,
        indicatorColor: AppColors.accent.withValues(alpha: 0.2),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.radar_rounded),
            selectedIcon: Icon(Icons.radar_rounded, color: AppColors.accent),
            label: 'Share Hub',
          ),
          NavigationDestination(
            icon: Icon(Icons.download_done_rounded),
            selectedIcon:
                Icon(Icons.download_done_rounded, color: AppColors.accent),
            label: 'Received',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings_rounded, color: AppColors.accent),
            label: 'Settings',
          ),
        ],
      ),
    );
  }

  Widget _buildSpatialFab() {
    return Container(
      decoration: BoxDecoration(
        gradient: AppColors.spatialGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: AppColors.accentGlow,
            blurRadius: 18,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: _addFiles,
          child: const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.add_rounded, color: Colors.white, size: 22),
                SizedBox(width: 8),
                Text(
                  'Add Files',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ),
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
                color: AppColors.background.withValues(alpha: 0.92),
                alignment: Alignment.center,
                child: GlassCard(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 48, vertical: 38),
                  borderRadius: 28,
                  borderColor: AppColors.accent,
                  glowColor: AppColors.accent,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          gradient: AppColors.spatialGradient,
                          shape: BoxShape.circle,
                          boxShadow: const [
                            BoxShadow(
                              color: AppColors.accentGlow,
                              blurRadius: 24,
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.file_download_outlined,
                          size: 52,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 18),
                      const Text(
                        'Drop Files to Share',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Files will be staged in your spatial transfer queue',
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
        content: Text('Holographic radar scanning local network...'),
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
          textColor: AppColors.accent,
          onPressed: () => _sendTo(peer),
        ),
      ),
    );
  }

  // ===========================================================================
  // DESKTOP BENTO GRID LAYOUT (Multi-Column Asymmetric Tiles)
  // ===========================================================================
  Widget _desktopBentoLayout() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Left Column (Radar Hub & Discovered Peers)
          Expanded(
            flex: 5,
            child: Column(
              children: [
                // Bento Tile 1: Holographic Radar Scanner Hub
                Expanded(
                  flex: 6,
                  child: _buildBentoRadarHub(),
                ),
                const SizedBox(height: 14),
                // Bento Tile 2: Discovered Peers
                Expanded(
                  flex: 4,
                  child: _buildBentoDiscoveredPeers(),
                ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          // Right Column (File Queue Dropzone & Active Transfers Telemetry)
          Expanded(
            flex: 4,
            child: Column(
              children: [
                // Bento Tile 3: File Selection & Dropzone
                Expanded(
                  flex: 6,
                  child: _buildBentoFileQueue(),
                ),
                const SizedBox(height: 14),
                // Bento Tile 4: Active Transfers & Storage Telemetry
                Expanded(
                  flex: 4,
                  child: _buildBentoTransfersAndTelemetry(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // MOBILE BENTO GRID LAYOUT (Vertical Fluid Bento Stream)
  // ===========================================================================
  Widget _mobileBentoLayout() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 20),
      child: Column(
        children: [
          // Bento Tile 1: Holographic Radar Hub
          SizedBox(
            height: 340,
            child: _buildBentoRadarHub(),
          ),
          const SizedBox(height: 14),
          // Bento Tile 2: Discovered Peers
          SizedBox(
            height: 190,
            child: _buildBentoDiscoveredPeers(),
          ),
          const SizedBox(height: 14),
          // Bento Tile 3: Transfer Queue
          SizedBox(
            height: 380,
            child: _buildBentoFileQueue(),
          ),
          const SizedBox(height: 14),
          // Bento Tile 4: Active Transfers & Telemetry
          SizedBox(
            height: 240,
            child: _buildBentoTransfersAndTelemetry(),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // BENTO TILE 1: RADAR HUB
  // ===========================================================================
  Widget _buildBentoRadarHub() {
    final peers = ref.watch(peersProvider).valueOrNull ?? const <DeviceInfo>[];

    return BentoTile(
      title: 'Holographic Radar Hub',
      subtitle: 'Scanning LAN & Bluetooth for LocalShare & LocalSend peers',
      icon: Icons.radar_rounded,
      iconColor: AppColors.accent,
      badgeText: peers.isEmpty ? 'Scanning' : '${peers.length} in range',
      badgeColor: peers.isEmpty ? AppColors.accent : AppColors.success,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextButton.icon(
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              backgroundColor: AppColors.surfaceHigh.withValues(alpha: 0.5),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
                side: const BorderSide(color: AppColors.glassBorder),
              ),
            ),
            onPressed: _rescan,
            icon: const Icon(Icons.refresh_rounded,
                size: 14, color: AppColors.accent),
            label: const Text('Rescan',
                style: TextStyle(fontSize: 11, color: AppColors.accent)),
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final radarSize =
              (constraints.biggest.shortestSide * 0.90).clamp(180.0, 360.0);
          return Column(
            children: [
              Expanded(
                child: Center(
                  child: RadarView(
                    size: radarSize,
                    devices: peers,
                    active: true,
                    onDeviceTap: _sendTo,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              // Protocol feature badges
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _buildProtocolPill('mDNS P2P', Icons.wifi_rounded),
                  const SizedBox(width: 8),
                  _buildProtocolPill('BLE Beacon', Icons.bluetooth_rounded),
                  const SizedBox(width: 8),
                  _buildProtocolPill('LocalSend v2', Icons.sync_rounded),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildProtocolPill(String title, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceHigh.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: AppColors.glassBorder,
          width: 0.6,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: AppColors.textMuted),
          const SizedBox(width: 4),
          Text(
            title,
            style: const TextStyle(
              fontSize: 10,
              color: AppColors.textMuted,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // BENTO TILE 2: DISCOVERED PEERS MATRIX
  // ===========================================================================
  Widget _buildBentoDiscoveredPeers() {
    final peers = ref.watch(peersProvider).valueOrNull ?? const <DeviceInfo>[];

    return BentoTile(
      title: 'Discovered Peers',
      subtitle: 'Tap any peer to immediately send staged files',
      icon: Icons.devices_rounded,
      iconColor: AppColors.accentPurple,
      badgeText: '${peers.length}',
      badgeColor: AppColors.accentPurple,
      trailing: TextButton.icon(
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          backgroundColor: AppColors.surfaceHigh.withValues(alpha: 0.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
            side: const BorderSide(color: AppColors.glassBorder),
          ),
        ),
        onPressed: _openManualConnect,
        icon: const Icon(Icons.add_link_rounded,
            size: 14, color: AppColors.accentPurple),
        label: const Text('Add IP',
            style: TextStyle(fontSize: 11, color: AppColors.accentPurple)),
      ),
      child: peers.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceHigh.withValues(alpha: 0.5),
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.glassBorder),
                      ),
                      child: const Icon(
                        Icons.wifi_tethering_rounded,
                        size: 24,
                        color: AppColors.accentPurple,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'No peers detected yet',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'Connect both devices to the same Wi-Fi or Hotspot, or use "Add IP".',
                      textAlign: TextAlign.center,
                      style:
                          TextStyle(color: AppColors.textMuted, fontSize: 11),
                    ),
                  ],
                ),
              ),
            )
          : ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(vertical: 4),
              itemCount: peers.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (context, i) {
                final peer = peers[i];
                final addressStr = peer.bestAddress ?? 'No IP';
                return Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: () => _sendTo(peer),
                    child: Container(
                      width: 210,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceGlass,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(
                          color: AppColors.glassBorder,
                          width: 1,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.25),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  gradient: AppColors.spatialGradient,
                                  shape: BoxShape.circle,
                                  boxShadow: const [
                                    BoxShadow(
                                      color: AppColors.accentGlow,
                                      blurRadius: 8,
                                    ),
                                  ],
                                ),
                                child: Icon(
                                  _deviceIcon(peer),
                                  color: Colors.white,
                                  size: 16,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  peer.displayName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '$addressStr:${peer.port}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textMuted,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              DiscoveryBadge(channel: peer.discoveredVia),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color:
                                      AppColors.accent.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      'Send',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                        color: AppColors.accent,
                                      ),
                                    ),
                                    SizedBox(width: 3),
                                    Icon(Icons.arrow_forward_rounded,
                                        size: 10, color: AppColors.accent),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }

  IconData _deviceIcon(DeviceInfo device) {
    final platform = device.platform?.toLowerCase() ?? '';
    if (platform.contains('android') || platform.contains('tv')) {
      return platform.contains('tv')
          ? Icons.tv_rounded
          : Icons.smartphone_rounded;
    }
    if (platform.contains('ios')) return Icons.phone_iphone_rounded;
    if (platform.contains('mac') || platform.contains('darwin')) {
      return Icons.laptop_mac_rounded;
    }
    if (platform.contains('win')) return Icons.laptop_windows_rounded;
    if (platform.contains('linux')) return Icons.laptop_rounded;
    return Icons.devices_rounded;
  }

  // ===========================================================================
  // BENTO TILE 3: TRANSFER QUEUE & DROPZONE
  // ===========================================================================
  Widget _buildBentoFileQueue() {
    final send = ref.watch(sendControllerProvider);
    final files = send.files;

    return BentoTile(
      title: 'Transfer Queue',
      subtitle: files.isEmpty
          ? 'Drop files here or stage files for sending'
          : '${files.length} file(s) staged and ready to transfer',
      icon: Icons.cloud_upload_outlined,
      iconColor: AppColors.accent,
      badgeText: files.isEmpty ? 'Empty' : '${files.length}',
      badgeColor: files.isEmpty ? AppColors.textMuted : AppColors.accent,
      trailing: files.isNotEmpty
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: 'Add more files',
                  icon: const Icon(Icons.add_rounded,
                      size: 20, color: AppColors.accent),
                  onPressed: _addFiles,
                ),
                IconButton(
                  tooltip: 'Clear queue',
                  icon: const Icon(Icons.clear_all_rounded,
                      size: 20, color: AppColors.danger),
                  onPressed: () =>
                      ref.read(sendControllerProvider.notifier).clear(),
                ),
              ],
            )
          : null,
      child: Column(
        children: [
          Expanded(
            child: files.isEmpty
                ? _buildEmptyDropzone()
                : ListView.builder(
                    itemCount: files.length,
                    itemBuilder: (context, i) {
                      final file = files[i];
                      return Container(
                        margin: const EdgeInsets.symmetric(vertical: 3.5),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceHigh.withValues(alpha: 0.6),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: AppColors.glassBorder,
                            width: 0.8,
                          ),
                        ),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 0),
                          leading: Container(
                            padding: const EdgeInsets.all(7),
                            decoration: BoxDecoration(
                              color: AppColors.accent.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(
                              Icons.insert_drive_file_outlined,
                              color: AppColors.accent,
                              size: 18,
                            ),
                          ),
                          title: Text(
                            file.fileName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.close_rounded,
                                size: 18, color: AppColors.textMuted),
                            onPressed: () => ref
                                .read(sendControllerProvider.notifier)
                                .removeFile(file),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          if (files.isNotEmpty) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: AppColors.spatialGradient,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: const [
                    BoxShadow(
                      color: AppColors.accentGlow,
                      blurRadius: 16,
                      offset: Offset(0, 4),
                    ),
                  ],
                ),
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    shadowColor: Colors.transparent,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  onPressed: send.busy ? null : _choosePeerAndSend,
                  icon: const Icon(Icons.send_rounded,
                      color: Colors.white, size: 18),
                  label: Text(
                    'Send ${files.length} File(s) to Peer',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
            ),
          ],
          if (send.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                      color: AppColors.danger.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline_rounded,
                        color: AppColors.danger, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        send.error!,
                        style: const TextStyle(
                            color: AppColors.danger, fontSize: 11),
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

  Widget _buildEmptyDropzone() {
    return Center(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: _addFiles,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
            decoration: BoxDecoration(
              color: AppColors.surfaceHigh.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: AppColors.accent.withValues(alpha: 0.3),
                width: 1.5,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    gradient: AppColors.spatialGradient,
                    shape: BoxShape.circle,
                    boxShadow: const [
                      BoxShadow(
                        color: AppColors.accentGlow,
                        blurRadius: 14,
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.cloud_upload_rounded,
                    size: 28,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Stage Files for Transfer',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Drag and drop files anywhere or tap to browse',
                  style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ===========================================================================
  // BENTO TILE 4: ACTIVE TRANSFERS & TELEMETRY
  // ===========================================================================
  Widget _buildBentoTransfersAndTelemetry() {
    final send = ref.watch(sendControllerProvider);
    final inFlightJobs = send.jobs.values.toList();
    final history = ref.watch(receivedFilesHistoryProvider);

    return BentoTile(
      title: 'Transfer Telemetry',
      subtitle: inFlightJobs.isNotEmpty
          ? '${inFlightJobs.length} active transfer(s) in progress'
          : 'High-speed local encrypted pipeline active',
      icon: Icons.speed_rounded,
      iconColor: AppColors.success,
      badgeText:
          inFlightJobs.isNotEmpty ? '${inFlightJobs.length} Active' : 'Standby',
      badgeColor:
          inFlightJobs.isNotEmpty ? AppColors.accent : AppColors.success,
      trailing: TextButton(
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          minimumSize: Size.zero,
        ),
        onPressed: () => setState(() => _selectedIndex = 1),
        child: const Text('History',
            style: TextStyle(fontSize: 11, color: AppColors.accent)),
      ),
      child: inFlightJobs.isNotEmpty
          ? ListView(
              padding: EdgeInsets.zero,
              children: [
                for (final job in inFlightJobs)
                  TransferTile(
                    fileName: job.fileName,
                    transferred: job.transferred,
                    total: job.total,
                    speed: job.bytesPerSecond,
                    status: job.status,
                  ),
              ],
            )
          : Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _buildTelemetryStatCard(
                        title: 'Received',
                        value: '${history.length}',
                        icon: Icons.download_done_rounded,
                        color: AppColors.success,
                        onTap: () => setState(() => _selectedIndex = 1),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _buildTelemetryStatCard(
                        title: 'Security',
                        value: 'E2E TLS',
                        icon: Icons.lock_outline_rounded,
                        color: AppColors.accent,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceHigh.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.glassBorder),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.shield_outlined,
                          size: 15, color: AppColors.success),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Zero internet servers • Direct local peer transmission',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildTelemetryStatCard({
    required String title,
    required String value,
    required IconData icon,
    required Color color,
    VoidCallback? onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.surfaceHigh.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.glassBorder),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 16, color: color),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textMuted,
                    ),
                  ),
                  Text(
                    value,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: color,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ===========================================================================
  // TAB 2: RECEIVED FILES LAYOUT
  // ===========================================================================
  Widget _receivedFilesLayout() {
    final history = ref.watch(receivedFilesHistoryProvider);
    final storageDir = ref.watch(storageDirProvider).valueOrNull;

    return Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(9),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      AppColors.success.withValues(alpha: 0.25),
                      AppColors.success.withValues(alpha: 0.08),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppColors.success.withValues(alpha: 0.35),
                  ),
                ),
                child: const Icon(
                  Icons.download_done_rounded,
                  size: 20,
                  color: AppColors.success,
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Received Files History',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary,
                      letterSpacing: -0.3,
                    ),
                  ),
                  Text(
                    storageDir != null
                        ? 'Saved in ${storageDir.path}'
                        : 'Local storage destination',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
              const Spacer(),
              if (history.isNotEmpty)
                TextButton.icon(
                  style: TextButton.styleFrom(
                    backgroundColor: AppColors.surfaceHigh,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                      side: const BorderSide(color: AppColors.glassBorder),
                    ),
                  ),
                  onPressed: () =>
                      ref.read(receivedFilesHistoryProvider.notifier).clear(),
                  icon: const Icon(Icons.delete_sweep_rounded,
                      size: 16, color: AppColors.danger),
                  label: const Text('Clear',
                      style: TextStyle(fontSize: 12, color: AppColors.danger)),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: history.isEmpty
                ? Center(
                    child: GlassCard(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 36, vertical: 32),
                      borderRadius: 24,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color:
                                  AppColors.surfaceHigh.withValues(alpha: 0.5),
                              shape: BoxShape.circle,
                              border: Border.all(color: AppColors.glassBorder),
                            ),
                            child: const Icon(
                              Icons.folder_open_rounded,
                              size: 42,
                              color: AppColors.textMuted,
                            ),
                          ),
                          const SizedBox(height: 16),
                          const Text(
                            'No received files yet',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Transfers received on this device will automatically log here.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                color: AppColors.textMuted, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  )
                : ListView.builder(
                    itemCount: history.length,
                    itemBuilder: (context, i) {
                      final item = history[i];
                      return ReceivedFileTile(
                        fileName: item.file.fileName,
                        path: item.path,
                        size: item.file.size,
                        onCopy: () {
                          Clipboard.setData(ClipboardData(text: item.path));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('File path copied to clipboard'),
                              behavior: SnackBarBehavior.floating,
                            ),
                          );
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // TAB 3: SETTINGS LAYOUT
  // ===========================================================================
  Widget _settingsLayout() {
    final name = ref.watch(deviceNameProvider);
    final caps = ref.watch(capabilitiesProvider).valueOrNull;
    final storageDir = ref.watch(storageDirProvider).valueOrNull;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Settings & Preferences',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 18),
          // Device Visible Name
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(7),
                      decoration: BoxDecoration(
                        color: AppColors.accent.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.edit_outlined,
                          size: 18, color: AppColors.accent),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      'Device Visible Name',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: name,
                  decoration: const InputDecoration(
                    hintText: 'Enter visible device name',
                  ),
                  onChanged: (value) =>
                      ref.read(deviceNameProvider.notifier).state = value,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          // Download Directory
          if (storageDir != null)
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(7),
                        decoration: BoxDecoration(
                          color: AppColors.success.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.folder_outlined,
                            size: 18, color: AppColors.success),
                      ),
                      const SizedBox(width: 10),
                      const Text(
                        'Download Directory',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceHigh.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.glassBorder),
                    ),
                    child: SelectableText(
                      storageDir.path,
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 13,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 14),
          // Radio Capabilities
          if (caps != null)
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(7),
                        decoration: BoxDecoration(
                          color: AppColors.accentPurple.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.tune_rounded,
                            size: 18, color: AppColors.accentPurple),
                      ),
                      const SizedBox(width: 10),
                      const Text(
                        'Radio Capabilities',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ],
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
                              '${entry.key}: ${entry.value ? "Active" : "Unavailable"}'),
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

  // ===========================================================================
  // SEND LOGIC & PEER PICKER
  // ===========================================================================
  Future<void> _sendTo(DeviceInfo peer) async {
    await ref.read(sendControllerProvider.notifier).sendTo(peer);
  }

  Future<void> _choosePeerAndSend() async {
    final peers = ref.read(peersProvider).valueOrNull ?? const <DeviceInfo>[];
    if (peers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
              'No nearby devices found yet. Tap "Add IP" or "Rescan".'),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
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
