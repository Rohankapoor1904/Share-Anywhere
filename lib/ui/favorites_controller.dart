/// Favorite (pinned) peers, keyed by deviceId and persisted locally.
///
/// Mirrors the O+ Connect "linked devices" idea: peers the user cares about
/// surface first in the Devices tab, independent of discovery order.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FavoritesController extends Notifier<Set<String>> {
  static const _historyKey = 'favorite_device_ids';

  @override
  Set<String> build() {
    unawaited(_load());
    return {};
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_historyKey) ?? const [];
    if (state.isEmpty && raw.isNotEmpty) state = raw.toSet();
  }

  bool isFavorite(String deviceId) => state.contains(deviceId);

  Future<void> toggle(String deviceId) async {
    final next = Set<String>.from(state);
    if (next.contains(deviceId)) {
      next.remove(deviceId);
    } else {
      next.add(deviceId);
    }
    state = next;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_historyKey, next.toList());
  }

  /// Fire-and-forget wrapper for button callbacks that need a void signature.
  void toggleSync(String deviceId) => unawaited(toggle(deviceId));
}

final favoritesProvider = NotifierProvider<FavoritesController, Set<String>>(
  FavoritesController.new,
);
