# Member rewards and QR check-in

## What is implemented

MAT Rewards is an organization-scoped attendance and loyalty capability. It is
intentionally independent from LITE, PRO, and the future ULTRA plan. The future
billing integration point is `rewardCapabilityEnabled` in
`packages/convex/convex/rewardsDomain.ts`.

The current release includes:

- Configurable points per attendance and paid membership month, daily limits,
  eligible sources, streak bonuses, weekly goals, point naming, terms, and gym
  timezone.
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
- A gym-admin Wallet card designer in the web dashboard with global or
  membership-plan-specific branding and live Apple/Google previews.
- A durable Wallet update queue with retry/backoff. Wallet failures never roll
  back a check-in, reward entry, or redemption.
- A short-lived machine-readable access decision suitable for a future trusted
  turnstile controller.

No points expire. Existing attendance and already-approved payments are not
backfilled automatically.

## Wallet card customization

Gym admins configure membership cards from **Recompensas > Tarjetas Wallet**
in the web dashboard. A gym can use one global card design for every member or
enable per-plan designs. The global design remains the fallback when a member
has no current plan or their plan has no override.

The first customization release supports:

- A card/program name and solid background color.
- Reuse of the gym logo from organization settings, or a separate PNG/JPG logo.
- Native visual backgrounds using a solid color, generated linear gradient, or
  uploaded PNG/JPG image, up to 5 MB per image.
- Apple-specific logo text, foreground color, and label color.
- An optional Google-specific program name.
- Side-by-side Apple Wallet and Google Wallet previews using sample member,
  balance, status, and QR data.
- A preview switch between Apple's Poster Generic layout and its Generic
  fallback. This switch is for inspection only: issued Apple passes contain
  both layouts so iOS can choose the compatible one.

The browser previews reproduce the providers' native layouts without claiming
pixel parity. Apple and Google own the final rendering and can change it by OS,
device, or Wallet release. Neither platform accepts a CSS gradient over the
whole card, so MAT renders gradients to an image and places visual backgrounds
in each provider's native artwork area. Issued Apple cards use the membership-
appropriate `posterGeneric` style on iOS 27 and later, with full `artwork.png`,
primary logo, membership fields, and QR code. The same pass includes a standard
`generic` layout, logo, and optional thumbnail as Apple's recommended fallback
for iOS 26 and earlier. Google uses loyalty-class branding, program logo, hero
image, loyalty points, and barcode.

Apple owns the Poster Generic barcode layout. MAT omits optional barcode text
so Wallet can render the smallest native white QR tile over the artwork and
footer material. Member and points fields sit in the lower material region to
preserve contrast over detailed artwork; Apple controls the final translucency
and blur. Google loyalty passes always retain their native card-title
section: its logo, issuer/program name, position, and header background cannot
be removed through a template override. A Google hero image therefore begins
below that title section rather than becoming full-card artwork.

Apple artwork is embedded in the signed `.pkpass`. Google artwork is delivered
from the gym's stored assets over HTTPS. Saving a design queues updates for all
active Wallet passes. Apple devices retrieve a newly signed pass after APNs
notification; Google loyalty classes and objects are patched through the Wallet
API. Provider failures use the existing retry queue and never affect check-in or
rewards accounting.

When per-plan mode is enabled, MAT resolves the design from the member's current
active subscription, then a scheduled cancellation that still grants access,
then another non-cancelled subscription. Google uses a separate loyalty class
for each customized plan because Google stores shared visual branding at class
level. See the official [Apple Wallet pass format](https://developer.apple.com/documentation/walletpasses/pass)
and [Google Wallet loyalty template](https://developers.google.com/wallet/retail/loyalty-cards/resources/template).

## Domain rules

- Every record is scoped to one organization.
- The gym-local calendar date is used for daily and weekly rules.
- A general entrance is valid attendance without a class reservation.
- Class attendance and entrance scans use the same daily award operation.
- Attendance can award points at most once per gym-local calendar day. This is
  intentionally not a rolling 24-hour window and is not configurable.
- When **Meses de antigüedad** is enabled, each newly approved, non-bonified
  paid billing month awards the configured points once. Consecutive unique
  `YYYY-MM` billing periods are counted across the member's plans; a missing
  paid month resets the consecutive-month count.
- Payment rewards are idempotent per payment. A refund or chargeback of the
  current payment adds a compensating ledger reversal instead of editing
  history.
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
   staff role, membership, subscription, and whether an allowed entrance was
   already recorded on that gym-local calendar date.
4. MAT returns an `allowed` decision, safe reason code, decision ID, and short
   decision expiration.
5. An allowed entrance is recorded and a matching class is linked when
   unambiguous.
6. Points and configured bonuses are written to the immutable ledger.
7. Wallet synchronization is queued after balance changes.

QR payloads are never stored in check-in history or intentionally logged.
An exact dynamic-token replay is always denied. A new QR scanned after a valid
entrance on the same gym-local calendar date is shown as a duplicate for
reception UX, returns `actuateAccess: false`, and cannot authorize a second
physical actuation. The first valid scan after local midnight starts a new day,
even when fewer than 24 hours have elapsed.

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
9. Change the global design and a plan-specific design, then verify existing
   passes refresh and new passes use the correct plan fallback.

Configure an approved PNG logo in the Wallet card designer. Until then Apple
uses generated solid fallback artwork. Verify both the Poster Generic layout on
iOS 27 or later and the Generic fallback on an iOS 26-or-earlier device or
simulator.

## Google Wallet manual verification

1. Create/approve the issuer account and authorize the service account.
2. Configure the Google variables in a non-production deployment.
3. Add the card from a real Android device.
4. Confirm the loyalty class/object is accepted by the issuer review state.
5. Scan the Wallet QR and compare the member name/photo at reception.
6. Earn and redeem points, then verify the object balance is patched.
7. Suspend access and verify the object becomes inactive while backend access
   remains authoritative.
8. Change the global design and a plan-specific design, then verify the Wallet
   class/object update and correct fallback for each plan.

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
- Final Wallet card artwork for each gym or membership plan.
- A future turnstile controller and relay integration are deliberately not part
  of this release.
