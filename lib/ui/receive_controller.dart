/// Tracks progress of in-flight received files and history of saved files.
library;

import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/protocol/models.dart';
import '../core/transport/progress.dart';

class ReceivedFileItem {
  const ReceivedFileItem({
    required this.file,
    required this.path,
    required this.receivedAt,
  });

  final FileDescriptor file;
  final String path;
  final DateTime receivedAt;
}

class ReceiveController extends Notifier<Map<String, TransferProgress>> {
  @override
  Map<String, TransferProgress> build() => {};

  void update(TransferProgress progress) {
    state = {...state, progress.fileId: progress};
  }

  void clear() => state = {};
}

final receiveProgressProvider =
    NotifierProvider<ReceiveController, Map<String, TransferProgress>>(
  ReceiveController.new,
);

class ReceivedFilesHistoryController extends Notifier<List<ReceivedFileItem>> {
  static const _historyKey = 'received_file_history';

  @override
  List<ReceivedFileItem> build() {
    unawaited(_load());
    return [];
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_historyKey) ?? const [];
    final loaded = <ReceivedFileItem>[];
    for (final encoded in raw) {
      try {
        final json = jsonDecode(encoded) as Map<String, dynamic>;
        loaded.add(
          ReceivedFileItem(
            file: FileDescriptor.fromJson(
                (json['file'] as Map).cast<String, Object?>()),
            path: json['path'] as String,
            receivedAt: DateTime.parse(json['receivedAt'] as String),
          ),
        );
      } on Object {
        // Ignore an individual corrupt history entry and preserve the rest.
      }
    }
    if (state.isEmpty && loaded.isNotEmpty) state = loaded;
  }

  void add(FileDescriptor file, String path) {
    state = [
      ReceivedFileItem(
        file: file,
        path: path,
        receivedAt: DateTime.now(),
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
        'file': item.file.toJson(),
        'path': item.path,
        'receivedAt': item.receivedAt.toIso8601String(),
      });
    }).toList();
    await prefs.setStringList(_historyKey, values);
  }
}

final receivedFilesHistoryProvider =
    NotifierProvider<ReceivedFilesHistoryController, List<ReceivedFileItem>>(
  ReceivedFilesHistoryController.new,
);
