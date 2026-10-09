/// Deprecated: the received-only tab was unified into [TransfersScreen].
///
/// Kept as a type alias so stale branches still compile; new code should use
/// `screens/transfers_screen.dart` directly.
library;

import 'transfers_screen.dart';

@Deprecated('Use TransfersScreen instead')
typedef ReceivedScreen = TransfersScreen;
