/// Synced phone-notification feed (O+ "Content Sync" parity, v1).
///
/// On Android this tails the platform notification-listener event channel;
/// every other platform yields an empty feed so the UI can show a tailored
/// empty state instead of branching on [Platform] itself.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/notification_sync.dart';

class AppNotification {
  const AppNotification({
    required this.title,
    required this.body,
    this.packageName,
    required this.receivedAt,
  });

  final String title;
  final String body;
  final String? packageName;
  final DateTime receivedAt;
}

final notificationFeedProvider = StreamProvider<List<AppNotification>>(
  (ref) async* {
    yield const <AppNotification>[];
    final feed = <AppNotification>[];
    await for (final event in NotificationSync.events) {
      final title = (event['title'] as String?) ??
          (event['app'] as String?) ??
          'Notification';
      final body =
          (event['text'] as String?) ?? (event['body'] as String?) ?? '';
      feed.insert(
        0,
        AppNotification(
          title: title,
          body: body,
          packageName: event['packageName'] as String?,
          receivedAt: DateTime.now(),
        ),
      );
      if (feed.length > 50) feed.removeLast();
      yield feed.toList();
    }
  },
);
