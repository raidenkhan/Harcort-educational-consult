import { describe, expect, it } from "vitest";
import type { TutorListing } from "@/services/tutors/listing";
import { offeringsByCourse } from "./offerings";

function tutor(
  id: string,
  services: { id: string; courseId: string; code: string | null; one?: number | null; group?: number | null }[],
): TutorListing {
  return {
    tutorProfile: { id: `tp-${id}` } as TutorListing["tutorProfile"],
    profile: { full_name: `Tutor ${id}`, public_code: null } as unknown as TutorListing["profile"],
    services: services.map((s) => ({
      id: s.id,
      tutor_profile_id: `tp-${id}`,
      course_id: s.courseId,
      price: s.one ?? s.group ?? null,
      price_one_on_one: s.one === undefined ? 60 : s.one,
      price_group: s.group === undefined ? null : s.group,
    })) as unknown as TutorListing["services"],
    courses: services.map((s) => ({
      id: s.courseId,
      name: `Course ${s.code ?? s.courseId}`,
      code: s.code,
    })) as unknown as TutorListing["courses"],
    contactEmail: null,
  };
}

describe("offeringsByCourse", () => {
  it("matches the same course across programme rows by normalised code", () => {
    const tutors = [tutor("a", [{ id: "svc-1", courseId: "mech-me261", code: "ME 261" }])];
    const result = offeringsByCourse(tutors, [
      { id: "mech-me261", code: "ME 261" },
      { id: "marine-me261", code: "me  261" },
      { id: "other", code: "ME 255" },
    ]);
    expect(result["mech-me261"]).toHaveLength(1);
    expect(result["marine-me261"]?.[0].tutorServiceId).toBe("svc-1");
    // The line keeps the tutor's own course row — the one checkout prices.
    expect(result["marine-me261"]?.[0].courseId).toBe("mech-me261");
    expect(result.other).toBeUndefined();
  });

  it("falls back to id for code-less courses", () => {
    const tutors = [tutor("a", [{ id: "svc-1", courseId: "c-1", code: null }])];
    const result = offeringsByCourse(tutors, [
      { id: "c-1", code: null },
      { id: "c-2", code: null },
    ]);
    expect(result["c-1"]).toHaveLength(1);
    expect(result["c-2"]).toBeUndefined();
  });

  it("collects several tutors and skips unpriced offers", () => {
    const tutors = [
      tutor("a", [{ id: "svc-1", courseId: "c-1", code: "MATH 151" }]),
      tutor("b", [{ id: "svc-2", courseId: "c-9", code: "MATH 151", one: 80, group: 50 }]),
      tutor("c", [{ id: "svc-3", courseId: "c-1", code: "MATH 151", one: null, group: null }]),
    ];
    const result = offeringsByCourse(tutors, [{ id: "c-1", code: "MATH 151" }]);
    expect(result["c-1"]?.map((o) => o.tutorServiceId)).toEqual(["svc-1", "svc-2"]);
    expect(result["c-1"]?.[1]).toMatchObject({ priceOneOnOne: 80, priceGroup: 50 });
  });
});
