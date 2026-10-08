/// Drives outbound transfers: file selection, PIN prompts and progress.
library;

import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/node.dart';
import '../core/protocol/models.dart';
import '../core/transport/progress.dart';
import 'providers.dart';

/// A file queued by the user.
class SelectedFile {
  const SelectedFile({required this.path, required this.fileName});
  final String path;
  final String fileName;
}

/// One in-flight (or finished) outbound file.
class OutboundJob {
  OutboundJob({required this.fileName, required this.total});
  final String fileName;
  final int total;
  int transferred = 0;
  double bytesPerSecond = 0;
  String status = 'queued';
}

/// What the PIN dialog should ask for.
class PinRequest {
  const PinRequest(this.deviceName);
  final String deviceName;
}

class SendState {
  const SendState({
    this.files = const [],
    this.jobs = const {},
    this.pinRequest,
    this.error,
    this.busy = false,
  });

  final List<SelectedFile> files;
  final Map<String, OutboundJob> jobs;
  final PinRequest? pinRequest;
  final String? error;
  final bool busy;

  SendState copyWith({
    List<SelectedFile>? files,
    Map<String, OutboundJob>? jobs,
    PinRequest? pinRequest,
    bool clearPin = false,
    String? error,
    bool clearError = false,
    bool? busy,
  }) =>
      SendState(
        files: files ?? this.files,
        jobs: jobs ?? this.jobs,
        pinRequest: clearPin ? null : (pinRequest ?? this.pinRequest),
        error: clearError ? null : (error ?? this.error),
        busy: busy ?? this.busy,
      );
}

class SendController extends Notifier<SendState> {
  Completer<String?>? _pinCompleter;

  @override
  SendState build() => const SendState();

  Future<void> pickFiles() async {
    final result = await FilePicker.platform.pickFiles(allowMultiple: true);
    if (result == null) return;
    final picked = result.files
        .where((f) => f.path != null)
        .map((f) => SelectedFile(path: f.path!, fileName: f.name))
        .toList();
    state = state.copyWith(files: [...state.files, ...picked]);
  }

  void addFiles(List<SelectedFile> files) {
    state = state.copyWith(files: [...state.files, ...files]);
  }

  void removeFile(SelectedFile file) {
    state = state.copyWith(files: state.files.where((f) => f != file).toList());
  }

  void clear() => state = const SendState();

  /// Send the queued files to [peer].
  Future<void> sendTo(DeviceInfo peer) async {
    final node = await ref.read(nodeStartedProvider.future);
    if (state.files.isEmpty) return;

    state = state.copyWith(busy: true, clearError: true);
    try {
      await node.send(
        peer: peer,
        files: state.files
            .map((f) => IncomingFile(path: f.path, fileName: f.fileName))
            .toList(),
        requestPin: _requestPin,
      );
      state = state.copyWith(busy: false);
    } on Object catch (error) {
      state = state.copyWith(busy: false, error: '$error');
    }
  }

  Future<String?> _requestPin(DeviceInfo peer) {
    _pinCompleter = Completer<String?>();
    state = state.copyWith(pinRequest: PinRequest(peer.displayName));
    return _pinCompleter!.future;
  }

  void submitPin(String pin) {
    state = state.copyWith(clearPin: true);
    _pinCompleter?.complete(pin);
    _pinCompleter = null;
  }

  void cancelPin() {
    state = state.copyWith(clearPin: true);
    _pinCompleter?.complete(null);
    _pinCompleter = null;
  }

  /// Apply an engine event to the job table.
  void applyProgress(String fileId, TransferProgress progress) {
    final jobs = Map<String, OutboundJob>.from(state.jobs);
    jobs[fileId] = OutboundJob(fileName: progress.fileName, total: progress.total)
      ..transferred = progress.transferred
      ..bytesPerSecond = progress.bytesPerSecond
      ..status = 'sending';
    state = state.copyWith(jobs: jobs);
  }

  void markDone(String fileId) {
    final jobs = Map<String, OutboundJob>.from(state.jobs);
    jobs[fileId]?.status = 'done';
    state = state.copyWith(jobs: jobs);
  }

  void markFailed(String fileId, Object error) {
    final jobs = Map<String, OutboundJob>.from(state.jobs);
    jobs[fileId]?.status = 'failed';
    state = state.copyWith(jobs: jobs, error: '$error');
  }
}

final sendControllerProvider =
    NotifierProvider<SendController, SendState>(SendController.new);
