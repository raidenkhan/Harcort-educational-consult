import { describe, expect, it } from "vitest";
import {
  MAX_GROUP_MEMBERS_PER_ADD,
  MAX_GROUP_MESSAGE_LENGTH,
  addGroupMembersSchema,
  createGroupSchema,
  joinGroupSchema,
  sendGroupMessageSchema,
} from "./schemas";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID_2 = "22222222-2222-4222-8222-222222222222";

describe("createGroupSchema", () => {
  it("accepts a minimal group (name only)", () => {
    const parsed = createGroupSchema.safeParse({ name: "Thermo circle" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Thermo circle");
      expect(parsed.data.courseId).toBeUndefined();
      expect(parsed.data.description).toBeUndefined();
    }
  });

  it("accepts an optional courseId and description", () => {
    const parsed = createGroupSchema.safeParse({
      name: "  Dynamics  ",
      courseId: UUID,
      description: "  Meets Tuesdays  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Dynamics");
      expect(parsed.data.courseId).toBe(UUID);
      expect(parsed.data.description).toBe("Meets Tuesdays");
    }
  });

  it("rejects a blank name", () => {
    expect(createGroupSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 80 characters", () => {
    expect(
      createGroupSchema.safeParse({ name: "x".repeat(81) }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid courseId", () => {
    expect(
      createGroupSchema.safeParse({ name: "Group", courseId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });
});

describe("joinGroupSchema", () => {
  it("trims and uppercases the code", () => {
    const parsed = joinGroupSchema.safeParse({ joinCode: "  k7m2qx  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.joinCode).toBe("K7M2QX");
  });

  it("rejects codes that are too short", () => {
    expect(joinGroupSchema.safeParse({ joinCode: "AB1" }).success).toBe(false);
  });

  it("rejects codes with symbols", () => {
    expect(joinGroupSchema.safeParse({ joinCode: "AB-12" }).success).toBe(false);
  });
});

describe("sendGroupMessageSchema", () => {
  it("accepts a trimmed body", () => {
    const parsed = sendGroupMessageSchema.safeParse({
      groupId: UUID,
      body: "  hello team  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.body).toBe("hello team");
  });

  it("rejects an empty body", () => {
    expect(
      sendGroupMessageSchema.safeParse({ groupId: UUID, body: "   " }).success,
    ).toBe(false);
  });

  it("rejects a body over the limit", () => {
    expect(
      sendGroupMessageSchema.safeParse({
        groupId: UUID,
        body: "x".repeat(MAX_GROUP_MESSAGE_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid groupId", () => {
    expect(
      sendGroupMessageSchema.safeParse({ groupId: "nope", body: "hi" }).success,
    ).toBe(false);
  });
});

describe("addGroupMembersSchema", () => {
  it("accepts one or more student ids", () => {
    const parsed = addGroupMembersSchema.safeParse({
      groupId: UUID,
      profileIds: [UUID, UUID_2],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.profileIds).toEqual([UUID, UUID_2]);
  });

  it("collapses duplicate ids (a crafted post can repeat a checkbox)", () => {
    const parsed = addGroupMembersSchema.safeParse({
      groupId: UUID,
      profileIds: [UUID, UUID, UUID_2],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.profileIds).toEqual([UUID, UUID_2]);
  });

  it("rejects an empty selection", () => {
    expect(
      addGroupMembersSchema.safeParse({ groupId: UUID, profileIds: [] }).success,
    ).toBe(false);
  });

  it("rejects ids that aren't uuids", () => {
    expect(
      addGroupMembersSchema.safeParse({ groupId: UUID, profileIds: ["nope"] })
        .success,
    ).toBe(false);
  });

  it("caps how many students one submit can add", () => {
    const tooMany = Array.from(
      { length: MAX_GROUP_MEMBERS_PER_ADD + 1 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    expect(
      addGroupMembersSchema.safeParse({ groupId: UUID, profileIds: tooMany })
        .success,
    ).toBe(false);
  });
});
