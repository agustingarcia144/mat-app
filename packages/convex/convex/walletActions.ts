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
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
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

function solidPng(width: number, height: number, color = "#121826"): Buffer {
  const value = color.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
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
      row[offset] = red;
      row[offset + 1] = green;
      row[offset + 2] = blue;
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

function hexToRgb(color: string): string {
  const value = color.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgb(${red}, ${green}, ${blue})`;
}

function formatWalletDate(timestamp: number): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

async function fetchPng(
  url: string | null | undefined,
  dimensions: {
    width: number;
    height: number;
    fit: "contain" | "cover";
    tightCanvas?: boolean;
  },
): Promise<Buffer | null> {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 5_000_000) return null;
  try {
    const isPng = buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const decoded = isPng
      ? PNG.sync.read(buffer)
      : jpeg.decode(buffer, { useTArray: true });
    if (
      !decoded.width ||
      !decoded.height ||
      decoded.width * decoded.height > 25_000_000
    ) {
      return null;
    }
    const source = Buffer.from(decoded.data);
    const scale =
      dimensions.fit === "cover"
        ? Math.max(
            dimensions.width / decoded.width,
            dimensions.height / decoded.height,
          )
        : Math.min(
            dimensions.width / decoded.width,
            dimensions.height / decoded.height,
          );
    const renderedWidth = Math.max(1, Math.round(decoded.width * scale));
    const renderedHeight = Math.max(1, Math.round(decoded.height * scale));
    const outputWidth = dimensions.tightCanvas
      ? renderedWidth
      : dimensions.width;
    const outputHeight = dimensions.tightCanvas
      ? renderedHeight
      : dimensions.height;
    const target = Buffer.alloc(outputWidth * outputHeight * 4);
    const offsetX = dimensions.tightCanvas
      ? 0
      : (outputWidth - renderedWidth) / 2;
    const offsetY = dimensions.tightCanvas
      ? 0
      : (outputHeight - renderedHeight) / 2;
    for (let y = 0; y < outputHeight; y += 1) {
      for (let x = 0; x < outputWidth; x += 1) {
        const sourceX = Math.floor((x - offsetX) / scale);
        const sourceY = Math.floor((y - offsetY) / scale);
        if (
          sourceX < 0 ||
          sourceX >= decoded.width ||
          sourceY < 0 ||
          sourceY >= decoded.height
        ) {
          continue;
        }
        const sourceOffset = (sourceY * decoded.width + sourceX) * 4;
        const targetOffset = (y * outputWidth + x) * 4;
        source.copy(target, targetOffset, sourceOffset, sourceOffset + 4);
      }
    }
    const output = new PNG({
      width: outputWidth,
      height: outputHeight,
    });
    output.data = target;
    return PNG.sync.write(output);
  } catch {
    return null;
  }
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

function googleClassId(
  issuerId: string,
  organizationId: string,
  variantKey: string,
): string {
  const organizationSuffix = organizationId.replace(/[^A-Za-z0-9_.-]/g, "_");
  if (variantKey === "global") {
    return `${issuerId}.mat_gym_${organizationSuffix}`;
  }
  const designSuffix = variantKey.replace(/[^A-Za-z0-9_.-]/g, "_");
  return `${issuerId}.mat_gym_${organizationSuffix}_${designSuffix}`;
}

function googleImage(url: string, description: string) {
  return {
    sourceUri: { uri: url },
    contentDescription: {
      defaultValue: { language: "es", value: description },
    },
  };
}

function googleClassPayload(data: {
  classId: string;
  organizationName: string;
  walletDesign: {
    programName: string;
    showCardName?: boolean;
    backgroundColor: string;
    backgroundStyle?: "solid" | "gradient" | "image";
    logoUrl?: string | null;
    heroImageUrl?: string | null;
    google?: { programName?: string };
  };
}) {
  return {
    id: data.classId,
    issuerName: data.organizationName,
    programName:
      (data.walletDesign.showCardName ?? true)
        ? data.walletDesign.google?.programName || data.walletDesign.programName
        : data.organizationName,
    hexBackgroundColor: data.walletDesign.backgroundColor,
    ...(data.walletDesign.logoUrl
      ? {
          programLogo: googleImage(
            data.walletDesign.logoUrl,
            `Logo de ${data.organizationName}`,
          ),
        }
      : {}),
    ...(data.walletDesign.backgroundStyle !== "solid" &&
    data.walletDesign.heroImageUrl
      ? {
          heroImage: googleImage(
            data.walletDesign.heroImageUrl,
            `Imagen de ${data.organizationName}`,
          ),
        }
      : {}),
    reviewStatus: "UNDER_REVIEW",
  };
}

async function generateApplePass(data: {
  organizationName: string;
  memberName: string;
  balance: number;
  pointsName: string;
  membershipExpiresAt?: number;
  membershipStatus: string;
  credentialId: string;
  providerObjectId: string;
  walletDesign: {
    programName: string;
    showCardName?: boolean;
    backgroundColor: string;
    backgroundStyle?: "solid" | "gradient" | "image";
    showPoints?: boolean;
    logoUrl?: string | null;
    heroImageUrl?: string | null;
    apple?: {
      logoText?: string;
      foregroundColor?: string;
      labelColor?: string;
    };
  };
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
  const artworkUrl =
    data.walletDesign.backgroundStyle !== "solid"
      ? data.walletDesign.heroImageUrl
      : null;
  const [
    customLogo,
    customLogo2x,
    customLogo3x,
    primaryLogo,
    primaryLogo2x,
    primaryLogo3x,
    artwork,
    artwork2x,
    artwork3x,
    thumbnail,
    thumbnail2x,
    thumbnail3x,
    customIcon,
    customIcon2x,
    customIcon3x,
  ] = await Promise.all([
    fetchPng(data.walletDesign.logoUrl, {
      width: 160,
      height: 50,
      fit: "contain",
      tightCanvas: true,
    }),
    fetchPng(data.walletDesign.logoUrl, {
      width: 320,
      height: 100,
      fit: "contain",
      tightCanvas: true,
    }),
    fetchPng(data.walletDesign.logoUrl, {
      width: 480,
      height: 150,
      fit: "contain",
      tightCanvas: true,
    }),
    fetchPng(data.walletDesign.logoUrl, {
      width: 126,
      height: 30,
      fit: "contain",
      tightCanvas: true,
    }),
    fetchPng(data.walletDesign.logoUrl, {
      width: 252,
      height: 60,
      fit: "contain",
      tightCanvas: true,
    }),
    fetchPng(data.walletDesign.logoUrl, {
      width: 378,
      height: 90,
      fit: "contain",
      tightCanvas: true,
    }),
    fetchPng(artworkUrl, { width: 358, height: 448, fit: "cover" }),
    fetchPng(artworkUrl, { width: 716, height: 896, fit: "cover" }),
    fetchPng(artworkUrl, { width: 1074, height: 1344, fit: "cover" }),
    fetchPng(artworkUrl, { width: 90, height: 90, fit: "cover" }),
    fetchPng(artworkUrl, { width: 180, height: 180, fit: "cover" }),
    fetchPng(artworkUrl, { width: 270, height: 270, fit: "cover" }),
    fetchPng(data.walletDesign.logoUrl, {
      width: 38,
      height: 38,
      fit: "contain",
    }),
    fetchPng(data.walletDesign.logoUrl, {
      width: 76,
      height: 76,
      fit: "contain",
    }),
    fetchPng(data.walletDesign.logoUrl, {
      width: 114,
      height: 114,
      fit: "contain",
    }),
  ]);
  const posterFields = {
    headerFields: [
      {
        key: "status",
        label: "MEMBRESÍA",
        value: data.membershipStatus,
        textAlignment: "PKTextAlignmentLeft",
      },
    ],
    primaryFields: [
      { key: "member", label: "SOCIO", value: data.memberName },
      ...(data.membershipExpiresAt
        ? [
            {
              key: "expires",
              label: "VENCE",
              value: formatWalletDate(data.membershipExpiresAt),
            },
          ]
        : []),
    ],
    secondaryFields:
      (data.walletDesign.showPoints ?? true)
        ? [
            {
              key: "points",
              label: data.pointsName.toUpperCase(),
              value: data.balance,
            },
          ]
        : [],
    auxiliaryFields: [],
    footerFields:
      (data.walletDesign.showCardName ?? true)
        ? [{ key: "program", value: data.walletDesign.programName }]
        : [],
    backFields: [
      {
        key: "security",
        label: "SEGURIDAD",
        value:
          "La autorización se valida en MAT al momento del ingreso. Esta tarjeta es personal.",
      },
    ],
  };
  const genericFallbackFields = {
    primaryFields: [{ key: "member", label: "SOCIO", value: data.memberName }],
    secondaryFields: [
      { key: "status", label: "MEMBRESÍA", value: data.membershipStatus },
      ...(data.membershipExpiresAt
        ? [
            {
              key: "expires",
              label: "VENCE",
              value: formatWalletDate(data.membershipExpiresAt),
            },
          ]
        : []),
      ...((data.walletDesign.showPoints ?? true)
        ? [
            {
              key: "points",
              label: data.pointsName.toUpperCase(),
              value: data.balance,
            },
          ]
        : []),
    ],
    auxiliaryFields: [],
    headerFields: [],
    backFields: posterFields.backFields,
  };
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier,
    teamIdentifier,
    serialNumber: data.providerObjectId,
    organizationName: data.organizationName,
    description: `Membresía de ${data.organizationName}`,
    logoText: data.walletDesign.apple?.logoText || data.organizationName,
    sharingProhibited: true,
    webServiceURL,
    authenticationToken,
    backgroundColor: hexToRgb(data.walletDesign.backgroundColor),
    foregroundColor: hexToRgb(
      data.walletDesign.apple?.foregroundColor ?? "#FFFFFF",
    ),
    labelColor: hexToRgb(data.walletDesign.apple?.labelColor ?? "#BEC8DC"),
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: walletQr,
        messageEncoding: "iso-8859-1",
      },
    ],
    // iOS 27+ uses the full-art membership layout. Keeping `generic` beside it
    // is Apple's documented fallback for iOS 26 and earlier.
    posterGeneric: posterFields,
    generic: genericFallbackFields,
  };
  const assets: Record<string, Buffer> = {
    "icon.png":
      customIcon ?? solidPng(38, 38, data.walletDesign.backgroundColor),
    "icon@2x.png":
      customIcon2x ?? solidPng(76, 76, data.walletDesign.backgroundColor),
    "icon@3x.png":
      customIcon3x ?? solidPng(114, 114, data.walletDesign.backgroundColor),
    "logo.png":
      customLogo ?? solidPng(160, 50, data.walletDesign.backgroundColor),
    "logo@2x.png":
      customLogo2x ?? solidPng(320, 100, data.walletDesign.backgroundColor),
    "logo@3x.png":
      customLogo3x ?? solidPng(480, 150, data.walletDesign.backgroundColor),
    "primaryLogo.png":
      primaryLogo ?? solidPng(126, 30, data.walletDesign.backgroundColor),
    "primaryLogo@2x.png":
      primaryLogo2x ?? solidPng(252, 60, data.walletDesign.backgroundColor),
    "primaryLogo@3x.png":
      primaryLogo3x ?? solidPng(378, 90, data.walletDesign.backgroundColor),
    "artwork.png":
      artwork ?? solidPng(358, 448, data.walletDesign.backgroundColor),
    "artwork@2x.png":
      artwork2x ?? solidPng(716, 896, data.walletDesign.backgroundColor),
    "artwork@3x.png":
      artwork3x ?? solidPng(1074, 1344, data.walletDesign.backgroundColor),
    "pass.json": Buffer.from(JSON.stringify(passJson)),
  };
  if (thumbnail) assets["thumbnail.png"] = thumbnail;
  if (thumbnail2x) assets["thumbnail@2x.png"] = thumbnail2x;
  if (thumbnail3x) assets["thumbnail@3x.png"] = thumbnail3x;
  const pass = new PKPass(assets, {
    wwdr: certificateValue("APPLE_WALLET_WWDR_CERT"),
    signerCert: certificateValue("APPLE_WALLET_SIGNER_CERT"),
    signerKey: certificateValue("APPLE_WALLET_SIGNER_KEY"),
    signerKeyPassphrase: process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE,
  });
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
    const classId = googleClassId(
      issuerId,
      String(data.organizationId),
      data.walletDesign.variantKey,
    );
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
            googleClassPayload({
              classId,
              organizationName: data.organizationName,
              walletDesign: data.walletDesign,
            }),
          ],
          loyaltyObjects: [
            {
              id: objectId,
              classId,
              state: "ACTIVE",
              accountId: data.providerObjectId,
              accountName: data.memberName,
              ...((data.walletDesign.showPoints ?? true)
                ? {
                    loyaltyPoints: {
                      label: data.pointsName,
                      balance: { int: data.balance },
                    },
                  }
                : {}),
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
                ...(data.membershipExpiresAt
                  ? [
                      {
                        id: "expires",
                        header: "Vence",
                        body: formatWalletDate(data.membershipExpiresAt),
                      },
                    ]
                  : []),
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
      membershipExpiresAt: data.membershipExpiresAt,
      membershipStatus: data.membershipStatus,
      credentialId: data.credentialId,
      providerObjectId: args.serialNumber,
      walletDesign: data.walletDesign,
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
  organizationName: string;
  providerObjectId: string;
  credentialId: string;
  balance: number;
  pointsName: string;
  membershipExpiresAt?: number;
  membershipStatus: string;
  walletDesign: {
    variantKey: string;
    programName: string;
    backgroundColor: string;
    backgroundStyle?: "solid" | "gradient" | "image";
    showPoints?: boolean;
    logoUrl?: string | null;
    heroImageUrl?: string | null;
    google?: { programName?: string };
  };
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
  const classId = googleClassId(
    issuerId,
    data.organizationId,
    data.walletDesign.variantKey,
  );
  const classPayload = googleClassPayload({
    classId,
    organizationName: data.organizationName,
    walletDesign: data.walletDesign,
  });
  const classUrl = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${encodeURIComponent(classId)}`;
  let classResponse = await fetch(classUrl, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${tokenBody.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(classPayload),
  });
  if (classResponse.status === 404) {
    classResponse = await fetch(
      "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokenBody.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(classPayload),
      },
    );
  }
  if (!classResponse.ok) {
    throw new Error(`GOOGLE_WALLET_CLASS_${classResponse.status}`);
  }
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
        classId,
        state: data.membershipStatus === "Activa" ? "ACTIVE" : "INACTIVE",
        ...((data.walletDesign.showPoints ?? true)
          ? {
              loyaltyPoints: {
                label: data.pointsName,
                balance: { int: data.balance },
              },
            }
          : { loyaltyPoints: null }),
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
          ...(data.membershipExpiresAt
            ? [
                {
                  id: "expires",
                  header: "Vence",
                  body: formatWalletDate(data.membershipExpiresAt),
                },
              ]
            : []),
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
            organizationName: resolved.organizationName,
            providerObjectId: resolved.walletPass.providerObjectId,
            credentialId: resolved.credentialId,
            balance: resolved.balance,
            pointsName: resolved.pointsName,
            membershipExpiresAt: resolved.membershipExpiresAt,
            membershipStatus: resolved.membershipStatus,
            walletDesign: resolved.walletDesign,
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
