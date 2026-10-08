/// A plain-HTTP listener hosting the LocalSend v2 upload API.
///
/// LocalSend's default transport is `http` (its HTTPS mode uses mutual TLS that
/// a Dart `HttpServer` cannot satisfy for *outgoing* transfers). Serving the
/// compat routes on their own plain listener — advertised in our LocalSend
/// `info.port` — lets official LocalSend clients talk to LocalShare without
/// disturbing our own TLS endpoint.
library;

import 'dart:async';
import 'dart:io';

import 'localsend_models.dart';
import 'localsend_receiver.dart';

class LocalSendServer {
  LocalSendServer(
      {required this.receiver, this.preferredPort = kLocalSendPort});

  final LocalSendReceiver receiver;

  /// Tried first; an ephemeral port is used when it is taken.
  final int preferredPort;

  HttpServer? _server;

  int get boundPort => _server?.port ?? preferredPort;

  Future<void> start() async {
    try {
      _server = await HttpServer.bind(InternetAddress.anyIPv4, preferredPort,
          shared: false);
    } on SocketException {
      // Another LocalSend instance owns the default port; fall back to ephemeral
      // and advertise the real port through discovery.
      _server =
          await HttpServer.bind(InternetAddress.anyIPv4, 0, shared: false);
    }
    unawaited(_serve(_server!));
  }

  Future<void> _serve(HttpServer server) async {
    await for (final request in server) {
      unawaited(_dispatch(request));
    }
  }

  Future<void> _dispatch(HttpRequest request) async {
    try {
      if (await receiver.handle(request)) return;
      request.response.statusCode = HttpStatus.notFound;
      await request.response.close();
    } on Object {
      try {
        await request.response.close();
      } on Object {
        // Response already closed by the handler.
      }
    }
  }

  Future<void> stop() async {
    await _server?.close(force: true);
    _server = null;
  }
}
