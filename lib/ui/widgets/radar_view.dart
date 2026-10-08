/// The signature "radar" — a pulsing ripple that communicates live discovery.
///
/// Three staggered rings expand outward from the centre while a faint sweep
/// rotates, and discovered peers sit as glowing blips on the rim. Everything is
/// one [CustomPainter] fed by a single [AnimationController], so it stays at
/// 60/120fps even with many peers.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/protocol/models.dart';
import '../theme.dart';

class RadarView extends StatefulWidget {
  const RadarView({
    super.key,
    required this.devices,
    this.size = 320,
    this.active = true,
    this.onDeviceTap,
  });

  final List<DeviceInfo> devices;
  final double size;

  /// When false the pulse settles into a calm idle state.
  final bool active;
  final void Function(DeviceInfo device)? onDeviceTap;

  @override
  State<RadarView> createState() => _RadarViewState();
}

class _RadarViewState extends State<RadarView>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 3),
  )..repeat();

  @override
  void didUpdateWidget(RadarView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !_controller.isAnimating) {
      _controller.repeat();
    } else if (!widget.active && _controller.isAnimating) {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return CustomPaint(
            painter: _RadarPainter(
              progress: _controller.value,
              active: widget.active,
              blips: _blipsFor(widget.devices),
            ),
            child: _BlipLayer(
              devices: widget.devices,
              radius: widget.size / 2,
              onTap: widget.onDeviceTap,
            ),
          );
        },
      ),
    );
  }

  /// Deterministically place each peer on the rim. We hash the device id so a
  /// peer keeps a stable position across rebuilds instead of jumping around.
  List<_Blip> _blipsFor(List<DeviceInfo> devices) {
    final blips = <_Blip>[];
    for (var i = 0; i < devices.length; i++) {
      final device = devices[i];
      final hash = device.deviceId.codeUnits.fold<int>(7, (a, c) => a * 31 + c);
      final angle = (hash % 360) * math.pi / 180;
      final ring = 0.62 + (i % 2) * 0.12;
      blips.add(_Blip(angle: angle, ring: ring, id: device.deviceId));
    }
    return blips;
  }
}

class _Blip {
  const _Blip({required this.angle, required this.ring, required this.id});
  final double angle;
  final double ring;
  final String id;
}

/// Avatars placed on the rim, tappable to start a transfer.
class _BlipLayer extends StatelessWidget {
  const _BlipLayer({required this.devices, required this.radius, this.onTap});

  final List<DeviceInfo> devices;
  final double radius;
  final void Function(DeviceInfo device)? onTap;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        for (var i = 0; i < devices.length; i++) _positioned(devices[i], i),
      ],
    );
  }

  Widget _positioned(DeviceInfo device, int index) {
    final hash = device.deviceId.codeUnits.fold<int>(7, (a, c) => a * 31 + c);
    final angle = (hash % 360) * math.pi / 180;
    final ring = radius * (0.62 + (index % 2) * 0.12);
    const avatar = 64.0;
    final left = radius + math.cos(angle) * ring - avatar / 2;
    final top = radius + math.sin(angle) * ring - avatar / 2;

    return Positioned(
      left: left,
      top: top,
      child: _DeviceAvatar(device: device, onTap: onTap),
    );
  }
}

class _DeviceAvatar extends StatelessWidget {
  const _DeviceAvatar({required this.device, this.onTap});
  final DeviceInfo device;
  final void Function(DeviceInfo device)? onTap;

  @override
  Widget build(BuildContext context) {
    return FocusableActionDetector(
      onShowFocusHighlight: (focused) {},
      actions: {
        ActivateIntent: CallbackAction<ActivateIntent>(
          onInvoke: (_) {
            onTap?.call(device);
            return null;
          },
        ),
      },
      child: Builder(
        builder: (context) {
          final focused = Focus.of(context).hasFocus;
          return Semantics(
            button: true,
            label: 'Send to ${device.displayName}',
            child: GestureDetector(
              onTap: onTap == null ? null : () => onTap!(device),
              child: AnimatedScale(
                scale: focused ? 1.15 : 1.0,
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutCubic,
                child: _avatarBody(context, focused),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _avatarBody(BuildContext context, bool focused) {
    final isLocalSend = device.platform?.contains('localsend') ?? false;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: AppColors.primaryGradient,
                border: Border.all(
                  color: focused ? Colors.white : AppColors.surfaceBorder,
                  width: focused ? 3 : 2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.accent.withValues(
                      alpha: focused ? 0.7 : 0.4,
                    ),
                    blurRadius: focused ? 24 : 14,
                    spreadRadius: focused ? 3 : 1,
                  ),
                ],
              ),
              child: Icon(
                _iconFor(device),
                color: Colors.white,
                size: 26,
              ),
            ),
            if (isLocalSend)
              Positioned(
                right: -2,
                bottom: -2,
                child: Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    color: AppColors.warning,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.background, width: 2),
                  ),
                  child: const Icon(
                    Icons.sync,
                    size: 10,
                    color: AppColors.background,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: AppColors.surface.withValues(alpha: 0.85),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: AppColors.surfaceBorder.withValues(alpha: 0.5),
              width: 0.5,
            ),
          ),
          child: SizedBox(
            width: 76,
            child: Text(
              device.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ],
    );
  }

  IconData _iconFor(DeviceInfo device) {
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
    return device.discoveredVia == DiscoveryChannel.ble
        ? Icons.bluetooth_rounded
        : Icons.devices_rounded;
  }
}

class _RadarPainter extends CustomPainter {
  _RadarPainter(
      {required this.progress, required this.active, required this.blips});

  final double progress;
  final bool active;
  final List<_Blip> blips;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final maxRadius = size.shortestSide / 2;

    _paintBackground(canvas, center, maxRadius);
    _paintGrid(canvas, center, maxRadius);
    if (active) {
      _paintRipples(canvas, center, maxRadius);
      _paintSweep(canvas, center, maxRadius);
    }
    _paintCore(canvas, center, maxRadius);
  }

  void _paintBackground(Canvas canvas, Offset center, double maxRadius) {
    final bgGlow = Paint()
      ..shader = RadialGradient(
        colors: [
          AppColors.surfaceHigh.withValues(alpha: 0.4),
          AppColors.background.withValues(alpha: 0.0),
        ],
      ).createShader(Rect.fromCircle(center: center, radius: maxRadius));
    canvas.drawCircle(center, maxRadius, bgGlow);
  }

  void _paintGrid(Canvas canvas, Offset center, double maxRadius) {
    final grid = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = AppColors.accent.withValues(alpha: 0.12);
    for (final factor in [0.35, 0.62, 0.9]) {
      canvas.drawCircle(center, maxRadius * factor, grid);
    }

    final crossPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5
      ..color = AppColors.accent.withValues(alpha: 0.08);

    canvas.drawLine(
      Offset(center.dx - maxRadius * 0.9, center.dy),
      Offset(center.dx + maxRadius * 0.9, center.dy),
      crossPaint,
    );
    canvas.drawLine(
      Offset(center.dx, center.dy - maxRadius * 0.9),
      Offset(center.dx, center.dy + maxRadius * 0.9),
      crossPaint,
    );
  }

  /// Three staggered rings that expand and fade, like sonar.
  void _paintRipples(Canvas canvas, Offset center, double maxRadius) {
    const rings = 3;
    for (var i = 0; i < rings; i++) {
      final t = (progress + i / rings) % 1.0;
      final radius = maxRadius * (0.2 + 0.8 * t);
      final alpha = (1 - t) * 0.4;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5 * (1 - t)
        ..color = AppColors.accent.withValues(alpha: alpha);
      canvas.drawCircle(center, radius, paint);
    }
  }

  /// A rotating conic sweep for that classic radar feel.
  void _paintSweep(Canvas canvas, Offset center, double maxRadius) {
    final angle = progress * 2 * math.pi;
    final sweep = Paint()
      ..shader = SweepGradient(
        startAngle: angle,
        endAngle: angle + 0.9,
        colors: [
          AppColors.accent.withValues(alpha: 0.0),
          AppColors.accent.withValues(alpha: 0.28),
        ],
        transform: GradientRotation(0),
      ).createShader(Rect.fromCircle(center: center, radius: maxRadius));
    canvas.drawCircle(center, maxRadius * 0.9, sweep);
  }

  void _paintCore(Canvas canvas, Offset center, double maxRadius) {
    final glow = Paint()
      ..shader = RadialGradient(
        colors: [
          AppColors.accent.withValues(alpha: 0.6),
          AppColors.accentDeep.withValues(alpha: 0.0),
        ],
      ).createShader(Rect.fromCircle(center: center, radius: maxRadius * 0.45));
    canvas.drawCircle(center, maxRadius * 0.45, glow);

    final coreGradient = Paint()
      ..shader = RadialGradient(
        colors: [
          AppColors.accent,
          AppColors.accentDeep,
        ],
      ).createShader(Rect.fromCircle(center: center, radius: maxRadius * 0.16));

    canvas.drawCircle(center, maxRadius * 0.16, coreGradient);
    canvas.drawCircle(
      center,
      maxRadius * 0.16,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..color = Colors.white.withValues(alpha: 0.8),
    );
  }

  @override
  bool shouldRepaint(_RadarPainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.active != active ||
      oldDelegate.blips.length != blips.length;
}
