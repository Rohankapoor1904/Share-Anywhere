/// History of completed outbound transfers (O+ "Transfer History" parity).
///
/// The engine only emits per-file finish events, so the shell records them
/// here the same way received files are recorded in [receive_controller].
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SentFileItem {
  const SentFileItem({
    required this.fileName,
    required this.size,
    this.peerName,
    required this.sentAt,
  });

  final String fileName;
  final int size;
  final String? peerName;
  final DateTime sentAt;
}

class SentHistoryController extends Notifier<List<SentFileItem>> {
  static const _historyKey = 'sent_file_history';

  @override
  List<SentFileItem> build() {
    unawaited(_load());
    return [];
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_historyKey) ?? const [];
    final loaded = <SentFileItem>[];
    for (final encoded in raw) {
      try {
        final json = jsonDecode(encoded) as Map<String, dynamic>;
        loaded.add(
          SentFileItem(
            fileName: json['fileName'] as String,
            size: (json['size'] as num?)?.toInt() ?? 0,
            peerName: json['peerName'] as String?,
            sentAt: DateTime.parse(json['sentAt'] as String),
          ),
        );
      } on Object {
        // Ignore an individual corrupt history entry and preserve the rest.
      }
    }
    if (state.isEmpty && loaded.isNotEmpty) state = loaded;
  }

  void add({required String fileName, required int size, String? peerName}) {
    state = [
      SentFileItem(
        fileName: fileName,
        size: size,
        peerName: peerName,
        sentAt: DateTime.now(),
      ),
      ...state,
    ];
    unawaited(_persist());
  }

  void clear() {
    state = [];
    unawaited(_persist());
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    final values = state.take(100).map((item) {
      return jsonEncode({
        'fileName': item.fileName,
        'size': item.size,
        'peerName': item.peerName,
        'sentAt': item.sentAt.toIso8601String(),
      });
    }).toList();
    await prefs.setStringList(_historyKey, values);
  }
}

final sentHistoryProvider =
    NotifierProvider<SentHistoryController, List<SentFileItem>>(
  SentHistoryController.new,
);
