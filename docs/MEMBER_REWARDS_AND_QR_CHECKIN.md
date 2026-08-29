# Member rewards and QR check-in

## What is implemented

MAT Rewards is an organization-scoped attendance and loyalty capability. It is
intentionally independent from LITE, PRO, and the future ULTRA plan. The future
billing integration point is `rewardCapabilityEnabled` in
`packages/convex/convex/rewardsDomain.ts`.

The current release includes:

- Configurable points per attendance, daily limits, duplicate window, eligible
  sources, streak bonuses, weekly goals, point naming, terms, and gym timezone.
- A normalized gym entrance independent from class reservations.
- Automatic class linking when exactly one reservation is eligible; reception
  can select when multiple classes match.
- An immutable reward ledger, cached account balances, reconciliation audit,
  manual adjustments, reversals, reward catalog, and fulfillment workflow.
- Short-lived in-app QR codes and revocable static Wallet QR credentials.
- An authenticated USB/HID scanner screen at `/dashboard/check-in`.
- Member Rewards, QR, catalog, history, redemption, and Wallet actions in the
  mobile app.
- Member streak/weekly progress and membership-access state in the mobile app.
- Apple Wallet pass generation and pass-update web-service endpoints.
- Google Wallet save JWTs and loyalty-object updates.
- A durable Wallet update queue with retry/backoff. Wallet failures never roll
  back a check-in, reward entry, or redemption.
- A short-lived machine-readable access decision suitable for a future trusted
  turnstile controller.

No points expire. Existing attendance is not backfilled automatically.

## Domain rules

- Every record is scoped to one organization.
- The gym-local calendar date is used for daily and weekly rules.
- A general entrance is valid attendance without a class reservation.
- Class attendance and entrance scans use the same daily award operation.
- The default is 10 points once per day and a 30-minute duplicate window, but
  the gym can change these values.
- Rule changes are prospective. Each attendance ledger entry stores the rule,
  local date, timezone, and source applied at the time.
- The ledger is the accounting source of truth. Cached balances are updated in
  the same Convex transaction.
- Redemption debits are atomic. Concurrent requests cannot overspend.
- Cancelling a redemption adds a reversal; it never edits ledger history.
- Voiding the only valid attendance for a date adds compensating reversals for
  the attendance and any streak/weekly bonus that is no longer earned. A later
  genuine attendance can earn the points again.

## Check-in flow

1. The member displays a 60-second QR in MAT or a static QR in Wallet.
2. The USB scanner types the payload into the authenticated reception page and
   sends Enter.
3. The backend verifies the signature, credential state, organization, replay,
   staff role, membership, subscription, and duplicate window.
4. MAT returns an `allowed` decision, safe reason code, decision ID, and short
   decision expiration.
5. An allowed entrance is recorded and a matching class is linked when
   unambiguous.
6. Points and configured bonuses are written to the immutable ledger.
7. Wallet synchronization is queued after balance changes.

QR payloads are never stored in check-in history or intentionally logged.
An exact dynamic-token replay is denied even inside the duplicate window. A
new QR scanned shortly after a valid entrance is shown as a duplicate for
reception UX, but returns `actuateAccess: false` and cannot authorize a second
physical actuation.

## Compatible USB scanner configuration

Use a 2D area-imager QR scanner that can read phone screens.

Configure it as:

- USB HID / keyboard mode
- The reception computer's keyboard layout
- Enter/CR suffix after each scan
- No prefix
- QR Code enabled

Open `/dashboard/check-in`, click the input once if necessary, and scan a test
code from both a bright and dim phone screen. The scanner is input only; it
must not be wired directly to a door relay.

## Future turnstile integration

The current response separates credential capture from access authorization.
A future local controller should receive a fresh backend decision and then
actuate the turnstile.

The controller must:

- Have organization/device credentials distinct from member QR credentials.
- Verify the decision ID, organization/device binding, allowed state, and short
  expiration.
- Prevent replay of a previously used decision.
- Report successful or failed actuation.
- Fail closed when it cannot validate a decision.
- Have a documented emergency/manual access procedure.

Never add an unauthenticated `open turnstile` endpoint and never let browser
JavaScript be the physical-access authority.

## Environment variables

Core QR signing:

```text
REWARDS_QR_SIGNING_SECRET=<at least 32 random characters>
```

Generate a high-entropy deployment secret and keep it stable. Changing it
invalidates all existing dynamic and Wallet QR signatures until credentials
and passes are reissued.

Apple Wallet:

```text
APPLE_WALLET_PASS_TYPE_ID=pass.com.example.mat
APPLE_WALLET_TEAM_ID=<Apple Team ID>
APPLE_WALLET_WWDR_CERT=<PEM text or base64 certificate>
APPLE_WALLET_SIGNER_CERT=<PEM text or base64 pass certificate>
APPLE_WALLET_SIGNER_KEY=<PEM text or base64 private key>
APPLE_WALLET_SIGNER_KEY_PASSPHRASE=<optional>
APPLE_WALLET_WEB_SERVICE_URL=https://<convex-site>/wallet/apple
APPLE_WALLET_APNS_PRODUCTION=true
```

The Pass Type ID and signing certificate must correspond. The web-service URL
must be publicly reachable over HTTPS. Do not commit certificates or keys.

Google Wallet:

```text
GOOGLE_WALLET_ISSUER_ID=<issuer numeric ID>
GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL=<service account email>
GOOGLE_WALLET_PRIVATE_KEY=<PEM private key; escaped newlines are accepted>
GOOGLE_WALLET_ALLOWED_ORIGINS=https://matgestion.app
```

The service account must be authorized in the Google Wallet issuer account.
Automated tests do not need provider credentials.

## Apple Wallet manual verification

1. Create the Pass Type ID and certificate in Apple Developer.
2. Export/convert the signer certificate and private key to PEM.
3. Configure the current Apple WWDR certificate.
4. Set all Apple variables in a non-production Convex deployment.
5. Enable Rewards for a pilot gym and add the card from a real iPhone.
6. Confirm the QR scans, the displayed member/photo matches reception, and the
   card cannot be shared when the OS honors `sharingProhibited`.
7. Earn points and verify the APNs update causes Wallet to request the latest
   pass.
8. Suspend access and confirm the pass eventually displays the updated status;
   the scanner must deny access regardless of displayed Wallet state.

Replace the generated solid placeholder pass icons with approved MAT/gym pass
artwork before the public launch.

## Google Wallet manual verification

1. Create/approve the issuer account and authorize the service account.
2. Configure the Google variables in a non-production deployment.
3. Add the card from a real Android device.
4. Confirm the loyalty class/object is accepted by the issuer review state.
5. Scan the Wallet QR and compare the member name/photo at reception.
6. Earn and redeem points, then verify the object balance is patched.
7. Suspend access and verify the object becomes inactive while backend access
   remains authoritative.

## Operations

- `auditAccountBalances` reports cached/ledger mismatches and never changes
  data. The admin page warns when a discrepancy exists.
- Dynamic QR replay records are purged every six hours.
- Wallet operations run every minute and retry transient failures with bounded
  exponential backoff. They become terminal after six failed attempts.
- Active passes receive an hourly status-refresh operation so subscription
  changes outside Rewards reach Wallet without coupling payment code to Wallet.
- Raw QR payloads, Wallet authentication tokens, certificates, and private keys
  must not be sent to logging or analytics systems.

## Rollout

1. Configure only `REWARDS_QR_SIGNING_SECRET` and pilot the in-app QR.
2. Test a USB area-imager at reception.
3. Configure Apple Wallet in a development environment and verify on device.
4. Configure Google Wallet and complete issuer review/device verification.
5. Pilot with one gym and monitor denials, duplicates, Wallet failures, ledger
   discrepancies, and redemption issues.
6. Attach `rewardCapabilityEnabled` to the future ULTRA entitlement only after
   the isolated feature set and plan pricing are approved.

## Known manual dependencies

- Apple Developer certificates, Pass Type ID, and a physical iPhone.
- Google Wallet issuer approval, service-account credentials, and an Android
  device.
- A real USB 2D area-imager scanner.
- Final Wallet pass artwork.
- A future turnstile controller and relay integration are deliberately not part
  of this release.
