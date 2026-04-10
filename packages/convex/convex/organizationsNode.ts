"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

type ResendEmailRequest = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
};

type InvitationTokenData = {
  token: string;
  tokenHash: string;
  expiresAt: number;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInvitationTtlHours(): number {
  const raw = process.env.INVITATION_TTL_HOURS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 72;
}

async function hashToken(token: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(token).digest("hex");
}

async function generateInvitationTokenData(): Promise<InvitationTokenData> {
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = await hashToken(token);
  const expiresAt = Date.now() + getInvitationTtlHours() * 60 * 60 * 1000;
  return { token, tokenHash, expiresAt };
}

function formatInviteText(args: {
  organizationName: string;
  roleLabel: string;
  inviterLine: string;
  inviteUrl: string;
}) {
  return [
    `Te invitaron a unirte a ${args.organizationName} como ${args.roleLabel}.`,
    args.inviterLine,
    "",
    `Accede desde aqui: ${args.inviteUrl}`,
    "",
    "Si no esperabas esta invitacion, ignora este email.",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatInviteHtml(args: {
  organizationName: string;
  roleLabel: string;
  inviterLine: string;
  inviteUrl: string;
}) {
  const organizationName = escapeHtml(args.organizationName);
  const roleLabel = escapeHtml(args.roleLabel);
  const inviterLine = escapeHtml(args.inviterLine);
  const inviteUrl = escapeHtml(args.inviteUrl);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
      <h2 style="margin-bottom: 12px;">Invitacion al dashboard</h2>
      <p style="margin: 0 0 10px;">
        Te invitaron a unirte a <strong>${organizationName}</strong> como <strong>${roleLabel}</strong>.
      </p>
      <p style="margin: 0 0 20px;">${inviterLine}</p>
      <a
        href="${inviteUrl}"
        style="display: inline-block; background: #111827; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;"
      >
        Abrir plataforma
      </a>
      <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
        Si no esperabas esta invitacion, ignora este email.
      </p>
    </div>
  `;
}

async function sendWithResend(payload: ResendEmailRequest) {
  const resendApiKey = getRequiredEnv("RESEND_API_KEY");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend request failed (${response.status}): ${body}`);
  }
}

export const hashInvitationToken = internalAction({
  args: {
    token: v.string(),
  },
  handler: async (_ctx, args) => {
    return await hashToken(args.token.trim());
  },
});

export const sendStaffInvitationEmail = internalAction({
  args: {
    invitationId: v.id("organizationInvitations"),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.runQuery(
      internal.organizations.getInvitationEmailPayloadInternal,
      { invitationId: args.invitationId },
    );
    if (!invitation) {
      return {
        status: "skipped" as const,
        reason: "invitation_not_pending" as const,
      };
    }

    const from = getRequiredEnv("RESEND_FROM_EMAIL");
    const appUrl = getRequiredEnv("INVITATION_APP_URL").replace(/\/+$/, "");
    const replyTo = process.env.RESEND_REPLY_TO?.trim() || undefined;
    const tokenData = await generateInvitationTokenData();

    await ctx.runMutation(
      internal.organizations.attachInvitationTokenInternal,
      {
        invitationId: invitation.invitationId,
        tokenHash: tokenData.tokenHash,
        expiresAt: tokenData.expiresAt,
      },
    );

    const inviterLine = invitation.inviterName
      ? `${invitation.inviterName} te envio esta invitacion.`
      : "Un administrador te envio esta invitacion.";
    const inviteUrl = `${appUrl}/invitations/accept?token=${encodeURIComponent(tokenData.token)}`;

    const subject = `${invitation.organizationName}: invitacion como ${invitation.roleLabel}`;
    const text = formatInviteText({
      organizationName: invitation.organizationName,
      roleLabel: invitation.roleLabel,
      inviterLine,
      inviteUrl,
    });
    const html = formatInviteHtml({
      organizationName: invitation.organizationName,
      roleLabel: invitation.roleLabel,
      inviterLine,
      inviteUrl,
    });

    await sendWithResend({
      from,
      to: [invitation.email],
      subject,
      html,
      text,
      reply_to: replyTo,
    });

    return { status: "sent" as const };
  },
});
