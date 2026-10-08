/// LocalShare — cross-platform, serverless local file sharing.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';

import 'ui/home_screen.dart';
import 'ui/providers.dart';
import 'ui/screens/permissions_screen.dart';
import 'ui/theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: LocalShareApp()));
}

class LocalShareApp extends StatelessWidget {
  const LocalShareApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LocalShare',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: const _StartupGate(),
    );
  }
}

/// On mobile, asks for discovery permissions before starting the engine.
/// Desktop has no runtime permissions, so it goes straight to the app.
class _StartupGate extends ConsumerStatefulWidget {
  const _StartupGate();

  @override
  ConsumerState<_StartupGate> createState() => _StartupGateState();
}

class _StartupGateState extends ConsumerState<_StartupGate> {
  bool? _granted;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    if (!Platform.isAndroid && !Platform.isIOS) {
      setState(() => _granted = true);
      return;
    }
    final scan = await Permission.bluetoothScan.status;
    final nearby = await Permission.nearbyWifiDevices.status;
    setState(() => _granted = scan.isGranted || nearby.isGranted);
  }

  @override
  Widget build(BuildContext context) {
    if (_granted == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_granted == false) {
      final caps = ref.watch(capabilitiesProvider).valueOrNull;
      if (caps == null) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      return PermissionsScreen(capabilities: caps);
    }
    return const HomeScreen();
  }
}
