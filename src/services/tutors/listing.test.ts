import { describe, expect, it } from "vitest";
import { toTutorListings, type TutorProfileRow } from "@/services/tutors/listing";
import type { Course, Profile, TutorService } from "@/types";

/** Minimal valid Profile fixture (only fields the mapper touches + requireds). */
function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    full_name: "Ama Mensah",
    role: "tutor",
    is_admin: false,
    avatar_url: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const COURSE: Course = {
  id: "c1",
  subject: "Mechanical Engineering",
  name: "Dynamics",
  description: null,
  created_at: "2026-08-01T00:00:00Z",
};

const SERVICE: TutorService = {
  id: "s1",
  tutor_profile_id: "tp1",
  course_id: "c1",
  price: 50,
  description: null,
  created_at: "2026-08-01T00:00:00Z",
};

function makeRow(overrides: Partial<TutorProfileRow> = {}): TutorProfileRow {
  return {
    id: "tp1",
    profile_id: "p1",
    bio: "bio",
    qualifications: "BSc",
    rate_per_hour: 50,
    verification_status: "approved",
    admin_notes: null,
    reviewed_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    profiles: makeProfile(),
    tutor_services: [{ ...SERVICE, courses: COURSE }],
    ...overrides,
  };
}

describe("toTutorListings", () => {
  it("maps a normal row with services and courses", () => {
    const [listing] = toTutorListings([makeRow()]);
    expect(listing).toBeDefined();
    expect(listing.profile.full_name).toBe("Ama Mensah");
    expect(listing.tutorProfile.id).toBe("tp1");
    expect(listing.services).toHaveLength(1);
    expect(listing.courses).toEqual([COURSE]);
  });

  it("drops rows whose profiles embed is null (role filter removed it)", () => {
    // The production 500: a tutor who self-switched to student keeps an
    // approved tutor_profiles row, and .neq("profiles.role", "student")
    // returns it with profiles: null.
    const rows = [makeRow({ profiles: null }), makeRow({ id: "tp2" })];
    const listings = toTutorListings(rows);
    expect(listings).toHaveLength(1);
    expect(listings[0].tutorProfile.id).toBe("tp2");
  });

  it("drops rows whose profiles embed is an empty array", () => {
    const listings = toTutorListings([makeRow({ profiles: [] })]);
    expect(listings).toHaveLength(0);
  });

  it("unwraps a single-element array embed", () => {
    const [listing] = toTutorListings([makeRow({ profiles: [makeProfile()] })]);
    expect(listing.profile.id).toBe("p1");
  });

  it("drops services whose course embed is missing, without breaking courses", () => {
    const listings = toTutorListings([
      makeRow({
        tutor_services: [
          { ...SERVICE, courses: null }, // course row deleted
          { ...SERVICE, id: "s2", course_id: "c1", courses: COURSE },
        ],
      }),
    ]);
    expect(listings[0].services).toHaveLength(1);
    expect(listings[0].services[0].id).toBe("s2");
    expect(listings[0].courses).toEqual([COURSE]);
  });

  it("handles a row with no services at all", () => {
    const [listing] = toTutorListings([makeRow({ tutor_services: null })]);
    expect(listing.services).toHaveLength(0);
    expect(listing.courses).toHaveLength(0);
    expect(listing.profile.full_name).toBe("Ama Mensah");
  });
});
