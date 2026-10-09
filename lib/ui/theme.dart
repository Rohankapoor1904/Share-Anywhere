/// Design tokens and theme for the LocalShare Spatial & Liquid Glass UI.
///
/// A futuristic, dark spatial aesthetic featuring translucent frosted glass,
/// electric neon gradients, subtle specular edge reflections, and modular Bento tiles.
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
    secondary: AppColors.accentPurple,
    tertiary: AppColors.success,
    error: AppColors.danger,
    onSurface: AppColors.textPrimary,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    fontFamily: 'Roboto',
    visualDensity: VisualDensity.adaptivePlatformDensity,
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
        borderRadius: const BorderRadius.all(Radius.circular(22)),
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
    dividerTheme: const DividerThemeData(
      color: AppColors.glassBorder,
      thickness: 1,
      space: 1,
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
