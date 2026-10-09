import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';

/// Android notification-listener integration.
///
/// Other platforms intentionally do not call these channels. Android users
/// must grant notification access in system settings before events are sent.
class NotificationSync {
  static const _methods =
      MethodChannel('dev.localshare.localshare/notification_sync');
  static const _events =
      EventChannel('dev.localshare.localshare/notification_events');

  static Future<bool> isAccessGranted() async {
    if (!Platform.isAndroid) return false;
    return await _methods.invokeMethod<bool>('isNotificationAccessGranted') ??
        false;
  }

  static Future<bool> openAccessSettings() async {
    if (!Platform.isAndroid) return false;
    return await _methods
            .invokeMethod<bool>('openNotificationAccessSettings') ??
        false;
  }

  static Stream<Map<String, dynamic>> get events {
    if (!Platform.isAndroid) return const Stream.empty();
    return _events
        .receiveBroadcastStream()
        .where(
          (event) => event is Map,
        )
        .map(
          (event) => Map<String, dynamic>.from(event as Map),
        );
  }
}
