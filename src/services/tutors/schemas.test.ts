import { describe, expect, it } from "vitest";
import { tutorProfileSchema, tutorServiceSchema } from "./schemas";

const COURSE_ID = "11111111-1111-4111-8111-111111111111";

/**
 * A tutor saving a course while the "add a new course" panel is hidden posts
 * `newCourse*` as `null` (the inputs aren't in the DOM at all). `.optional()`
 * accepts `undefined` but not `null`, so this used to fail with Zod's developer
 * message — "Invalid input: expected string, received null" — on the most
 * ordinary action in the tutor dashboard. These tests pin the null and blank
 * shapes so it can't come back.
 */
describe("tutorServiceSchema", () => {
  const existingCourse = {
    courseId: COURSE_ID,
    newCourseCode: null,
    newCourseName: null,
    newCourseSubject: null,
    newCourseYear: null,
    newCourseSemester: null,
    priceGroup: "250",
    priceOneOnOne: "400",
  };

  it("accepts an existing course with both prices and absent new-course fields", () => {
    const parsed = tutorServiceSchema.safeParse(existingCourse);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.priceGroup).toBe(250);
      expect(parsed.data.priceOneOnOne).toBe(400);
      expect(parsed.data.newCourseCode).toBeUndefined();
    }
  });

  it("accepts blank (empty-string) new-course fields", () => {
    const parsed = tutorServiceSchema.safeParse({
      ...existingCourse,
      newCourseCode: "",
      newCourseName: "",
      newCourseSubject: "",
      newCourseYear: "",
      newCourseSemester: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts one format only — the other may be blank", () => {
    expect(
      tutorServiceSchema.safeParse({ ...existingCourse, priceGroup: null })
        .success,
    ).toBe(true);
    expect(
      tutorServiceSchema.safeParse({ ...existingCourse, priceOneOnOne: "" })
        .success,
    ).toBe(true);
  });

  it("rejects a submission with no price at all", () => {
    const parsed = tutorServiceSchema.safeParse({
      ...existingCourse,
      priceGroup: null,
      priceOneOnOne: null,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("one-on-one price");
    }
  });

  it("still requires either a picked course or a new course code", () => {
    const parsed = tutorServiceSchema.safeParse({
      ...existingCourse,
      courseId: null,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain("Pick a course");
    }
  });

  it("accepts adding a new course by code", () => {
    const parsed = tutorServiceSchema.safeParse({
      courseId: null,
      newCourseCode: "me 158",
      newCourseName: "Engineering Drawing",
      newCourseSubject: "Mechanical Engineering",
      newCourseYear: "1",
      newCourseSemester: "2",
      priceGroup: "100",
      priceOneOnOne: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects prose typed into the course code", () => {
    const parsed = tutorServiceSchema.safeParse({
      courseId: null,
      newCourseCode: "Engineering Drawing",
      newCourseName: "Engineering Drawing",
      newCourseSubject: "Mechanical Engineering",
      newCourseYear: "1",
      newCourseSemester: "2",
      priceGroup: "100",
      priceOneOnOne: null,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("tutorProfileSchema", () => {
  const base = {
    bio: "Mechanical engineering graduate, four years of tutoring.",
    qualifications: "BSc Mechanical Engineering, KNUST",
  };

  it("accepts a profile save with no semester rate", () => {
    // The dashboard no longer asks for one; the column is legacy.
    expect(
      tutorProfileSchema.safeParse({ ...base, ratePerSemester: null }).success,
    ).toBe(true);
    expect(
      tutorProfileSchema.safeParse({ ...base, ratePerSemester: "" }).success,
    ).toBe(true);
    expect(tutorProfileSchema.safeParse(base).success).toBe(true);
  });

  it("still validates a rate when one is provided", () => {
    expect(
      tutorProfileSchema.safeParse({ ...base, ratePerSemester: "120" }).success,
    ).toBe(true);
    expect(
      tutorProfileSchema.safeParse({ ...base, ratePerSemester: "-5" }).success,
    ).toBe(false);
  });

  it("still requires a real bio and qualifications", () => {
    expect(
      tutorProfileSchema.safeParse({ bio: "short", qualifications: "BSc" })
        .success,
    ).toBe(false);
  });
});
