/// Design tokens and theme for the LocalShare Spatial & Liquid Glass UI.
///
/// A futuristic, dark spatial aesthetic featuring translucent frosted glass,
/// electric neon gradients, subtle specular edge reflections, and modular
/// Bento tiles.
///
/// Token layout:
/// - [AppColors] — palette, gradients, glows (stable public API).
/// - [AppSpacing] / [AppRadius] / [AppMotion] / [AppShadows] — layout tokens
///   so screens share one rhythm instead of magic numbers.
/// - [AppBreakpoints] — single source of truth for responsive switches.
/// - [buildAppTheme] — polished Material 3 dark theme.
library;

import 'package:flutter/material.dart';

abstract final class AppColors {
  // Spatial Cosmic Dark Palette
  static const background = Color(0xFF070B14);
  static const backgroundSecondary = Color(0xFF0B1020);
  static const surface = Color(0xFF10172B);
  static const surfaceGlass = Color(0xCC111930);
  static const surfaceHigh = Color(0xFF18233D);
  static const surfaceBorder = Color(0xFF233152);

  // Liquid Glass Edge & Sheen
  static const glassBorder = Color(0x2EFFFFFF);
  static const glassBorderHighlight = Color(0x55FFFFFF);
  static const glassSurfaceHighlight = Color(0x1AFFFFFF);

  // Radiant Spatial Accents
  static const accent = Color(0xFF00E5FF); // Electric Cyan
  static const accentDeep = Color(0xFF2979FF); // Hyper Blue
  static const accentPurple = Color(0xFF8B5CF6); // Spatial Violet
  static const accentPink = Color(0xFFEC4899); // Neon Pink
  static const success = Color(0xFF10B981); // Emerald Neon
  static const warning = Color(0xFFF59E0B); // Amber Glow
  static const danger = Color(0xFFEF4444); // Crimson Ember

  // High-legibility Typography
  static const textPrimary = Color(0xFFF8FAFC);
  static const textSecondary = Color(0xFFCBD5E1);
  static const textMuted = Color(0xFF64748B);

  // Ambient Glows
  static const accentGlow = Color(0x4D00E5FF);
  static const purpleGlow = Color(0x4D8B5CF6);
  static const successGlow = Color(0x4D10B981);

  // Gradients for cards, spatial buttons, and headers
  static const primaryGradient = LinearGradient(
    colors: [Color(0xFF00E5FF), Color(0xFF2979FF)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const spatialGradient = LinearGradient(
    colors: [Color(0xFF00E5FF), Color(0xFF8B5CF6)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const purplePinkGradient = LinearGradient(
    colors: [Color(0xFF8B5CF6), Color(0xFFEC4899)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const cardGradient = LinearGradient(
    colors: [Color(0xFF162038), Color(0xFF0E1528)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const glassCardGradient = LinearGradient(
    colors: [
      Color(0xE6141D34),
      Color(0xD90E1426),
    ],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const specularHighlightGradient = LinearGradient(
    colors: [
      Color(0x33FFFFFF),
      Color(0x05FFFFFF),
    ],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static const focusRing = Color(0xFFB8F6FF);
  static const focusRingWidth = 2.0;
}

/// Spacing rhythm shared by every screen. Prefer these over raw numbers so
/// dense mobile layouts and airy desktop layouts stay consistent.
abstract final class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 28;

  static const double tileGap = 14;
  static const double screenHPadMobile = 14;
  static const double screenHPadDesktop = 28;

  static const EdgeInsets screenPadMobile = EdgeInsets.fromLTRB(14, 10, 14, 24);
  static const EdgeInsets tilePad = EdgeInsets.all(18);
  static const EdgeInsets cardPad = EdgeInsets.all(14);
}

/// Corner radii. One scale keeps cards, pills, sheets and dialogs coherent.
abstract final class AppRadius {
  static const double xs = 8;
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 18;
  static const double xl = 22;
  static const double pill = 999;

  static BorderRadius get card => BorderRadius.circular(lg);
  static BorderRadius get tile => BorderRadius.circular(xl);
  static BorderRadius get dialog => BorderRadius.circular(24);
  static BorderRadius get sheet =>
      BorderRadius.vertical(top: Radius.circular(28));
}

/// Motion tokens — one easing + a few durations so the UI feels choreographed
/// instead of each widget animating on its own curve.
abstract final class AppMotion {
  static const Duration fast = Duration(milliseconds: 150);
  static const Duration normal = Duration(milliseconds: 220);
  static const Duration slow = Duration(milliseconds: 350);
  static const Duration radarSweep = Duration(milliseconds: 3200);

  static const Curve easeOut = Curves.easeOutCubic;
  static const Curve easeInOut = Curves.easeInOutCubic;
  static const Curve spring = Curves.easeOutBack;
}

/// Layered shadows tuned for the dark cosmic background.
abstract final class AppShadows {
  static List<BoxShadow> get card => const [
        BoxShadow(
          color: Color(0x59000000),
          blurRadius: 20,
          offset: Offset(0, 8),
        ),
      ];

  static List<BoxShadow> get glowAccent => const [
        BoxShadow(
          color: AppColors.accentGlow,
          blurRadius: 16,
          offset: Offset(0, 4),
        ),
      ];

  static List<BoxShadow> get glowSoft => [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.30),
          blurRadius: 12,
          offset: const Offset(0, 4),
        ),
      ];
}

/// Responsive breakpoints used across the app shell.
abstract final class AppBreakpoints {
  static const double compact = 600;
  static const double wide = 1000;
  static const double maxContentWidth = 1480;

  static bool isWide(double width) => width >= wide;
  static bool isCompact(double width) => width < compact;
}

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.accentDeep,
    brightness: Brightness.dark,
  ).copyWith(
    surface: AppColors.background,
    surfaceContainer: AppColors.surface,
    surfaceContainerHigh: AppColors.surfaceHigh,
    primary: AppColors.accent,
    onPrimary: AppColors.background,
    secondary: AppColors.accentPurple,
    onSecondary: Colors.white,
    tertiary: AppColors.success,
    error: AppColors.danger,
    onSurface: AppColors.textPrimary,
    onSurfaceVariant: AppColors.textSecondary,
    outline: AppColors.glassBorder,
    outlineVariant: AppColors.surfaceBorder,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    fontFamily: 'Roboto',
    visualDensity: VisualDensity.adaptivePlatformDensity,
    focusColor: AppColors.focusRing.withValues(alpha: 0.24),
    hoverColor: AppColors.accent.withValues(alpha: 0.08),
    splashColor: AppColors.accent.withValues(alpha: 0.12),
    highlightColor: AppColors.accent.withValues(alpha: 0.06),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: AppColors.textPrimary,
        fontWeight: FontWeight.w800,
        fontSize: 20,
        letterSpacing: -0.5,
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.surfaceGlass,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(AppRadius.xl)),
        side: const BorderSide(
          color: AppColors.glassBorder,
          width: 1,
        ),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: AppColors.surface,
      elevation: 16,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: const BorderSide(
          color: AppColors.glassBorder,
          width: 1,
        ),
      ),
      titleTextStyle: const TextStyle(
        color: AppColors.textPrimary,
        fontWeight: FontWeight.bold,
        fontSize: 20,
        letterSpacing: -0.3,
      ),
      contentTextStyle: const TextStyle(
        color: AppColors.textSecondary,
        fontSize: 14,
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: AppColors.surface,
      modalBackgroundColor: AppColors.surface,
      elevation: 16,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        side: BorderSide(color: AppColors.glassBorder, width: 1),
      ),
      dragHandleColor: AppColors.textMuted,
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: AppColors.surfaceHigh,
      contentTextStyle: const TextStyle(
        color: AppColors.textPrimary,
        fontSize: 13.5,
        fontWeight: FontWeight.w500,
      ),
      actionTextColor: AppColors.accent,
      elevation: 8,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: const BorderSide(color: AppColors.glassBorder),
      ),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: AppColors.surfaceHigh,
      elevation: 12,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: const BorderSide(color: AppColors.glassBorder),
      ),
      textStyle: const TextStyle(
        color: AppColors.textPrimary,
        fontSize: 13.5,
      ),
    ),
    listTileTheme: const ListTileThemeData(
      contentPadding: EdgeInsets.symmetric(horizontal: 12),
      iconColor: AppColors.accent,
      textColor: AppColors.textPrimary,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(14)),
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: AppColors.accent,
      linearTrackColor: AppColors.surfaceHigh,
      circularTrackColor: AppColors.surfaceHigh,
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.glassBorder,
      thickness: 1,
      space: 1,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.transparent,
      elevation: 0,
      height: 72,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          color: selected ? AppColors.textPrimary : AppColors.textMuted,
          fontSize: 12,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
        );
      }),
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
    ),
    navigationRailTheme: const NavigationRailThemeData(
      backgroundColor: Colors.transparent,
      useIndicator: true,
      minWidth: 80,
      groupAlignment: -0.7,
      selectedIconTheme: IconThemeData(color: AppColors.accent),
      unselectedIconTheme: IconThemeData(color: AppColors.textMuted),
      selectedLabelTextStyle: TextStyle(
        color: AppColors.textPrimary,
        fontWeight: FontWeight.w700,
      ),
      unselectedLabelTextStyle: TextStyle(
        color: AppColors.textMuted,
        fontWeight: FontWeight.w500,
      ),
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: AppColors.surfaceHigh,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.glassBorderHighlight),
      ),
      textStyle: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
      waitDuration: const Duration(milliseconds: 450),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: AppColors.background,
        elevation: 3,
        shadowColor: AppColors.accentGlow,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        textStyle: const TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: 15,
          letterSpacing: 0.2,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.accent,
        side: BorderSide(color: AppColors.accent.withValues(alpha: 0.5)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.accent,
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.surfaceHigh.withValues(alpha: 0.7),
      disabledColor: AppColors.surface,
      selectedColor: AppColors.accent.withValues(alpha: 0.2),
      secondarySelectedColor: AppColors.accent,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      labelStyle: const TextStyle(
        color: AppColors.textPrimary,
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
      secondaryLabelStyle: const TextStyle(color: AppColors.accent),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.glassBorder, width: 0.8),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surfaceHigh.withValues(alpha: 0.6),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: AppColors.glassBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: AppColors.glassBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: AppColors.accent, width: 1.8),
      ),
      hintStyle: const TextStyle(color: AppColors.textMuted),
      labelStyle: const TextStyle(color: AppColors.textSecondary),
    ),
    textTheme: const TextTheme(
      headlineMedium: TextStyle(
        color: AppColors.textPrimary,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.6,
      ),
      titleLarge: TextStyle(
        color: AppColors.textPrimary,
        fontWeight: FontWeight.w700,
        fontSize: 18,
        letterSpacing: -0.3,
      ),
      titleMedium: TextStyle(
        color: AppColors.textPrimary,
        fontWeight: FontWeight.w600,
        fontSize: 16,
      ),
      bodyLarge: TextStyle(color: AppColors.textSecondary, fontSize: 15),
      bodyMedium: TextStyle(color: AppColors.textMuted, fontSize: 13),
      labelMedium: TextStyle(
        color: AppColors.textMuted,
        fontSize: 12,
        fontWeight: FontWeight.w500,
      ),
    ),
  );
}
