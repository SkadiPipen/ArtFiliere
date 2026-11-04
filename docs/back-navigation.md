# Back navigation after browser refresh

All direct router Back actions now use `src/services/navigation.ts`. Fixed
destination links (for example, "Back to admin"), modal close callbacks, and
the artist-registration form's previous-step action retain their existing meaning.

The shared handler prefers the current navigator stack. If a refresh/direct
entry lost it, it uses the previous internal route saved in this browser tab.
If there is no previous route, it replaces the current page with a defined
parent: profile for account forms/purchases, artist directory for artist browsing,
commissions for commission tracking, message inbox for chat, and rider home for
delivery details. Shared staff review/report pages resolve the account's role to
choose the appropriate dashboard when no history is available.

`BackNavigationTracker` lives under the root AuthProvider. Its session-storage
trail is scoped to the current account, bounded to 30 routes, and trimmed on
back navigation to prevent loops. It stores pathname plus a small allowlist of
record IDs/filter parameters, never artwork image data, documents, signatures,
payment tokens, passwords or form contents. Login/signup/payment-return routes
are excluded. External URLs are not accepted as return targets.

When browser storage is unavailable, the parent fallback still works. Native
navigation uses the existing router stack and parent fallback; per-tab web
storage is not used on native. Existing authorization guards still apply to
every destination; a remembered route does not grant access.

This cannot recover a navigation trail from before the tracker was installed,
after tab storage is cleared, or a brand-new tab with no prior in-app history.
Those cases intentionally use the parent fallback.

Regression checks: `node scripts/test-back-navigation.cjs`. These exercise the
history controller with mocked navigation/storage, including a fresh runtime
simulating reload; they are not a claim of manual device/browser testing of
every screen. Run the project TypeScript check as well.
