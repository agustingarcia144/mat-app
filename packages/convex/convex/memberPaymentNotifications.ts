/**
 * Notifications and structured logging for member payments.
 *
 * Two audiences with different needs:
 *
 * - **Members** need to know when money moved, when it did not, and by when
 *   they have to act. Every message says what happened and what to do next.
 * - **Admins and support** need to know when something is broken in a way a
 *   member cannot fix — a dead connection, an operation the provider keeps
 *   rejecting, a charge that does not match what was agreed.
 *
 * Nothing here logs or sends a token, a raw provider payload, or a payer's
 * contact details. Messages carry ids that identify a resource, never a
 * credential.
 */

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const dayLabel = (value: number) =>
  new Date(value).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  });

const money = (value: number) => `$${value.toLocaleString("es-AR")}`;

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------

export type MemberPaymentLogEvent =
  | "checkout_started"
  | "checkout_failed"
  | "webhook_received"
  | "webhook_rejected"
  | "payment_approved"
  | "payment_failed"
  | "grace_opened"
  | "grace_expired"
  | "access_restored"
  | "operation_failed"
  | "connection_unhealthy"
  | "reconciliation_repair";

/**
 * One structured line per notable event, correlated by organization and the
 * provider resource it concerns.
 *
 * The fields are an allowlist rather than a spread: it is the only way to be
 * sure a future caller cannot pass a token or a payer email into the logs by
 * handing over a whole document.
 */
export function logMemberPaymentEvent(params: {
  event: MemberPaymentLogEvent;
  organizationId?: string;
  /** Provider resource id — identifies a charge, not a person. */
  providerResourceId?: string;
  externalReference?: string;
  agreementId?: string;
  sessionId?: string;
  operationId?: string;
  amountArs?: number;
  status?: string;
  /** Must already be sanitized by the caller. */
  reason?: string;
}) {
  const line = {
    scope: "member_payments",
    event: params.event,
    organizationId: params.organizationId,
    providerResourceId: params.providerResourceId,
    externalReference: params.externalReference,
    agreementId: params.agreementId,
    sessionId: params.sessionId,
    operationId: params.operationId,
    amountArs: params.amountArs,
    status: params.status,
    reason: params.reason?.slice(0, 300),
  };

  const isProblem =
    params.event === "checkout_failed" ||
    params.event === "webhook_rejected" ||
    params.event === "payment_failed" ||
    params.event === "operation_failed" ||
    params.event === "connection_unhealthy";

  if (isProblem) {
    console.error(JSON.stringify(line));
  } else {
    console.log(JSON.stringify(line));
  }
}

// ---------------------------------------------------------------------------
// Member notifications
// ---------------------------------------------------------------------------

const MEMBER_MESSAGES = {
  member_payment_approved: {
    title: "Pago acreditado",
    body: "Recibimos tu pago. Ya tenés acceso a las clases.",
  },
  member_payment_failed: {
    title: "No pudimos cobrarte",
    body: "Mercado Pago rechazó el cobro. Revisá tu tarjeta para no perder el acceso.",
  },
  member_payment_grace_ending: {
    title: "Tu acceso vence pronto",
    body: "Todavía no pudimos cobrarte. Actualizá tu medio de pago para seguir entrenando.",
  },
  member_payment_suspended: {
    title: "Tu plan quedó suspendido",
    body: "No pudimos cobrarte a tiempo. Regularizá el pago para recuperar el acceso.",
  },
  member_payment_recovered: {
    title: "¡Todo en orden!",
    body: "Recibimos tu pago y recuperaste el acceso a las clases.",
  },
  member_checkout_incomplete: {
    title: "Te quedó un pago sin terminar",
    body: "No llegaste a completar el pago en Mercado Pago. Podés intentarlo de nuevo cuando quieras.",
  },
} as const;

type SimpleMemberEvent = keyof typeof MEMBER_MESSAGES;

/**
 * Send one member notification, deduplicated by event key.
 *
 * The key includes the thing the message is about, so a webhook redelivery or
 * a second worker pass cannot notify a member twice about the same charge.
 */
export const notifyMember = internalMutation({
  args: {
    userId: v.string(),
    event: v.union(
      v.literal("member_payment_approved"),
      v.literal("member_payment_failed"),
      v.literal("member_payment_grace_ending"),
      v.literal("member_payment_suspended"),
      v.literal("member_payment_recovered"),
      v.literal("member_checkout_incomplete"),
    ),
    /** Unique per occurrence: a transaction, an agreement plus a cycle, etc. */
    dedupeKey: v.string(),
    subscriptionId: v.optional(v.id("memberPlanSubscriptions")),
  },
  handler: async (ctx, args) => {
    const message = MEMBER_MESSAGES[args.event as SimpleMemberEvent];

    await ctx.scheduler.runAfter(
      0,
      internal.pushNotificationsNode.sendExpoPushForEvent,
      {
        eventKey: `${args.event}:${args.dedupeKey}`,
        type: args.event,
        userId: args.userId,
        subscriptionId: args.subscriptionId,
        title: message.title,
        body: message.body,
        data: { type: args.event, href: "/(tabs)/plan" },
      },
    );

    return { enqueued: true };
  },
});

/** A price change the member should hear about before it is charged. */
export const notifyAmountChange = internalMutation({
  args: {
    userId: v.string(),
    subscriptionId: v.id("memberPlanSubscriptions"),
    dedupeKey: v.string(),
    newAmountArs: v.number(),
    effectiveAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(
      0,
      internal.pushNotificationsNode.sendExpoPushForEvent,
      {
        eventKey: `member_payment_amount_changed:${args.dedupeKey}`,
        type: "member_payment_amount_changed",
        userId: args.userId,
        subscriptionId: args.subscriptionId,
        title: "Cambia el importe de tu plan",
        body: args.effectiveAt
          ? `Desde el ${dayLabel(args.effectiveAt)} vas a pagar ${money(args.newAmountArs)}. Este mes no cambia.`
          : `Tu próximo cobro va a ser de ${money(args.newAmountArs)}.`,
        data: { type: "member_payment_amount_changed", href: "/(tabs)/plan" },
      },
    );

    return { enqueued: true };
  },
});

/** Confirmation that a cancellation was recorded, with the date access ends. */
export const notifyCancellationScheduled = internalMutation({
  args: {
    userId: v.string(),
    subscriptionId: v.id("memberPlanSubscriptions"),
    accessEndsAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(
      0,
      internal.pushNotificationsNode.sendExpoPushForEvent,
      {
        eventKey: `member_payment_cancellation_scheduled:${args.subscriptionId}:${args.accessEndsAt}`,
        type: "member_payment_cancellation_scheduled",
        userId: args.userId,
        subscriptionId: args.subscriptionId,
        title: "Cancelamos tu débito automático",
        body: `No te vamos a cobrar más. Mantenés el acceso hasta el ${dayLabel(args.accessEndsAt)}.`,
        data: {
          type: "member_payment_cancellation_scheduled",
          href: "/(tabs)/plan",
        },
      },
    );

    return { enqueued: true };
  },
});

// ---------------------------------------------------------------------------
// Admin alerts
// ---------------------------------------------------------------------------

/**
 * Tell a gym's admins about something only they can fix.
 *
 * The body names the gym-side problem and, where relevant, the provider
 * resource id support will need. It never contains a token, a payer email or a
 * provider payload.
 */
export const alertAdmins = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    kind: v.union(
      v.literal("connection_broken"),
      v.literal("operation_failed"),
      v.literal("amount_mismatch"),
      v.literal("payment_reversed"),
      v.literal("reconciliation_mismatch"),
    ),
    /** Unique per occurrence so admins are not told the same thing twice. */
    dedupeKey: v.string(),
    /** Support-safe reference: a provider resource id or an internal id. */
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admins = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_role", (q) =>
        q.eq("organizationId", args.organizationId).eq("role", "admin"),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const message = ADMIN_MESSAGES[args.kind];
    const suffix = args.correlationId ? ` (ref: ${args.correlationId})` : "";

    for (const admin of admins) {
      await ctx.scheduler.runAfter(
        0,
        internal.pushNotificationsNode.sendExpoPushForEvent,
        {
          eventKey: `member_payment_admin_alert:${args.kind}:${args.dedupeKey}:${admin.userId}`,
          type: "member_payment_admin_alert",
          userId: admin.userId,
          title: message.title,
          body: `${message.body}${suffix}`,
          data: { type: "member_payment_admin_alert", kind: args.kind },
        },
      );
    }

    return { notifiedAdmins: admins.length };
  },
});

const ADMIN_MESSAGES = {
  connection_broken: {
    title: "Revisá tu conexión con Mercado Pago",
    body: "No podemos cobrar a tus socios hasta que vuelvas a conectar la cuenta desde Configuración.",
  },
  operation_failed: {
    title: "Una operación con Mercado Pago falló",
    body: "Quedó una operación pendiente que necesita tu revisión en Pagos.",
  },
  amount_mismatch: {
    title: "Un cobro no coincide con lo acordado",
    body: "Revisalo en Pagos antes de dar acceso al socio.",
  },
  payment_reversed: {
    title: "Se revirtió un cobro",
    body: "Un socio recibió una devolución o hizo un contracargo. Revisalo en Pagos.",
  },
  reconciliation_mismatch: {
    title: "Encontramos una diferencia en los cobros",
    body: "Revisá los cobros de Mercado Pago en Pagos.",
  },
} as const;
