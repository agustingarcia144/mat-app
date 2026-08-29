import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "auto-mark-class-no-shows",
  { minutes: 15 },
  internal.classReservations.autoMarkNoShows,
  {
    scheduleLimit: 100,
  },
);

crons.interval(
  "send-class-reminders-minus-1h",
  { minutes: 5 },
  internal.pushNotifications.sendPreClassReminders,
  {
    lookAheadMinutes: 60,
    windowMinutes: 10,
    scheduleLimit: 150,
  },
);

crons.interval(
  "send-attendance-reminders-plus-1h",
  { minutes: 5 },
  internal.pushNotifications.sendAttendanceReminders,
  {
    delayMinutes: 60,
    windowMinutes: 10,
    scheduleLimit: 150,
  },
);

// Runs every hour on the hour; the handler only acts on organizations whose
// local time is the configured reminder hour.
crons.hourly(
  "send-plan-expiration-reminders",
  { minuteUTC: 0 },
  internal.pushNotifications.sendPlanExpirationReminders,
  {},
);

crons.interval(
  "auto-suspend-unpaid-subscriptions",
  { hours: 1 },
  internal.memberPlanSubscriptions.autoSuspendUnpaid,
  {},
);

crons.interval(
  "generate-bonification-payments",
  { hours: 24 },
  internal.planBonifications.generateBonificationPayments,
  {},
);

crons.interval(
  "generate-recurring-finance-transactions",
  { hours: 24 },
  internal.finance.generateRecurringTransactions,
  {},
);

// --- Member -> gym payments -------------------------------------------------

// Rotate each gym's MercadoPago access token before it expires, so a webhook
// or a scheduled charge never fails on an expired credential.
crons.interval(
  "refresh-member-payment-connections",
  { hours: 12 },
  internal.memberPaymentsActions.refreshExpiringConnections,
  { limit: 25 },
);

// Safety net for the provider-operation outbox. Enqueueing schedules the
// worker immediately; this catches backoff retries and anything that kick
// missed.
crons.interval(
  "run-member-payment-provider-operations",
  { minutes: 1 },
  internal.memberPaymentsActions.runProviderOperations,
  { limit: 20 },
);

// Warn members a day before their grace period closes, so a failed card is
// something they can still fix rather than something they discover too late.
crons.interval(
  "notify-member-payment-grace-deadlines",
  { hours: 6 },
  internal.memberPayments.notifyGraceDeadlines,
  {},
);

// Suspend members whose grace period ran out without a successful retry.
// Separate from auto-suspend-unpaid-subscriptions, which owns manual
// (transfer/cash) subscriptions only.
crons.interval(
  "expire-member-payment-grace-periods",
  { hours: 1 },
  internal.memberPayments.expireMemberPaymentGracePeriods,
  { limit: 50 },
);

// End access for members whose cancellation date has arrived. Runs hourly so
// access ends close to the date the member was shown.
crons.interval(
  "expire-scheduled-member-cancellations",
  { hours: 1 },
  internal.memberPayments.expireScheduledCancellations,
  { limit: 50 },
);

// Webhooks get lost, delayed and dropped. Reconciliation asks Mercado Pago
// what actually happened instead of waiting for a notification that may never
// arrive, and clears out abandoned checkouts.
crons.interval(
  "reconcile-member-payments",
  { minutes: 15 },
  internal.memberPaymentsActions.reconcileMemberPayments,
  { limit: 25 },
);

// Aggregate the previous month's member-payment commission per gym. Runs
// daily and is idempotent: only accrued entries from a closed month are
// settled, so repeat runs cannot invoice a gym twice.
crons.interval(
  "settle-member-payment-commissions",
  { hours: 24 },
  internal.platformCommissions.settleMonthlyCommissions,
  {},
);

// OAuth states are single-use and short-lived; drop the ones never consumed.
crons.interval(
  "purge-expired-payment-oauth-states",
  { hours: 24 },
  internal.memberPayments.purgeExpiredOAuthStatesInternal,
  { limit: 200 },
);

// Wallet balance/status updates are intentionally eventual: they must never
// roll back a valid check-in or reward-ledger transaction.
crons.interval(
  "run-wallet-sync-operations",
  { minutes: 1 },
  internal.walletActions.runWalletSyncOperations,
  { limit: 20 },
);

crons.interval(
  "purge-expired-reward-qr-tokens",
  { hours: 6 },
  internal.rewards.purgeExpiredQrTokens,
  { limit: 500 },
);

// Membership state can change outside the rewards domain. Hourly refreshes
// keep Wallet status current without coupling payment mutations to providers.
crons.interval(
  "enqueue-wallet-membership-refresh",
  { hours: 1 },
  internal.rewards.enqueueStaleWalletPassUpdates,
  { limit: 500 },
);

export default crons;
