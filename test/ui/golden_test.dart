import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:localshare/core/node.dart';
import 'package:localshare/core/protocol/models.dart';
import 'package:localshare/ui/home_screen.dart';
import 'package:localshare/ui/providers.dart';
import 'package:localshare/ui/theme.dart';

class _FakeNode implements LocalShareNode {
  @override
  final Stream<EngineEvent> events = const Stream.empty();

  @override
  noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

DeviceInfo _device(String id, String name, String platform,
        {DiscoveryChannel via = DiscoveryChannel.mdns}) =>
    DeviceInfo(
      deviceId: id,
      displayName: name,
      platform: platform,
      fingerprint: 'fp-$id',
      port: 53317,
      addresses: const [],
      discoveredVia: via,
    );

void main() {
  testWidgets('generate app golden screenshot', (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 2.0;

    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final devices = [
      _device('1', 'Pixel 8 Pro', 'android'),
      _device('2', 'MacBook Pro', 'macos'),
      _device('3', 'Living Room TV', 'android-tv'),
    ];

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          deviceNameProvider.overrideWith((ref) => 'My Device'),
          peersProvider.overrideWith((ref) => Stream.value(devices)),
          nodeStartedProvider.overrideWith((ref) async => _FakeNode()),
        ],
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: buildAppTheme(),
          home: const HomeScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    await expectLater(
      find.byType(HomeScreen),
      matchesGoldenFile('goldens/home_screen.png'),
    );
  });
}
