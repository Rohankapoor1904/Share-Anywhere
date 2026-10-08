/// Tracks the progress of files currently being received.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/transport/progress.dart';

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
