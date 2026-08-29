"use node";

import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { Buffer } from "node:buffer";
import { createSign } from "node:crypto";
import { deflateSync } from "node:zlib";
import { PKPass } from "passkit-generator";
import { Notification, Provider } from "@parse/node-apn";
import { signApplePassAuthenticationToken, signWalletQr } from "./rewardsQr";

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function solidPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 4;
      row[offset] = 18;
      row[offset + 1] = 24;
      row[offset + 2] = 38;
      row[offset + 3] = 255;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_CONFIGURATION_REQUIRED`);
  return value;
}

function certificateValue(name: string): Buffer | string {
  const value = requireEnv(name);
  return value.includes("-----BEGIN")
    ? value.replace(/\\n/g, "\n")
    : Buffer.from(value, "base64");
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signGoogleJwt(payload: Record<string, unknown>): string {
  const email = requireEnv("GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requireEnv("GOOGLE_WALLET_PRIVATE_KEY").replace(
    /\\n/g,
    "\n",
  );
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64Url(
    JSON.stringify({
      iss: email,
      aud: "google",
      typ: "savetowallet",
      iat: now,
      ...payload,
    }),
  );
  const unsigned = `${header}.${body}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64Url(signer.sign(privateKey))}`;
}

function signGoogleOAuthAssertion(): string {
  const email = requireEnv("GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requireEnv("GOOGLE_WALLET_PRIVATE_KEY").replace(
    /\\n/g,
    "\n",
  );
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64Url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/wallet_object.issuer",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3_600,
    }),
  );
  const unsigned = `${header}.${body}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64Url(signer.sign(privateKey))}`;
}

async function generateApplePass(data: {
  organizationName: string;
  memberName: string;
  balance: number;
  pointsName: string;
  membershipStatus: string;
  credentialId: string;
  providerObjectId: string;
}) {
  const passTypeIdentifier = requireEnv("APPLE_WALLET_PASS_TYPE_ID");
  const teamIdentifier = requireEnv("APPLE_WALLET_TEAM_ID");
  const webServiceURL = requireEnv("APPLE_WALLET_WEB_SERVICE_URL").replace(
    /\/$/,
    "",
  );
  const walletQr = await signWalletQr(data.credentialId);
  const authenticationToken = await signApplePassAuthenticationToken(
    data.providerObjectId,
  );
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier,
    teamIdentifier,
    serialNumber: data.providerObjectId,
    organizationName: data.organizationName,
    description: `Membresía de ${data.organizationName}`,
    logoText: data.organizationName,
    sharingProhibited: true,
    webServiceURL,
    authenticationToken,
    backgroundColor: "rgb(18, 24, 38)",
    foregroundColor: "rgb(255, 255, 255)",
    labelColor: "rgb(190, 200, 220)",
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: walletQr,
        messageEncoding: "iso-8859-1",
        altText: "Presentá este código en recepción",
      },
    ],
    generic: {
      primaryFields: [
        { key: "member", label: "SOCIO", value: data.memberName },
      ],
      secondaryFields: [
        { key: "status", label: "MEMBRESÍA", value: data.membershipStatus },
        {
          key: "points",
          label: data.pointsName.toUpperCase(),
          value: data.balance,
        },
      ],
      auxiliaryFields: [],
      headerFields: [],
      backFields: [
        {
          key: "security",
          label: "SEGURIDAD",
          value:
            "La autorización se valida en MAT al momento del ingreso. Esta tarjeta es personal.",
        },
      ],
    },
  };
  const pass = new PKPass(
    {
      "icon.png": solidPng(29, 29),
      "icon@2x.png": solidPng(58, 58),
      "logo.png": solidPng(160, 50),
      "pass.json": Buffer.from(JSON.stringify(passJson)),
    },
    {
      wwdr: certificateValue("APPLE_WALLET_WWDR_CERT"),
      signerCert: certificateValue("APPLE_WALLET_SIGNER_CERT"),
      signerKey: certificateValue("APPLE_WALLET_SIGNER_KEY"),
      signerKeyPassphrase: process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE,
    },
  );
  return pass.getAsBuffer();
}

export const createMyAppleWalletPass = action({
  args: {},
  handler: async (ctx) => {
    const data = await ctx.runMutation(internal.rewards.prepareMyWalletPass, {
      provider: "apple",
    });
    try {
      const buffer = await generateApplePass(data);
      const storageId = await ctx.storage.store(
        new Blob([new Uint8Array(buffer)], {
          type: "application/vnd.apple.pkpass",
        }),
      );
      const url = await ctx.storage.getUrl(storageId);
      if (!url) throw new Error("APPLE_WALLET_FILE_URL_FAILED");
      await ctx.runMutation(internal.rewards.markWalletPassSynced, {
        provider: "apple",
        providerObjectId: data.providerObjectId,
      });
      return { url };
    } catch (error) {
      await ctx.runMutation(internal.rewards.markWalletPassSynced, {
        provider: "apple",
        providerObjectId: data.providerObjectId,
        errorCode:
          error instanceof Error
            ? error.message.slice(0, 120)
            : "APPLE_PASS_FAILED",
      });
      throw error;
    }
  },
});

export const createMyGoogleWalletPass = action({
  args: {},
  handler: async (ctx) => {
    const data = await ctx.runMutation(internal.rewards.prepareMyWalletPass, {
      provider: "google",
    });
    const issuerId = requireEnv("GOOGLE_WALLET_ISSUER_ID");
    const classSuffix = String(data.organizationId).replace(
      /[^A-Za-z0-9_.-]/g,
      "_",
    );
    const classId = `${issuerId}.mat_gym_${classSuffix}`;
    const objectId = `${issuerId}.mat_member_${data.providerObjectId}`;
    const walletQr = await signWalletQr(data.credentialId);
    try {
      const token = signGoogleJwt({
        origins: (
          process.env.GOOGLE_WALLET_ALLOWED_ORIGINS ?? "https://matgestion.app"
        )
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        payload: {
          loyaltyClasses: [
            {
              id: classId,
              issuerName: data.organizationName,
              programName: "Membresía y recompensas",
              reviewStatus: "UNDER_REVIEW",
            },
          ],
          loyaltyObjects: [
            {
              id: objectId,
              classId,
              state: "ACTIVE",
              accountId: data.providerObjectId,
              accountName: data.memberName,
              loyaltyPoints: {
                label: data.pointsName,
                balance: { int: data.balance },
              },
              barcode: {
                type: "QR_CODE",
                value: walletQr,
                alternateText: "Presentá este código en recepción",
              },
              textModulesData: [
                {
                  id: "membership",
                  header: "Membresía",
                  body: data.membershipStatus,
                },
              ],
            },
          ],
        },
      });
      await ctx.runMutation(internal.rewards.markWalletPassSynced, {
        provider: "google",
        providerObjectId: data.providerObjectId,
      });
      return { url: `https://pay.google.com/gp/v/save/${token}` };
    } catch (error) {
      await ctx.runMutation(internal.rewards.markWalletPassSynced, {
        provider: "google",
        providerObjectId: data.providerObjectId,
        errorCode:
          error instanceof Error
            ? error.message.slice(0, 120)
            : "GOOGLE_PASS_FAILED",
      });
      throw error;
    }
  },
});

export const generateApplePassForSerial = internalAction({
  args: { serialNumber: v.string() },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.rewards.getWalletPassDataInternal,
      {
        provider: "apple",
        providerObjectId: args.serialNumber,
      },
    );
    if (!data) return null;
    const buffer = await generateApplePass({
      organizationName: data.organizationName,
      memberName: data.memberName,
      balance: data.balance,
      pointsName: data.pointsName,
      membershipStatus: data.membershipStatus,
      credentialId: data.credentialId,
      providerObjectId: args.serialNumber,
    });
    return buffer.toString("base64");
  },
});

async function pushApplePassUpdate(
  registrations: Array<{ pushToken: string }>,
) {
  if (registrations.length === 0) return [] as string[];
  const provider = new Provider({
    cert: certificateValue("APPLE_WALLET_SIGNER_CERT"),
    key: certificateValue("APPLE_WALLET_SIGNER_KEY"),
    passphrase: process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE,
    production: process.env.APPLE_WALLET_APNS_PRODUCTION !== "false",
  });
  try {
    const notification = new Notification();
    notification.topic = requireEnv("APPLE_WALLET_PASS_TYPE_ID");
    notification.expiry = Math.floor(Date.now() / 1000) + 300;
    notification.priority = 5;
    notification.pushType = "background";
    notification.rawPayload = {};
    const response = await provider.send(
      notification,
      registrations.map((item) => item.pushToken),
    );
    const permanentReasons = new Set([
      "BadDeviceToken",
      "DeviceTokenNotForTopic",
      "Unregistered",
    ]);
    const transient = response.failed.filter(
      (failure) => !permanentReasons.has(failure.response?.reason ?? ""),
    );
    if (transient.length > 0) {
      const first = transient[0];
      throw new Error(
        first.response?.reason ?? first.error?.message ?? "APPLE_APNS_FAILED",
      );
    }
    return response.failed.map((failure) => failure.device);
  } finally {
    provider.shutdown();
  }
}

async function updateGoogleWalletObject(data: {
  organizationId: string;
  providerObjectId: string;
  credentialId: string;
  balance: number;
  pointsName: string;
  membershipStatus: string;
}) {
  const assertion = signGoogleOAuthAssertion();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!tokenResponse.ok)
    throw new Error(`GOOGLE_OAUTH_${tokenResponse.status}`);
  const tokenBody = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenBody.access_token) throw new Error("GOOGLE_OAUTH_TOKEN_MISSING");
  const issuerId = requireEnv("GOOGLE_WALLET_ISSUER_ID");
  const objectId = `${issuerId}.mat_member_${data.providerObjectId}`;
  const walletQr = await signWalletQr(data.credentialId);
  const response = await fetch(
    `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${tokenBody.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        state: data.membershipStatus === "Activa" ? "ACTIVE" : "INACTIVE",
        loyaltyPoints: {
          label: data.pointsName,
          balance: { int: data.balance },
        },
        barcode: {
          type: "QR_CODE",
          value: walletQr,
          alternateText: "Presentá este código en recepción",
        },
        textModulesData: [
          {
            id: "membership",
            header: "Membresía",
            body: data.membershipStatus,
          },
        ],
      }),
    },
  );
  if (!response.ok) throw new Error(`GOOGLE_WALLET_PATCH_${response.status}`);
}

export const runWalletSyncOperations = internalAction({
  args: { limit: v.number() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> => {
    const operations: Doc<"walletSyncOperations">[] = await ctx.runMutation(
      internal.rewards.claimWalletSyncOperations,
      { limit: args.limit },
    );
    let succeeded = 0;
    let failed = 0;
    for (const operation of operations) {
      try {
        const resolved = await ctx.runQuery(
          internal.rewards.getWalletPassForMemberInternal,
          {
            organizationId: operation.organizationId,
            userId: operation.userId,
            provider: operation.provider,
          },
        );
        if (!resolved) throw new Error("WALLET_PASS_NOT_FOUND");
        if (operation.provider === "apple") {
          const registrations = await ctx.runQuery(
            internal.rewards.listAppleRegistrationsForSerial,
            { serialNumber: resolved.walletPass.providerObjectId },
          );
          const invalidTokens = await pushApplePassUpdate(registrations);
          if (invalidTokens.length > 0) {
            await ctx.runMutation(
              internal.rewards.deleteAppleRegistrationsByPushTokens,
              { pushTokens: invalidTokens },
            );
          }
        } else {
          await updateGoogleWalletObject({
            organizationId: String(operation.organizationId),
            providerObjectId: resolved.walletPass.providerObjectId,
            credentialId: resolved.credentialId,
            balance: resolved.balance,
            pointsName: resolved.pointsName,
            membershipStatus: resolved.membershipStatus,
          });
        }
        await ctx.runMutation(internal.rewards.finishWalletSyncOperation, {
          id: operation._id,
          succeeded: true,
        });
        succeeded += 1;
      } catch (error) {
        await ctx.runMutation(internal.rewards.finishWalletSyncOperation, {
          id: operation._id,
          succeeded: false,
          errorCode:
            error instanceof Error
              ? error.message.slice(0, 120)
              : "WALLET_SYNC_FAILED",
        });
        failed += 1;
      }
    }
    return { processed: operations.length, succeeded, failed };
  },
});
