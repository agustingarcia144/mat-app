import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { callClerkApi } from "@/lib/server/clerk-rest";
import { normalizeString } from "@/lib/utils";

type ProfilePayload = {
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
};

type ClerkEmailAddress = {
  id?: string;
  email_address?: string;
};

type ClerkUser = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string | null;
  image_url?: string | null;
  public_metadata?: Record<string, unknown>;
};

function isValidUsername(value: string) {
  return /^[a-zA-Z0-9_-]{3,32}$/.test(value);
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request
    .json()
    .catch(() => null)) as ProfilePayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const firstName = normalizeString(body.firstName, 64);
  const lastName = normalizeString(body.lastName, 64);
  const username = normalizeString(body.username, 32);
  const phone = normalizeString(body.phone, 30);

  if (
    username !== undefined &&
    username.length > 0 &&
    !isValidUsername(username)
  ) {
    return NextResponse.json(
      {
        error:
          "Username must be 3-32 characters and contain only letters, numbers, underscores, or hyphens",
      },
      { status: 400 },
    );
  }

  if (
    firstName === undefined &&
    lastName === undefined &&
    username === undefined &&
    phone === undefined
  ) {
    return NextResponse.json(
      { error: "No valid profile updates were provided" },
      { status: 400 },
    );
  }

  const currentUser = await callClerkApi<ClerkUser>(`/users/${userId}`, {
    method: "GET",
  });
  if (!currentUser.ok) {
    return NextResponse.json({ error: currentUser.message }, { status: 502 });
  }

  const mergedMetadata = {
    ...(currentUser.data.public_metadata ?? {}),
    ...(phone !== undefined ? { phone: phone || null } : {}),
  };

  const payload: Record<string, unknown> = {
    public_metadata: mergedMetadata,
  };

  if (firstName !== undefined) {
    payload.first_name = firstName || null;
  }
  if (lastName !== undefined) {
    payload.last_name = lastName || null;
  }
  if (username !== undefined) {
    payload.username = username || null;
  }

  const result = await callClerkApi<ClerkUser>(`/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  const primaryEmail =
    result.data.email_addresses?.find(
      (email) =>
        email &&
        email.email_address &&
        result.data.primary_email_address_id &&
        email.id === result.data.primary_email_address_id,
    )?.email_address || result.data.email_addresses?.[0]?.email_address;

  return NextResponse.json({
    user: {
      id: result.data.id,
      firstName: result.data.first_name ?? null,
      lastName: result.data.last_name ?? null,
      username: result.data.username ?? null,
      email: primaryEmail ?? null,
      imageUrl: result.data.image_url ?? null,
      publicMetadata: result.data.public_metadata ?? {},
    },
  });
}
