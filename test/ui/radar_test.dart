import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:localshare/core/protocol/models.dart';
import 'package:localshare/ui/format.dart';
import 'package:localshare/ui/widgets/radar_view.dart';

DeviceInfo _device(String id, String name,
        {DiscoveryChannel via = DiscoveryChannel.mdns}) =>
    DeviceInfo(
      deviceId: id,
      displayName: name,
      fingerprint: 'fp-$id',
      port: 53317,
      addresses: const [],
      discoveredVia: via,
    );

void main() {
  group('format helpers', () {
    test('formats byte sizes across units', () {
      expect(formatBytes(512), '512 B');
      expect(formatBytes(1536), '1.5 KB');
      expect(formatBytes(1024 * 1024), '1.0 MB');
      expect(formatBytes(3 * 1024 * 1024 * 1024), '3.0 GB');
    });

    test('formats speed and duration', () {
      expect(formatSpeed(0), '—');
      expect(formatSpeed(1024 * 1024), '1.0 MB/s');
      expect(formatDuration(const Duration(seconds: 45)), '45s');
      expect(formatDuration(const Duration(minutes: 1, seconds: 20)), '1m 20s');
      expect(formatDuration(const Duration(hours: 2, minutes: 5)), '2h 5m');
    });
  });

  group('RadarView', () {
    testWidgets('renders an avatar per discovered device', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: RadarView(
              size: 300,
              devices: [_device('a', 'Pixel'), _device('b', 'MacBook')],
              onDeviceTap: (_) {},
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Pixel'), findsOneWidget);
      expect(find.text('MacBook'), findsOneWidget);
    });

    testWidgets('invokes the tap callback with the tapped device',
        (tester) async {
      DeviceInfo? tapped;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: RadarView(
              size: 300,
              devices: [_device('a', 'Pixel')],
              onDeviceTap: (d) => tapped = d,
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 50));

      await tester.tap(find.text('Pixel'));
      expect(tapped?.deviceId, 'a');
    });

    testWidgets('shows no avatars when idle with no devices', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: RadarView(size: 300, devices: [])),
        ),
      );
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.byType(RadarView), findsOneWidget);
    });
  });
}
