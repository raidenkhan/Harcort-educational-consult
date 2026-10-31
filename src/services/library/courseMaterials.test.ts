import { describe, expect, it } from "vitest";
import {
  allCourseMaterials,
  findCourseMaterials,
  levelFromYearSlug,
  semesterFromTermSlug,
} from "./courseMaterials";

describe("levelFromYearSlug", () => {
  it("maps the library's years onto KNUST levels", () => {
    expect(levelFromYearSlug("year-1")).toBe(100);
    expect(levelFromYearSlug("year-4")).toBe(400);
  });

  it("returns null for a folder that isn't a level", () => {
    expect(levelFromYearSlug("video-links")).toBeNull();
  });
});

describe("semesterFromTermSlug", () => {
  it("maps sem-1 / sem-2 to the catalogue's term numbers", () => {
    expect(semesterFromTermSlug("sem-1")).toBe(1);
    expect(semesterFromTermSlug("sem-2")).toBe(2);
  });

  it("returns null for anything else", () => {
    expect(semesterFromTermSlug("guide")).toBeNull();
  });
});

describe("findCourseMaterials", () => {
  it("finds a course folder by its code", () => {
    const entry = findCourseMaterials("ME 255");
    expect(entry).not.toBeNull();
    expect(entry?.driveUrl).toContain("drive.google.com/drive/folders/");
    expect(entry?.programName).toBe("Mechanical Engineering");
    expect(entry?.yearTitle).toBe("Year 2");
    expect(entry?.level).toBe(200);
    expect(entry?.termTitle).toBe("Semester 1");
    expect(entry?.semester).toBe(1);
  });

  it("normalizes the code the same way the catalogue does", () => {
    // A tutor typing "me  255" must land on the same folder as "ME 255".
    expect(findCourseMaterials("me  255")?.code).toBe("ME 255");
    expect(findCourseMaterials("  me 255 ")?.driveUrl).toBe(
      findCourseMaterials("ME 255")?.driveUrl,
    );
  });

  it("carries the term's video playlists, not just the folder", () => {
    const entry = findCourseMaterials("MATH 151");
    expect(entry?.videos.length).toBeGreaterThan(0);
    expect(entry?.videos[0]?.url).toContain("drive.google.com/file/d/");
  });

  it("returns null for a course the library doesn't carry", () => {
    expect(findCourseMaterials("ME 999")).toBeNull();
    expect(findCourseMaterials("")).toBeNull();
    expect(findCourseMaterials(null)).toBeNull();
    expect(findCourseMaterials(undefined)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(findCourseMaterials("me 255")?.code).toBe("ME 255");
  });

  it("answers the brochure's code when the Drive folder is labelled differently", () => {
    // The brochure lists Computer Programming as ME 158; the Drive folder is
    // ME 168. The catalogue shows ME 158, so ME 158 must find the folder.
    const entry = findCourseMaterials("ME 158");
    expect(entry?.code).toBe("ME 158");
    expect(entry?.driveUrl).toBe(findCourseMaterials("ME 168")?.driveUrl);
    expect(entry?.driveUrl).toContain("drive.google.com/drive/folders/");
  });

  it("finds Aerospace folders and files them by the official curriculum", () => {
    const structures = findCourseMaterials("AERO 256");
    expect(structures?.programName).toBe("Aerospace Engineering");
    expect(structures?.yearTitle).toBe("Year 2");
    expect(structures?.termTitle).toBe("Semester 2");

    // AERO 495 is a Year-4, Semester-1 course in the department's outline;
    // the folder title ("Aircraft Maintenance Engineering") matches.
    const maintenance = findCourseMaterials("aero 495");
    expect(maintenance?.code).toBe("AERO 495");
    expect(maintenance?.yearTitle).toBe("Year 4");
    expect(maintenance?.termTitle).toBe("Semester 1");
  });

  it("keeps shared courses on the programme that indexes them first", () => {
    // MATH 151 and ME 255 are taught in both programmes; Mechanical is listed
    // first, so its folder is the canonical one for the code.
    expect(findCourseMaterials("MATH 151")?.programName).toBe("Mechanical Engineering");
    expect(findCourseMaterials("ME 255")?.programName).toBe("Mechanical Engineering");
  });
});

describe("allCourseMaterials", () => {
  it("indexes every course folder exactly once", () => {
    const entries = allCourseMaterials();
    const codes = entries.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(entries.length).toBe(98);
  });

  it("gives every entry a Drive folder and a term", () => {
    for (const entry of allCourseMaterials()) {
      expect(entry.driveUrl).toMatch(/^https:\/\/drive\.google\.com\/drive\/folders\//);
      expect(entry.termUrl).toMatch(/^https:\/\/drive\.google\.com\/drive\/folders\//);
      expect(entry.semester === 1 || entry.semester === 2).toBe(true);
      expect(entry.level).not.toBeNull();
    }
  });
});
