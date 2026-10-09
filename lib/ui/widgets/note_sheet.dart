/// Text-note composer (O+ clipboard-sync, lightweight edition).
///
/// The transport only moves files, so a note is staged as a `Note.txt` file
/// through the normal queue — zero protocol changes, same PIN + encryption.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme.dart';
import 'device_icons.dart';

/// Opens the composer; returns the trimmed note, or null when dismissed.
Future<String?> showNoteComposer(BuildContext context) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: const _NoteComposerSheet(),
    ),
  );
}

class _NoteComposerSheet extends StatefulWidget {
  const _NoteComposerSheet();

  @override
  State<_NoteComposerSheet> createState() => _NoteComposerSheetState();
}

class _NoteComposerSheetState extends State<_NoteComposerSheet> {
  static const _maxLength = 2000;
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _paste() async {
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final text = data?.text;
    if (text == null || text.isEmpty || !mounted) return;
    final current = _controller.text;
    final merged = (current + text).trim();
    _controller.text =
        merged.length > _maxLength ? merged.substring(0, _maxLength) : merged;
    _controller.selection = TextSelection.collapsed(
      offset: _controller.text.length,
    );
    setState(() {});
  }

  void _save() {
    final text = _controller.text.trim();
    Navigator.pop(context, text.isEmpty ? null : text);
  }

  @override
  Widget build(BuildContext context) {
    final count = _controller.text.length;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const IconBadge(
                  icon: Icons.sticky_note_2_outlined,
                  size: 20,
                  padding: 9,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Share a note',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                TextButton.icon(
                  onPressed: _paste,
                  icon: const Icon(Icons.content_paste_rounded, size: 16),
                  label: const Text('Paste'),
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Staged as Note.txt and sent with the same encryption as files.',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _controller,
              autofocus: true,
              minLines: 4,
              maxLines: 8,
              maxLength: _maxLength,
              textInputAction: TextInputAction.newline,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Type or paste text to send…',
                counterText: '',
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  '$count / $_maxLength',
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 11,
                  ),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: count == 0 ? null : _save,
                  icon: const Icon(Icons.note_add_rounded, size: 18),
                  label: const Text('Stage note'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
