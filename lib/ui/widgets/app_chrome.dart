/// App shell chrome: top bar, navigation, FAB and drag-and-drop overlay.
///
/// Extracted from the former monolithic `HomeScreen` so the shell can evolve
/// without touching the Bento content tiles.
library;

import 'package:flutter/material.dart';

import '../theme.dart';
import 'glass_card.dart';

/// Top application bar with the spatial logo, device pill and quick actions.
class SpatialAppBar extends StatelessWidget implements PreferredSizeWidget {
  const SpatialAppBar({
    super.key,
    required this.myDeviceName,
    required this.isWide,
    this.isCompact = false,
    required this.onRescan,
    required this.onManualConnect,
    required this.onOpenSettings,
  });

  final String myDeviceName;
  final bool isWide;
  final bool isCompact;
  final VoidCallback onRescan;
  final VoidCallback onManualConnect;
  final VoidCallback onOpenSettings;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      titleSpacing: isWide ? 24 : 12,
      backgroundColor: AppColors.background.withValues(alpha: 0.85),
      elevation: 0,
      title: Row(
        children: [
          Semantics(
            label: 'LocalShare',
            image: true,
            child: Container(
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
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                ShaderMask(
                  shaderCallback: (bounds) =>
                      AppColors.spatialGradient.createShader(bounds),
                  child: const Text(
                    'LocalShare',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                      color: Colors.white,
                    ),
                  ),
                ),
                if (isWide && !isCompact)
                  const Text(
                    'Spatial P2P Mesh',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textMuted,
                      letterSpacing: 0.4,
                    ),
                  ),
              ],
            ),
          ),
          if (isWide && !isCompact) ...[
            const SizedBox(width: 12),
            Flexible(
              child: SpatialStatusPill(
                label: myDeviceName,
                sublabel: 'Online',
                dotColor: AppColors.success,
                onTap: onOpenSettings,
              ),
            ),
          ],
        ],
      ),
      actions: [
        if (isWide) ...[
          _ChromeIconButton(
            tooltip: 'Rescan network',
            icon: Icons.refresh_rounded,
            color: AppColors.accent,
            onPressed: onRescan,
          ),
          _ChromeIconButton(
            tooltip: 'Connect via Direct IP',
            icon: Icons.add_link_rounded,
            color: AppColors.accentPurple,
            onPressed: onManualConnect,
          ),
        ],
        if (!isWide || isCompact)
          PopupMenuButton<String>(
            tooltip: 'More actions',
            icon: const Icon(
              Icons.more_vert_rounded,
              color: AppColors.textSecondary,
            ),
            onSelected: (value) {
              if (value == 'rescan') onRescan();
              if (value == 'connect') onManualConnect();
            },
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: 'rescan',
                child: ListTile(
                  leading: Icon(Icons.refresh_rounded),
                  title: Text('Rescan network'),
                ),
              ),
              PopupMenuItem(
                value: 'connect',
                child: ListTile(
                  leading: Icon(Icons.add_link_rounded),
                  title: Text('Connect via IP'),
                ),
              ),
            ],
          ),
        SizedBox(width: isWide ? 12 : 4),
      ],
    );
  }
}

class _ChromeIconButton extends StatelessWidget {
  const _ChromeIconButton({
    required this.tooltip,
    required this.icon,
    required this.color,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final Color color;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      icon: Container(
        padding: const EdgeInsets.all(7),
        decoration: BoxDecoration(
          color: AppColors.surfaceGlass,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.glassBorder),
        ),
        child: Icon(icon, size: 18, color: color),
      ),
    );
  }
}

/// Desktop navigation rail (Share Hub / Received / Settings).
class SpatialNavRail extends StatelessWidget {
  const SpatialNavRail({
    super.key,
    required this.selectedIndex,
    required this.onSelect,
  });

  final int selectedIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return NavigationRail(
      selectedIndex: selectedIndex,
      onDestinationSelected: onSelect,
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
          label: Text(
            'Hub',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.devices_rounded),
          selectedIcon: Icon(Icons.devices_rounded, color: AppColors.accent),
          label: Text(
            'Devices',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.swap_horiz_rounded),
          selectedIcon: Icon(Icons.swap_horiz_rounded, color: AppColors.accent),
          label: Text(
            'Transfers',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.settings_outlined),
          selectedIcon: Icon(Icons.settings_rounded, color: AppColors.accent),
          label: Text(
            'Settings',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

/// Mobile / narrow bottom navigation.
class SpatialBottomBar extends StatelessWidget {
  const SpatialBottomBar({
    super.key,
    required this.selectedIndex,
    required this.onSelect,
  });

  final int selectedIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surfaceGlass,
        border: Border(top: BorderSide(color: AppColors.glassBorder)),
      ),
      child: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: onSelect,
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
            icon: Icon(Icons.devices_rounded),
            selectedIcon: Icon(Icons.devices_rounded, color: AppColors.accent),
            label: 'Devices',
          ),
          NavigationDestination(
            icon: Icon(Icons.swap_horiz_rounded),
            selectedIcon:
                Icon(Icons.swap_horiz_rounded, color: AppColors.accent),
            label: 'Transfers',
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
}

/// Gradient call-to-action for staging files.
class SpatialFab extends StatelessWidget {
  const SpatialFab({super.key, required this.onTap, this.label = 'Add Files'});

  final VoidCallback onTap;
  final String label;

  @override
  Widget build(BuildContext context) {
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
      child: Semantics(
        button: true,
        label: 'Add files to send',
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.add_rounded, color: Colors.white, size: 22),
                  const SizedBox(width: 8),
                  Text(
                    label,
                    style: const TextStyle(
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
      ),
    );
  }
}

/// Full-window drop-target overlay shown while dragging files on desktop.
class DragDropOverlay extends StatelessWidget {
  const DragDropOverlay({
    super.key,
    required this.dragging,
    required this.child,
  });

  final bool dragging;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        if (dragging)
          Positioned.fill(
            child: IgnorePointer(
              child: Container(
                color: AppColors.background.withValues(alpha: 0.92),
                alignment: Alignment.center,
                child: GlassCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 48,
                    vertical: 38,
                  ),
                  borderRadius: 28,
                  borderColor: AppColors.accent,
                  glowColor: AppColors.accent,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: const BoxDecoration(
                          gradient: AppColors.spatialGradient,
                          shape: BoxShape.circle,
                          boxShadow: [
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
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 13,
                        ),
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
}
