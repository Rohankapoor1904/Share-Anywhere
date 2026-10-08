/// Tracks progress of in-flight received files and history of saved files.
library;

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
  @override
  List<ReceivedFileItem> build() => [];

  void add(FileDescriptor file, String path) {
    state = [
      ReceivedFileItem(
        file: file,
        path: path,
        receivedAt: DateTime.now(),
      ),
      ...state,
    ];
  }

  void clear() => state = [];
}

final receivedFilesHistoryProvider =
    NotifierProvider<ReceivedFilesHistoryController, List<ReceivedFileItem>>(
  ReceivedFilesHistoryController.new,
);
