/// Transfers tab: unified sent + received history (O+ "Transfer History").
///
/// Sent completions are recorded by the shell; received files come from the
/// persisted receive history. Type filter chips mirror O+'s Files-by-type
/// browser, and "Clear" wipes only the visible tab.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../format.dart';
import '../receive_controller.dart';
import '../sent_history.dart';
import '../theme.dart';
import '../widgets/device_icons.dart';
import '../widgets/feedback.dart';
import '../widgets/glass_card.dart';
import '../widgets/states.dart';
import '../widgets/tiles.dart';

class TransfersScreen extends ConsumerStatefulWidget {
  const TransfersScreen({super.key});

  @override
  ConsumerState<TransfersScreen> createState() => _TransfersScreenState();
}

class _TransfersScreenState extends ConsumerState<TransfersScreen> {
  bool _showSent = false;
  FileCategory? _filter;

  @override
  Widget build(BuildContext context) {
    final sent = ref.watch(sentHistoryProvider);
    final received = ref.watch(receivedFilesHistoryProvider);
    final visibleCount = _showSent ? sent.length : received.length;

    return Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionHeader(
            icon: Icons.swap_horiz_rounded,
            title: 'Transfers',
            subtitle: '${sent.length} sent • ${received.length} received',
            color: AppColors.accent,
            trailing: visibleCount > 0
                ? TextButton.icon(
                    style: TextButton.styleFrom(
                      backgroundColor: AppColors.surfaceHigh,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                        side: const BorderSide(color: AppColors.glassBorder),
                      ),
                    ),
                    onPressed: () => _showSent
                        ? ref.read(sentHistoryProvider.notifier).clear()
                        : ref
                            .read(receivedFilesHistoryProvider.notifier)
                            .clear(),
                    icon: const Icon(
                      Icons.delete_sweep_rounded,
                      size: 16,
                      color: AppColors.danger,
                    ),
                    label: const Text(
                      'Clear',
                      style: TextStyle(fontSize: 12, color: AppColors.danger),
                    ),
                  )
                : null,
          ),
          const SizedBox(height: 14),
          SegmentedButton<bool>(
            segments: [
              ButtonSegment(
                value: false,
                icon: const Icon(Icons.download_rounded, size: 16),
                label: Text('Received (${received.length})'),
              ),
              ButtonSegment(
                value: true,
                icon: const Icon(Icons.upload_rounded, size: 16),
                label: Text('Sent (${sent.length})'),
              ),
            ],
            selected: {_showSent},
            onSelectionChanged: (selection) => setState(() {
              _showSent = selection.first;
              _filter = null;
            }),
          ),
          const SizedBox(height: 12),
          _TypeFilters(
            fileNames: _showSent
                ? sent.map((e) => e.fileName)
                : received.map((e) => e.file.fileName),
            selected: _filter,
            onSelect: (category) => setState(() => _filter = category),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: _showSent
                ? _SentList(
                    items: _filter == null
                        ? sent
                        : sent
                            .where(
                              (e) => fileCategoryFor(e.fileName) == _filter,
                            )
                            .toList(),
                  )
                : _ReceivedList(
                    items: _filter == null
                        ? received
                        : received
                            .where(
                              (e) =>
                                  fileCategoryFor(e.file.fileName) == _filter,
                            )
                            .toList(),
                  ),
          ),
        ],
      ),
    );
  }
}

/// Horizontal type-filter chips with per-category counts.
class _TypeFilters extends StatelessWidget {
  const _TypeFilters({
    required this.fileNames,
    required this.selected,
    required this.onSelect,
  });

  final Iterable<String> fileNames;
  final FileCategory? selected;
  final ValueChanged<FileCategory?> onSelect;

  @override
  Widget build(BuildContext context) {
    final counts = <FileCategory, int>{};
    for (final name in fileNames) {
      final category = fileCategoryFor(name);
      counts[category] = (counts[category] ?? 0) + 1;
    }
    final present = FileCategory.values.where((c) => counts[c] != null);
    if (present.isEmpty) return const SizedBox.shrink();

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          ChoiceChip(
            label: const Text('All'),
            selected: selected == null,
            onSelected: (_) => onSelect(null),
          ),
          for (final category in present)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: _CategoryChip(
                category: category,
                count: counts[category]!,
                selected: selected == category,
                onTap: () => onSelect(
                  selected == category ? null : category,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.category,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final FileCategory category;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final meta = fileCategoryMeta(category);
    return ChoiceChip(
      avatar: Icon(meta.icon, size: 15, color: meta.color),
      label: Text('${meta.label} ($count)'),
      selected: selected,
      onSelected: (_) => onTap(),
    );
  }
}

class _SentList extends StatelessWidget {
  const _SentList({required this.items});

  final List<SentFileItem> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const Center(
        child: EmptyState(
          icon: Icons.upload_rounded,
          title: 'Nothing sent yet',
          subtitle: 'Completed outbound transfers will appear here.',
          color: AppColors.accent,
        ),
      );
    }
    return ListView.builder(
      itemCount: items.length,
      itemBuilder: (context, i) {
        final item = items[i];
        final meta = fileCategoryMeta(fileCategoryFor(item.fileName));
        return Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.surfaceGlass,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.glassBorder, width: 0.8),
            boxShadow: AppShadows.glowSoft,
          ),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 4,
            ),
            leading: IconBadge(
              icon: meta.icon,
              color: meta.color,
              size: 20,
              padding: 10,
            ),
            title: Text(
              item.fileName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 14,
                color: AppColors.textPrimary,
              ),
            ),
            subtitle: Text(
              [
                formatBytes(item.size),
                if (item.peerName != null && item.peerName!.isNotEmpty)
                  'to ${item.peerName}',
                _timeAgo(item.sentAt),
              ].join(' • '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.textMuted,
                fontSize: 12,
              ),
            ),
            trailing: const Icon(
              Icons.check_circle_rounded,
              color: AppColors.success,
              size: 20,
            ),
          ),
        );
      },
    );
  }
}

class _ReceivedList extends ConsumerWidget {
  const _ReceivedList({required this.items});

  final List<ReceivedFileItem> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (items.isEmpty) {
      final hasHistory = ref.watch(receivedFilesHistoryProvider).isNotEmpty;
      return Center(
        child: hasHistory
            ? const EmptyState(
                icon: Icons.filter_alt_off_rounded,
                title: 'No files of this type',
                subtitle: 'Try a different filter.',
                color: AppColors.textMuted,
              )
            : GlassCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: 36,
                  vertical: 32,
                ),
                borderRadius: 24,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceHigh.withValues(alpha: 0.5),
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.glassBorder),
                      ),
                      child: const Icon(
                        Icons.folder_open_rounded,
                        size: 42,
                        color: AppColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'No received files yet',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Transfers received on this device will automatically log here.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
      );
    }
    return ListView.builder(
      itemCount: items.length,
      itemBuilder: (context, i) {
        final item = items[i];
        return ReceivedFileTile(
          fileName: item.file.fileName,
          path: item.path,
          size: item.file.size,
          onOpen: () => _openPath(context, item.path),
          onOpenFolder: () => _openPath(
            context,
            File(item.path).parent.path,
          ),
          onCopy: () {
            Clipboard.setData(ClipboardData(text: item.path));
            showTransferNotice(
              context,
              'File path copied to clipboard',
              icon: Icons.copy_rounded,
              color: AppColors.success,
            );
          },
        );
      },
    );
  }

  Future<void> _openPath(BuildContext context, String path) async {
    final opened = await launchUrl(
      Uri.file(path),
      mode: LaunchMode.externalApplication,
    );
    if (!opened && context.mounted) {
      showTransferNotice(
        context,
        'No application is available to open this location.',
        icon: Icons.open_in_new_rounded,
        color: AppColors.warning,
      );
    }
  }
}

String _timeAgo(DateTime time) {
  final delta = DateTime.now().difference(time);
  if (delta.inMinutes < 1) return 'just now';
  if (delta.inHours < 1) return '${delta.inMinutes}m ago';
  if (delta.inDays < 1) return '${delta.inHours}h ago';
  if (delta.inDays < 30) return '${delta.inDays}d ago';
  return '${time.year}-${time.month.toString().padLeft(2, '0')}-'
      '${time.day.toString().padLeft(2, '0')}';
}
