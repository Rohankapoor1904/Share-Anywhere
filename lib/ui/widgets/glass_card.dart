/// Liquid glass and Spatial UI card containers for the Bento Grid layout.
library;

import 'dart:ui';
import 'package:flutter/material.dart';

import '../theme.dart';

/// A premium liquid-glass surface with specular rim highlighting,
/// layered ambient shadows, and optional frosted backdrop filter.
class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.borderRadius = 22,
    this.blur = 12,
    this.backgroundColor,
    this.borderColor,
    this.glowColor,
    this.gradient,
    this.onTap,
    this.borderWidth = 1.0,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double borderRadius;
  final double blur;
  final Color? backgroundColor;
  final Color? borderColor;
  final Color? glowColor;
  final Gradient? gradient;
  final VoidCallback? onTap;
  final double borderWidth;

  @override
  Widget build(BuildContext context) {
    final effectiveBorderRadius = BorderRadius.circular(borderRadius);

    Widget content = Container(
      padding: padding ?? const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: backgroundColor ?? AppColors.surfaceGlass,
        borderRadius: effectiveBorderRadius,
        gradient: gradient ?? AppColors.glassCardGradient,
        border: Border.all(
          color: borderColor ?? AppColors.glassBorder,
          width: borderWidth,
        ),
        boxShadow: [
          // Soft ambient dark drop shadow
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
          // Subtle spatial ambient glow if specified
          if (glowColor != null)
            BoxShadow(
              color: glowColor!.withValues(alpha: 0.2),
              blurRadius: 24,
              spreadRadius: -2,
            ),
        ],
      ),
      child: child,
    );

    if (blur > 0) {
      content = ClipRRect(
        borderRadius: effectiveBorderRadius,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
          child: content,
        ),
      );
    } else {
      content = ClipRRect(
        borderRadius: effectiveBorderRadius,
        child: content,
      );
    }

    if (margin != null) {
      content = Padding(padding: margin!, child: content);
    }

    if (onTap != null) {
      content = Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: effectiveBorderRadius,
          onTap: onTap,
          splashColor: AppColors.accent.withValues(alpha: 0.12),
          highlightColor: AppColors.accent.withValues(alpha: 0.06),
          child: content,
        ),
      );
    }

    return content;
  }
}

/// A modular Bento Grid tile component with standardized spatial header,
/// glowing badge icon, title, action pill, and flexible content area.
class BentoTile extends StatelessWidget {
  const BentoTile({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.iconColor,
    this.badgeText,
    this.badgeColor,
    this.trailing,
    required this.child,
    this.padding,
    this.glowColor,
    this.borderRadius = 22,
    this.onTap,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final Color? iconColor;
  final String? badgeText;
  final Color? badgeColor;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final Color? glowColor;
  final double borderRadius;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      borderRadius: borderRadius,
      glowColor: glowColor,
      onTap: onTap,
      padding: padding ?? const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          Row(
            children: [
              if (icon != null) ...[
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        (iconColor ?? AppColors.accent).withValues(alpha: 0.25),
                        (iconColor ?? AppColors.accent).withValues(alpha: 0.08),
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: (iconColor ?? AppColors.accent)
                          .withValues(alpha: 0.4),
                      width: 1,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: (iconColor ?? AppColors.accent)
                            .withValues(alpha: 0.25),
                        blurRadius: 10,
                      ),
                    ],
                  ),
                  child: Icon(
                    icon,
                    size: 18,
                    color: iconColor ?? AppColors.accent,
                  ),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.2,
                              color: AppColors.textPrimary,
                            ),
                          ),
                        ),
                        if (badgeText != null) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: (badgeColor ?? AppColors.accent)
                                  .withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: (badgeColor ?? AppColors.accent)
                                    .withValues(alpha: 0.35),
                                width: 0.8,
                              ),
                            ),
                            child: Text(
                              badgeText!,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: badgeColor ?? AppColors.accent,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.textMuted,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
          const SizedBox(height: 14),
          // Content
          Expanded(child: child),
        ],
      ),
    );
  }
}

/// A spatial glass pill with a glowing pulsating dot and text.
class SpatialStatusPill extends StatelessWidget {
  const SpatialStatusPill({
    super.key,
    required this.label,
    this.dotColor = AppColors.success,
    this.sublabel,
    this.onTap,
  });

  final String label;
  final Color dotColor;
  final String? sublabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(30),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.surfaceHigh.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(30),
            border: Border.all(
              color: AppColors.glassBorderHighlight.withValues(alpha: 0.15),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.2),
                blurRadius: 8,
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: dotColor,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: dotColor.withValues(alpha: 0.7),
                      blurRadius: 8,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
              if (sublabel != null) ...[
                const SizedBox(width: 6),
                Text(
                  sublabel!,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
