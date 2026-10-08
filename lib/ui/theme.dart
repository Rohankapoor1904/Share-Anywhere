/// Design tokens for the LocalShare UI.
///
/// A dark, high-contrast palette so the radar glow reads well on phones, TV and
/// desktop, with a single vivid accent for progress and active peers.
library;

import 'package:flutter/material.dart';

abstract final class AppColors {
  static const background = Color(0xFF0B1020);
  static const surface = Color(0xFF141B2E);
  static const surfaceHigh = Color(0xFF1D2740);
  static const accent = Color(0xFF4FC3F7);
  static const accentDeep = Color(0xFF2979FF);
  static const success = Color(0xFF43D9AD);
  static const warning = Color(0xFFFFB74D);
  static const danger = Color(0xFFFF5252);
  static const textPrimary = Color(0xFFF4F7FF);
  static const textMuted = Color(0xFF9AA7C7);
}

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.accentDeep,
    brightness: Brightness.dark,
  ).copyWith(
    surface: AppColors.background,
    primary: AppColors.accent,
    secondary: AppColors.success,
    error: AppColors.danger,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    fontFamily: 'Roboto',
    visualDensity: VisualDensity.adaptivePlatformDensity,
    cardTheme: const CardThemeData(
      color: AppColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(20)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: AppColors.background,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    textTheme: const TextTheme(
      headlineMedium: TextStyle(
        color: AppColors.textPrimary,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
      ),
      titleMedium: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600),
      bodyMedium: TextStyle(color: AppColors.textMuted),
    ),
  );
}
