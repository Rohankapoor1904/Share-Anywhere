/// The signature spatial radar — a holographic liquid scanner communicating live network discovery.
///
/// Features concentric sonar waves, rotating conic sweep with electric cyan & spatial violet glow,
/// and discovered peers placed on glowing orbital tracks.
library;

import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../core/protocol/models.dart';
import '../theme.dart';
import 'device_icons.dart';

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
    duration: AppMotion.radarSweep,
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
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final effectiveActive = widget.active && !reduceMotion;
    if (effectiveActive && !_controller.isAnimating) {
      _controller.repeat();
    } else if (!effectiveActive && _controller.isAnimating) {
      _controller.stop();
    }
    return Semantics(
      label:
          'Nearby device radar, ${widget.devices.length} device${widget.devices.length == 1 ? '' : 's'} in range',
      child: SizedBox(
        width: widget.size,
        height: widget.size,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            return CustomPaint(
              painter: _SpatialRadarPainter(
                progress: _controller.value,
                active: effectiveActive,
                blips: _blipsFor(widget.devices),
              ),
              child: _SpatialBlipLayer(
                devices: widget.devices,
                radius: widget.size / 2,
                onTap: widget.onDeviceTap,
              ),
            );
          },
        ),
      ),
    );
  }

  /// Deterministically place each peer on orbital rings based on deviceId hash.
  List<_Blip> _blipsFor(List<DeviceInfo> devices) {
    final blips = <_Blip>[];
    for (var i = 0; i < devices.length; i++) {
      final device = devices[i];
      final hash = _stableHash(device.deviceId);
      final angle = (hash % 360) * math.pi / 180;
      final ring = 0.60 + (i % 2) * 0.16;
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

int _stableHash(String input) {
  var hash = 7;
  for (final unit in input.codeUnits) {
    hash = hash * 31 + unit;
  }
  return hash;
}

/// Floating glass nodes placed on orbital tracks, tappable to initiate instant transfer.
class _SpatialBlipLayer extends StatelessWidget {
  const _SpatialBlipLayer({
    required this.devices,
    required this.radius,
    this.onTap,
  });

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
    final hash = _stableHash(device.deviceId);
    final angle = (hash % 360) * math.pi / 180;
    final ring = radius * (0.60 + (index % 2) * 0.16);
    const avatarWidth = 72.0;
    final left = radius + math.cos(angle) * ring - avatarWidth / 2;
    final top = radius + math.sin(angle) * ring - avatarWidth / 2;

    return Positioned(
      left: left,
      top: top,
      child: _SpatialDeviceAvatar(device: device, onTap: onTap),
    );
  }
}

class _SpatialDeviceAvatar extends StatelessWidget {
  const _SpatialDeviceAvatar({required this.device, this.onTap});
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
            child: Tooltip(
              message: 'Send to ${device.displayName}',
              child: GestureDetector(
                onTap: onTap == null ? null : () => onTap!(device),
                child: AnimatedScale(
                  scale: focused ? 1.15 : 1.0,
                  duration: AppMotion.normal,
                  curve: AppMotion.easeOut,
                  child: _avatarBody(context, focused),
                ),
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
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: AppColors.spatialGradient,
                border: Border.all(
                  color: focused
                      ? Colors.white
                      : AppColors.glassBorderHighlight.withValues(alpha: 0.6),
                  width: focused ? 2.5 : 1.5,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.accent.withValues(
                      alpha: focused ? 0.75 : 0.45,
                    ),
                    blurRadius: focused ? 26 : 16,
                    spreadRadius: focused ? 3 : 1,
                  ),
                  BoxShadow(
                    color: AppColors.accentPurple.withValues(alpha: 0.35),
                    blurRadius: 18,
                    offset: const Offset(2, 4),
                  ),
                ],
              ),
              child: Center(
                child: Icon(
                  _iconFor(device),
                  color: Colors.white,
                  size: 24,
                ),
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
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.warning.withValues(alpha: 0.5),
                        blurRadius: 6,
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.sync_rounded,
                    size: 11,
                    color: AppColors.background,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
          decoration: BoxDecoration(
            color: AppColors.surfaceGlass.withValues(alpha: 0.9),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: AppColors.glassBorder,
              width: 0.8,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 6,
              ),
            ],
          ),
          child: SizedBox(
            width: 70,
            child: Text(
              device.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
              ),
            ),
          ),
        ),
      ],
    );
  }

  IconData _iconFor(DeviceInfo device) => deviceIconFor(device);
}

class _SpatialRadarPainter extends CustomPainter {
  _SpatialRadarPainter({
    required this.progress,
    required this.active,
    required this.blips,
  });

  final double progress;
  final bool active;
  final List<_Blip> blips;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final maxRadius = size.shortestSide / 2;

    _paintCosmicBackdrop(canvas, center, maxRadius);
    _paintOrbitalGrid(canvas, center, maxRadius);
    if (active) {
      _paintSpatialRipples(canvas, center, maxRadius);
      _paintHolographicSweep(canvas, center, maxRadius);
    }
    _paintLiquidCore(canvas, center, maxRadius);
  }

  void _paintCosmicBackdrop(Canvas canvas, Offset center, double maxRadius) {
    final ambientShader = RadialGradient(
      colors: [
        AppColors.accent.withValues(alpha: 0.12),
        AppColors.accentPurple.withValues(alpha: 0.05),
        Colors.transparent,
      ],
      stops: const [0.0, 0.55, 1.0],
    ).createShader(Rect.fromCircle(center: center, radius: maxRadius));

    canvas.drawCircle(center, maxRadius, Paint()..shader = ambientShader);
  }

  void _paintOrbitalGrid(Canvas canvas, Offset center, double maxRadius) {
    final ringPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0
      ..color = AppColors.glassBorder.withValues(alpha: 0.25);

    // Orbital concentric tracks
    for (final factor in [0.32, 0.60, 0.88]) {
      canvas.drawCircle(center, maxRadius * factor, ringPaint);
    }

    // High-tech subtle crosshairs
    final crossHairPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.6
      ..color = AppColors.accent.withValues(alpha: 0.15);

    canvas.drawLine(
      Offset(center.dx - maxRadius * 0.88, center.dy),
      Offset(center.dx + maxRadius * 0.88, center.dy),
      crossHairPaint,
    );
    canvas.drawLine(
      Offset(center.dx, center.dy - maxRadius * 0.88),
      Offset(center.dx, center.dy + maxRadius * 0.88),
      crossHairPaint,
    );

    // Small tick marks on 45 degree angles
    final tickPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = AppColors.accentPurple.withValues(alpha: 0.25);

    for (var i = 0; i < 4; i++) {
      final angle = (i * 90 + 45) * math.pi / 180;
      final startR = maxRadius * 0.84;
      final endR = maxRadius * 0.88;
      canvas.drawLine(
        Offset(center.dx + math.cos(angle) * startR,
            center.dy + math.sin(angle) * startR),
        Offset(center.dx + math.cos(angle) * endR,
            center.dy + math.sin(angle) * endR),
        tickPaint,
      );
    }
  }

  /// Three expanding fluid sonar rings
  void _paintSpatialRipples(Canvas canvas, Offset center, double maxRadius) {
    const rings = 3;
    for (var i = 0; i < rings; i++) {
      final t = (progress + i / rings) % 1.0;
      final radius = maxRadius * (0.18 + 0.80 * t);
      final alpha = (1 - t) * 0.55;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2 * (1 - t) + 0.5
        ..color = Color.lerp(AppColors.accent, AppColors.accentPurple, t)!
            .withValues(alpha: alpha);
      canvas.drawCircle(center, radius, paint);
    }
  }

  /// Conic holographic sweep with cyan-to-violet trail
  void _paintHolographicSweep(Canvas canvas, Offset center, double maxRadius) {
    final sweep = Paint()
      ..shader = SweepGradient(
        colors: [
          Colors.transparent,
          AppColors.accentPurple.withValues(alpha: 0.12),
          AppColors.accent.withValues(alpha: 0.32),
        ],
        stops: const [0.0, 0.45, 1.0],
        transform: GradientRotation(progress * 2 * math.pi),
      ).createShader(Rect.fromCircle(center: center, radius: maxRadius));

    canvas.drawCircle(center, maxRadius * 0.88, sweep);
  }

  /// Central spatial liquid core with radiant glow
  void _paintLiquidCore(Canvas canvas, Offset center, double maxRadius) {
    final auraShader = RadialGradient(
      colors: [
        AppColors.accent.withValues(alpha: 0.7),
        AppColors.accentPurple.withValues(alpha: 0.25),
        Colors.transparent,
      ],
      stops: const [0.0, 0.55, 1.0],
    ).createShader(Rect.fromCircle(center: center, radius: maxRadius * 0.42));

    canvas.drawCircle(center, maxRadius * 0.42, Paint()..shader = auraShader);

    // Inner liquid glass sphere
    final coreGradient = RadialGradient(
      colors: const [
        Color(0xFFE0F7FA),
        AppColors.accent,
        AppColors.accentDeep,
      ],
      stops: const [0.0, 0.45, 1.0],
    ).createShader(Rect.fromCircle(center: center, radius: maxRadius * 0.15));

    canvas.drawCircle(center, maxRadius * 0.15, Paint()..shader = coreGradient);

    // Specular glass rim
    final rimPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0
      ..color = Colors.white.withValues(alpha: 0.85);

    canvas.drawCircle(center, maxRadius * 0.15, rimPaint);
  }

  @override
  bool shouldRepaint(_SpatialRadarPainter oldDelegate) {
    if (oldDelegate.progress != progress || oldDelegate.active != active) {
      return true;
    }
    if (oldDelegate.blips.length != blips.length) return true;
    for (var i = 0; i < blips.length; i++) {
      if (oldDelegate.blips[i].id != blips[i].id) return true;
    }
    return false;
  }
}
