import { describe, expect, it } from "vitest";
import type { MembershipData } from "../types";
import { mapMembershipToMember, mapMembershipsToMembers } from "./members";

const baseMembership: MembershipData = {
  userId: "user_123",
  role: "member",
  status: "active",
  createdAt: Date.UTC(2026, 0, 15, 12),
  joinedAt: Date.UTC(2026, 1, 20, 12),
};

describe("mapMembershipToMember", () => {
  it("prefers fullName for the display name", () => {
    const member = mapMembershipToMember({
      ...baseMembership,
      fullName: "Ana María Pérez",
      firstName: "Ana",
      lastName: "Pérez",
    });
    expect(member.name).toBe("Ana María Pérez");
  });

  it("builds the name from firstName and lastName", () => {
    const member = mapMembershipToMember({
      ...baseMembership,
      firstName: "Ana",
      lastName: "Pérez",
    });
    expect(member.name).toBe("Ana Pérez");
  });

  it("falls back to whichever name part exists", () => {
    expect(
      mapMembershipToMember({ ...baseMembership, firstName: "Ana" }).name,
    ).toBe("Ana");
    expect(
      mapMembershipToMember({ ...baseMembership, lastName: "Pérez" }).name,
    ).toBe("Pérez");
  });

  it("falls back to the userId when there is no name", () => {
    expect(mapMembershipToMember(baseMembership).name).toBe("user_123");
  });

  it("defaults usesPlanification to true", () => {
    expect(mapMembershipToMember(baseMembership).usesPlanification).toBe(true);
    expect(
      mapMembershipToMember({ ...baseMembership, usesPlanification: false })
        .usesPlanification,
    ).toBe(false);
  });

  it("carries over identity fields and formats dates", () => {
    const member = mapMembershipToMember(baseMembership);
    expect(member.id).toBe("user_123");
    expect(member.role).toBe("member");
    expect(member.status).toBe("active");
    expect(member.createdAt).toBe(
      new Date(baseMembership.createdAt).toLocaleDateString(),
    );
    expect(member.joinedAt).toBe(
      new Date(baseMembership.joinedAt).toLocaleDateString(),
    );
  });
});

describe("mapMembershipsToMembers", () => {
  it("maps every membership in order", () => {
    const members = mapMembershipsToMembers([
      baseMembership,
      { ...baseMembership, userId: "user_456" },
    ]);
    expect(members.map((member) => member.id)).toEqual([
      "user_123",
      "user_456",
    ]);
  });

  it("returns an empty array for no memberships", () => {
    expect(mapMembershipsToMembers([])).toEqual([]);
  });
});
