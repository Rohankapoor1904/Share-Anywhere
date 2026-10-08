/// Modal dialogs and bottom sheets.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/protocol/models.dart';
import '../format.dart';
import '../theme.dart';

/// Asks the user to accept an incoming transfer.
Future<bool> showIncomingRequestDialog(
  BuildContext context, {
  required String fromDevice,
  required List<FileDescriptor> files,
}) async {
  final total = files.fold<int>(0, (sum, f) => sum + f.size);
  final result = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (context) => AlertDialog(
      title: Text('$fromDevice wants to send'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${files.length} file(s) · ${formatBytes(total)}'),
          const SizedBox(height: 12),
          ...files.take(5).map((f) => Text('• ${f.fileName}')),
          if (files.length > 5) Text('…and ${files.length - 5} more'),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Decline'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Accept'),
        ),
      ],
    ),
  );
  return result ?? false;
}

/// Collects a PIN from the sender when the receiver challenges them.
Future<String?> showPinDialog(BuildContext context, String deviceName) {
  return showDialog<String>(
    context: context,
    barrierDismissible: false,
    builder: (context) => _PinDialog(deviceName: deviceName),
  );
}

class _PinDialog extends StatefulWidget {
  const _PinDialog({required this.deviceName});
  final String deviceName;

  @override
  State<_PinDialog> createState() => _PinDialogState();
}

class _PinDialogState extends State<_PinDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Enter pairing PIN'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Ask ${widget.deviceName} for the 6-digit code shown on its screen.'),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            autofocus: true,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 28, letterSpacing: 12),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(border: OutlineInputBorder()),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, _controller.text),
          child: const Text('Send'),
        ),
      ],
    );
  }
}

/// Shows the PIN the receiver should read out to the sender.
Future<void> showReceiverPinDialog(
  BuildContext context, {
  required String deviceName,
  required String pin,
}) {
  return showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Verify this device'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('$deviceName is trying to connect.'),
          const SizedBox(height: 16),
          SelectableText(
            pin,
            style: const TextStyle(
              fontSize: 40,
              letterSpacing: 14,
              fontWeight: FontWeight.bold,
              color: AppColors.accent,
            ),
          ),
          const SizedBox(height: 12),
          const Text('Ask the sender to type this code.'),
        ],
      ),
      actions: [
        FilledButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Done'),
        ),
      ],
    ),
  );
}

/// Bottom sheet for choosing a peer on phones.
Future<DeviceInfo?> showDevicePicker(BuildContext context, List<DeviceInfo> peers) {
  return showModalBottomSheet<DeviceInfo>(
    context: context,
    showDragHandle: true,
    builder: (context) => SafeArea(
      child: ListView(
        shrinkWrap: true,
        children: [
          for (final peer in peers)
            ListTile(
              leading: const Icon(Icons.devices),
              title: Text(peer.displayName),
              subtitle: Text(peer.discoveredVia.name),
              onTap: () => Navigator.pop(context, peer),
            ),
        ],
      ),
    ),
  );
}
