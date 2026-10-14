import { describe, expect, it } from "vitest";
import {
  groupBySemester,
  hasSemesterGrouping,
  parseSemesterParam,
  semesterLabel,
  semesterParam,
} from "./semesters";

const asset = (id: string, semester: number | null) => ({ id, semester });

describe("groupBySemester", () => {
  it("returns no buckets for empty input", () => {
    expect(groupBySemester([])).toEqual([]);
  });

  it("buckets into Semester 1, Semester 2, then unassigned", () => {
    const buckets = groupBySemester([
      asset("u", null),
      asset("s2", 2),
      asset("s1", 1),
    ]);
    expect(buckets.map((b) => b.label)).toEqual([
      "Semester 1",
      "Semester 2",
      "Not assigned",
    ]);
    expect(buckets.map((b) => b.items.map((i) => i.id))).toEqual([
      ["s1"],
      ["s2"],
      ["u"],
    ]);
  });

  it("omits semesters that have no content", () => {
    const buckets = groupBySemester([asset("s1", 1), asset("s1b", 1)]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].label).toBe("Semester 1");
    expect(buckets[0].items).toHaveLength(2);
  });

  it("treats out-of-range values as unassigned instead of inventing a term", () => {
    const buckets = groupBySemester([asset("weird", 3)]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].semester).toBeNull();
    expect(buckets[0].label).toBe("Not assigned");
  });
});

describe("semesterLabel", () => {
  it("maps 1, 2 and null", () => {
    expect(semesterLabel(1)).toBe("Semester 1");
    expect(semesterLabel(2)).toBe("Semester 2");
    expect(semesterLabel(null)).toBe("Not assigned");
  });
});

describe("hasSemesterGrouping", () => {
  it("is false when nothing is tagged", () => {
    expect(hasSemesterGrouping([asset("a", null), asset("b", null)])).toBe(false);
    expect(hasSemesterGrouping([])).toBe(false);
  });

  it("is true as soon as one asset is tagged", () => {
    expect(hasSemesterGrouping([asset("a", null), asset("b", 1)])).toBe(true);
  });
});

describe("semesterParam / parseSemesterParam", () => {
  it("round-trips every bucket", () => {
    expect(parseSemesterParam(semesterParam(1))).toBe(1);
    expect(parseSemesterParam(semesterParam(2))).toBe(2);
    expect(parseSemesterParam(semesterParam(null))).toBeNull();
  });

  it("maps buckets to their URL values", () => {
    expect(semesterParam(1)).toBe("1");
    expect(semesterParam(2)).toBe("2");
    expect(semesterParam(null)).toBe("none");
  });

  it("returns undefined for absent or junk values", () => {
    expect(parseSemesterParam(undefined)).toBeUndefined();
    expect(parseSemesterParam(null)).toBeUndefined();
    expect(parseSemesterParam("")).toBeUndefined();
    expect(parseSemesterParam("3")).toBeUndefined();
    expect(parseSemesterParam("ALL")).toBeUndefined();
  });
});
