# LocalShare — Audit & Jules Improvement Plan

Audit basis: `flutter analyze` clean, `dart format` clean, `flutter test`
27/27 pass, `flutter build linux --debug` + headless run OK. The engine is
solid; the gaps below are mostly receive-side UX, desktop/mobile parity and
feature depth.

Each workstream is written so it can be assigned to Jules as one task. Jules
does best with well-scoped tasks that end in a reviewable PR.

---

## Ground rules for every task (paste into each Jules task)

- Environment: paste `tools/jules_setup.sh` body into the Jules environment
  setup field. Pin Flutter 3.27.1.
- Keep **all three green**: `flutter analyze`, `dart format --output=none
  --set-exit-if-changed lib test`, `flutter test`.
- `lib/core/` must stay pure Dart (no Flutter/plugin imports).
- Do not break LocalSend v2 interop or the existing 27 tests.
- Do not change `kProtocolVersion`, `kLocalSendPort`, the wire models, or the
  TLS/pinning flow without an explicit migration note.
- Add/adjust tests for every behavioural change. No mocks of transport — use
  the existing real-socket e2e style.
- Keep the current design language (Spatial/Liquid Glass tokens in
  `lib/ui/theme.dart`). Prefer tokens over magic numbers.
- One PR per workstream, conventional commit messages.

---

## Severity 1 — correctness / functional bugs

### W1. Receive-side PIN pairing is dead code
- `PairingSettings.autoAcceptAll` defaults to `true`
  (`lib/core/session/pairing_manager.dart:22`) and there is no UI to change it,
  so `evaluate()` accepts everyone and never challenges.
- `PairingManager.onChallenge` is never assigned anywhere; therefore
  `showReceiverPinDialog` (`lib/ui/widgets/dialogs.dart:294`) is unreachable.
- The README advertises "unknown peers get a short PIN challenge" — untrue today.

Acceptance criteria:
- Expose pairing policy: auto-accept trusted (default on), auto-accept all
  (default off), in a Settings section persisted via `shared_preferences`.
- Wire `onChallenge` from `LocalShareNode` up to the UI and show
  `showReceiverPinDialog` with the generated PIN when an unknown peer connects.
- Add a test: unknown peer → `SessionDecision.challenge()`; correct PIN →
  accept; 3 wrong attempts → `reject('too_many_attempts')`.
- Sender side: wrong/expired PIN surfaces a clear error in the UI, not a silent
  fallback.

### W2. Incoming transfer progress is never rendered
- `home_screen.dart:95` writes to `receiveProgressProvider`, but no widget reads
  it. Receivers see no progress for incoming files.

Acceptance criteria:
- Show live incoming progress (file name, %, speed, ETA) in the Share Hub and/or
  Transfers tab, mirroring the outbound `TransferTile`.
- Reuse `TransferProgress` (`lib/core/transport/progress.dart`); do not invent a
  second progress model.
- Test that a real local send makes the receive progress observable.

### W3. Declining an incoming transfer is a no-op for the sender
- `_promptIncoming` (`lib/ui/home_screen.dart:143`) returns `false` on decline
  and does nothing; the transport session times out instead of a clean reject.

Acceptance criteria:
- Add an explicit reject path on `LocalShareNode` that returns a rejection to
  the peer (and removes the session from `_activeSessions`).
- Sender shows "Receiver declined" (distinct from a network error).

### W4. Sent history never records the peer name
- `SentHistoryController.add` accepts `peerName` but `home_screen.dart:98` never
  passes it, so the "to <device>" subtitle (`transfers_screen.dart:263`) is
  always hidden.

Acceptance criteria:
- Record which peer each file was sent to; render it; migrate old entries
  gracefully (peerName stays optional).

### W5. `send()` masks real errors by blind LocalSend fallback
- `lib/core/node.dart:481` catches **any** exception and retries over LocalSend,
  including local I/O/permission failures. This hides root causes and can
  double-send.

Acceptance criteria:
- Only fall back to LocalSend when the failure is genuinely a TLS/handshake or
  incompatible-peer failure. Propagate local/validation errors unchanged.
- Add a test proving a disk/permission error is surfaced, not retried.

### W6. Self-device card hardcodes a phone icon on desktop
- `devices_screen.dart:148` always uses `Icons.smartphone_rounded`.
- Use `deviceIconFor`/`Platform` so desktop shows a computer icon.

---

## Severity 2 — desktop parity

### W7. No minimum window size / no window state persistence
- `linux/runner/my_application.cc:50` sets 1280x720 but nothing prevents the
  user shrinking the window until layouts overflow, and size/position is not
  remembered.
- Add `window_manager` (or platform-specific code) to set a sensible minimum
  size, remember size/position, and (optionally) a title-bar integration.
- Verify layouts do not overflow at the minimum size on all four tabs.

### W8. Closing the window kills receive; no tray
- No system tray / minimise-to-tray and no background receive. Add an optional
  tray with Increase/Show/Quit, and keep the engine alive when the window is
  hidden (opt-in setting).
- Android: add a foreground service + progress notification so long transfers
  survive backgrounding.

### W9. Transfer controls missing
- `TransferTile` (`lib/ui/widgets/tiles.dart:140`) has no actions: no cancel,
  pause/resume, or retry for failed transfers.
- Add cancel + retry (and pause/resume if the chunk engine supports it) with
  proper engine wiring and tests.

### W10. Drag-and-drop only stages files
- Dropping files always stages into the queue. Allow dropping onto a peer card
  to send directly to that peer.

### W11. Shortcut discoverability
- Ctrl+S / Ctrl+A / Esc exist (`home_screen.dart:252`) but are undocumented.
  Add a "Keyboard shortcuts" section and right-click context menus on peers and
  files.

---

## Severity 3 — mobile parity

### W12. Add QR pairing
- Manual IP entry is clunky. Show a QR code of `{ip, port, fingerprint}` on the
  receiver and let the sender scan it (mobile camera). Add `qr_flutter` +
  `mobile_scanner`. This is the biggest UX win for phone-to-phone.

### W13. OS share-sheet integration
- Register LocalShare as a share target on Android/iOS so other apps can "Share
  to LocalShare". Needs `receive_sharing_intent` and manifest/plist changes.

### W14. Theme setting
- App ships one dark theme. Add a System / Light / Dark setting (build a
  light `ColorScheme` in `theme.dart`) persisted via prefs, keeping the dark
  theme as default.

### W15. Localisation
- All strings are hardcoded English. Extract to ARB + `intl`; at minimum enable
  the `flutter_localizations` delegate and externalise user-facing strings.

---

## Severity 4 — UI/UX polish

### W16. Responsive layout gaps
- Tablet widths 600–1000 fall back to the phone single-column layout
  (`home_screen.dart:186`, `share_hub_screen.dart:53`). Add a two-column
  medium breakpoint.
- Mobile Share Hub uses fixed heights (330/230/350/260,
  `share_hub_screen.dart:112`), which overflow on small phones or large font
  scale. Replace with intrinsic/constraint-driven sizing and verify with
  `MediaQuery.textScaler` at 1.3–1.5x.
- Bottom padding hardcodes 72 for the nav bar; derive from the actual bar height
  + safe-area inset.

### W17. Accessibility
- `textMuted` (#64748B) on `background` (#070B14) fails WCAG AA for small text —
  raise contrast for body/meta text.
- Add `Semantics` labels/tooltips to icon-only buttons that lack them.
- Verify focus traversal on TV/desktop for every interactive element.

### W18. Radar cost on mobile
- `RadarView` runs an endless 3.2s `AnimationController` even with zero peers.
  Throttle when idle, pause when backgrounded, and honour `disableAnimations`.
  Add a low-power mode in Settings.

### W19. Consistency + feedback
- Unify empty/loading/error states (some use `EmptyState`, some ad-hoc
  `GlassCard`).
- Add haptics on mobile for send/receive/pair and a sound/notification on
  received files (opt-in).

### W20. Behaviour settings
- Surface transfer concurrency, chunk size, and auto-accept policy in Settings
  (currently fixed in code).

---

## Suggested assignment order

1. W1, W2, W3, W4, W5, W6 — correctness first (small PRs).
2. W7, W9, W8 — desktop essentials.
3. W16, W17, W18 — responsiveness + a11y + perf.
4. W12, W14, W13, W15 — new mobile features.
5. W10, W11, W19, W20 — polish.

## Copy-paste master prompt (single big task)

> You are improving the LocalShare Flutter app. Read AGENTS.md and
> README.md first. Fix the issues listed in JULES_TASKS.md, starting with
> Severity 1, then Severity 2. Keep `flutter analyze`, `dart format
> --set-exit-if-changed lib test`, and `flutter test` green at every step. Keep
> `lib/core/` pure Dart and do not break LocalSend v2 interop. Add tests for
> every behavioural change. Open one PR per workstream with a clear description,
> a summary of the fix, and the acceptance criteria you verified. If a task
> needs a new dependency, justify it in the PR. Report back with a checklist of
> which workstreams are done, which are blocked, and why.
