import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getAppleToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("ApplePass ")
    ? header.slice("ApplePass ".length)
    : null;
}

function pathParts(request: Request): string[] {
  return new URL(request.url).pathname.split("/").filter(Boolean);
}

function isConfiguredPassType(value: string): boolean {
  const configured = process.env.APPLE_WALLET_PASS_TYPE_ID?.trim();
  return Boolean(configured && value === configured);
}

export const appleRegisterDevice = httpAction(async (ctx, request) => {
  // /wallet/apple/v1/devices/:device/registrations/:passType/:serial
  const parts = pathParts(request);
  if (
    parts.length !== 8 ||
    parts[3] !== "devices" ||
    parts[5] !== "registrations"
  ) {
    return new Response(null, { status: 404 });
  }
  const deviceLibraryIdentifier = parts[4];
  const passTypeIdentifier = parts[6];
  const serialNumber = parts[7];
  if (!isConfiguredPassType(passTypeIdentifier)) {
    return new Response(null, { status: 404 });
  }
  const token = getAppleToken(request);
  if (!token) return new Response(null, { status: 401 });
  const valid = await ctx.runQuery(
    internal.rewards.validateApplePassAuthentication,
    {
      serialNumber,
      authenticationToken: token,
    },
  );
  if (!valid) return new Response(null, { status: 401 });
  let body: { pushToken?: string };
  try {
    body = (await request.json()) as { pushToken?: string };
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!body.pushToken || body.pushToken.length > 512) {
    return new Response(null, { status: 400 });
  }
  const result = await ctx.runMutation(internal.rewards.saveAppleRegistration, {
    deviceLibraryIdentifier,
    passTypeIdentifier,
    serialNumber,
    pushToken: body.pushToken,
  });
  return new Response(null, { status: result.created ? 201 : 200 });
});

export const appleDeleteRegistration = httpAction(async (ctx, request) => {
  const parts = pathParts(request);
  if (
    parts.length !== 8 ||
    parts[3] !== "devices" ||
    parts[5] !== "registrations"
  ) {
    return new Response(null, { status: 404 });
  }
  const deviceLibraryIdentifier = parts[4];
  const passTypeIdentifier = parts[6];
  const serialNumber = parts[7];
  if (!isConfiguredPassType(passTypeIdentifier)) {
    return new Response(null, { status: 404 });
  }
  const token = getAppleToken(request);
  if (!token) return new Response(null, { status: 401 });
  const valid = await ctx.runQuery(
    internal.rewards.validateApplePassAuthentication,
    {
      serialNumber,
      authenticationToken: token,
    },
  );
  if (!valid) return new Response(null, { status: 401 });
  await ctx.runMutation(internal.rewards.deleteAppleRegistration, {
    deviceLibraryIdentifier,
    passTypeIdentifier,
    serialNumber,
  });
  return new Response(null, { status: 200 });
});

export const appleListDevicePasses = httpAction(async (ctx, request) => {
  // /wallet/apple/v1/devices/:device/registrations/:passType
  const parts = pathParts(request);
  if (
    parts.length !== 7 ||
    parts[3] !== "devices" ||
    parts[5] !== "registrations"
  ) {
    return new Response(null, { status: 404 });
  }
  const deviceLibraryIdentifier = parts[4];
  const passTypeIdentifier = parts[6];
  if (!isConfiguredPassType(passTypeIdentifier)) {
    return new Response(null, { status: 404 });
  }
  const result = await ctx.runQuery(internal.rewards.listApplePassesForDevice, {
    deviceLibraryIdentifier,
    passTypeIdentifier,
  });
  if (result.serialNumbers.length === 0)
    return new Response(null, { status: 204 });
  return json(result);
});

export const appleGetLatestPass = httpAction(async (ctx, request) => {
  // /wallet/apple/v1/passes/:passType/:serial
  const parts = pathParts(request);
  if (parts.length !== 6 || parts[3] !== "passes") {
    return new Response(null, { status: 404 });
  }
  const passTypeIdentifier = parts[4];
  const serialNumber = parts[5];
  if (!isConfiguredPassType(passTypeIdentifier)) {
    return new Response(null, { status: 404 });
  }
  const token = getAppleToken(request);
  if (!token) return new Response(null, { status: 401 });
  const valid = await ctx.runQuery(
    internal.rewards.validateApplePassAuthentication,
    {
      serialNumber,
      authenticationToken: token,
    },
  );
  if (!valid) return new Response(null, { status: 401 });
  const encoded = await ctx.runAction(
    internal.walletActions.generateApplePassForSerial,
    {
      serialNumber,
    },
  );
  if (!encoded) return new Response(null, { status: 404 });
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/vnd.apple.pkpass",
      "last-modified": new Date().toUTCString(),
      "cache-control": "no-store",
    },
  });
});

export const appleLog = httpAction(async (_ctx, request) => {
  // Intentionally acknowledge without logging the body: Wallet messages can
  // contain pass identifiers and must not become an accidental credential log.
  await request.text().catch(() => "");
  return new Response(null, { status: 200 });
});
