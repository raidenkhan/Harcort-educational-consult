/**
 * The Harcourt study library, mirrored from the public "MECHANICAL ENGINEERING
 * LIBRARY" Google Drive folder.
 *
 * The Drive is the source of truth for the study materials, and it is laid out
 * exactly the way students think about their programme:
 *
 *   Year (MECH ONE…FOUR) → Semester (SEM 1/2) → course folder (a Drive link)
 *
 * This module walks that static tree (extracted once via Drive's public
 * `embeddedfolderview` listing) and exposes it as plain typed data. It is
 * server-safe — no "use client" — so the /library page (a server component)
 * can read it directly and pass plain data down.
 *
 * Nothing here touches the database: the library is browsable content, not
 * marketplace data. Each course card links straight to its Drive folder, and
 * each term's "video links" documents (PDF/DOCX) are surfaced alongside.
 */

const FOLDER = "https://drive.google.com/drive/folders/";
const FILE = "https://drive.google.com/file/d/";

/** A single course folder inside a term. */
export type LibraryCourse = {
  /** Drive folder URL. */
  url: string;
  /** Course code, e.g. "MATH 151" — null when the folder has no code. */
  code: string | null;
  /** Display name, title-cased, e.g. "Algebra". */
  name: string;
};

/** A video-links document (PDF/DOCX) attached to a term or the guide. */
export type LibraryFile = {
  url: string;
  title: string;
};

/** One semester of a year. */
export type LibraryTerm = {
  /** URL slug, e.g. "sem-1". */
  slug: string;
  /** Display title, e.g. "Semester 1". */
  title: string;
  /** The Drive folder name, e.g. "MECH 1 SEM 1". */
  driveName: string;
  url: string;
  courses: LibraryCourse[];
  files: LibraryFile[];
};

/** One year of the programme (or the cross-year video-links collection). */
export type LibraryYear = {
  slug: string;
  title: string;
  subtitle: string;
  url: string;
  terms: LibraryTerm[];
  /** Files that sit directly under the year folder (used by the guide). */
  files: LibraryFile[];
};

/** One KNUST engineering programme — the library's top level. */
export type LibraryProgram = {
  slug: string;
  name: string;
  /** Programme study folders; empty until materials for it are added. */
  years: LibraryYear[];
};

const ROMAN = new Set(["I", "II", "III", "IV", "V", "VI"]);

/** "INTRODUCTION TO INFORMATION TECHNOLOGY" → "Introduction To Information Technology". */
function formatName(raw: string): string {
  return raw
    .toLowerCase()
    .split(" ")
    .map((word) => {
      if (word.length === 0) return word;
      if (ROMAN.has(word.toUpperCase())) return word.toUpperCase();
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Split a Drive folder title into a course code and a display name. */
function parseCourse(raw: string): LibraryCourse {
  const title = raw.replace(/\s+/g, " ").trim();
  const match = title.match(/^([A-Z]{2,5} ?\d{3}[A-Z]?)\s+(.+)$/);
  if (match) return { url: "", code: match[1], name: formatName(match[2]) };
  return { url: "", code: null, name: formatName(title) };
}

function course(raw: string, id: string): LibraryCourse {
  return { ...parseCourse(raw), url: FOLDER + id };
}

function file(title: string, id: string): LibraryFile {
  return { title, url: FILE + id };
}

function term(
  slug: string,
  driveName: string,
  id: string,
  courses: LibraryCourse[],
  files: LibraryFile[] = [],
): LibraryTerm {
  return {
    slug,
    title: slug === "sem-1" ? "Semester 1" : "Semester 2",
    driveName,
    url: FOLDER + id,
    courses,
    files,
  };
}

/**
 * Mechanical Engineering study folders. Year order is curricular (Year 1 → 4);
 * the cross-year "Video links" collection is appended so no folder is left
 * unlinked.
 */
const MECHANICAL_YEARS: LibraryYear[] = [
  {
    slug: "year-1",
    title: "Year 1",
    subtitle: "Mechanical Engineering · Year 1",
    url: FOLDER + "1kFoi7l58MnI-Gw8SvvrjTWftB2Ae2GXs",
    files: [],
    terms: [
      term(
        "sem-1",
        "MECH 1 SEM 1",
        "1zv_SbdZlAIgmSxYH6XG9Hlp_H7kyVOI3",
        [
          course("CE 155 ENVIRONMENTAL STUDIES", "1z_Y-TDI3TwXI-qWREYfMS_3cuuASStGo"),
          course("EE 151 APPLIED ELECTRICITY", "10MYxIZ4Ug01fau9-ffha_jHQCXSlPWGY"),
          course("ENGL 157  COMMUNICATION SKILLS I", "1-GWwsV_n_TKirrIREHs-4RtCjmCYbHqS"),
          course("MATH 151 ALGEBRA", "1zwGdeJ57JYK2UK7oS7jxRp86Pbc0ReIt"),
          course(
            "ME 157 INTRODUCTION TO INFORMATION TECHNOLOGY",
            "1y9H-Kl_JirWJP9jqowDZEuiIlZKUkmFm",
          ),
          course("ME 159 TECHNICAL DRAWING", "1ywOEcIgadt29wSFN7OvTAJqth7GIdbob"),
          course("ME 195 ENGINEERING TECHNOLOGY", "10cBn3wHFGl3Ce1zkQ7YDP1eSkzJYhAym"),
        ],
        [file("1st Year First Sem Video Links", "1q6kTSh2GBfpec6Q46-bowfZtj9AhalWv")],
      ),
      term(
        "sem-2",
        "MECH 1 SEM 2",
        "11H2m6s7vM91sfWQ219T0L_6Gom7bSuLM",
        [
          course("EE 152 BASIC ELECTRONICS", "129hcRHLU_da8jn-grFIcPQkPzK7cHkHZ"),
          course("ENGL 158 COMMUNICATION SKILLS II", "1-P5gCkX1kliSyDelvSgj5oq8BAZJISqh"),
          course("MATH 152 CALCULUS WITH ANALYSIS", "179AsP5rWrXODxyeorCyjZon8ndSxzWgD"),
          course("ME 160 ENGINEERING DRAWING", "16OKApNQv7kcNTnDMwP5dcaDMCHSGiFfT"),
          course("ME 164 STATICS OF SOLID MECHANICS", "14duoCYVGBopgpyDl3CSnuaLQ3XRy_Ctk"),
          course("ME 168 COMPUTER PROGRAMMING", "15S2tfmNJiHoW5_D4a1onmwXn1l27UBlF"),
          course("ME 174 FIRST YEAR DESIGN PROJECT", "178tnSr53enJ736NGdUrRrcbl3cCEQpHV"),
        ],
        [file("1st Year Second Sem Video Links", "1R261SwmF59KFA4yZqbWGA5Reu-10SCP-")],
      ),
    ],
  },
  {
    slug: "year-2",
    title: "Year 2",
    subtitle: "Mechanical Engineering · Year 2",
    url: FOLDER + "1kNpl5MMoFi4uZtRBM7HV0CW-HN4HR-Vh",
    files: [],
    terms: [
      term(
        "sem-1",
        "MECH 2 SEM 1",
        "19qZ9ais3SraArIc5YXXLKoC1BIXh2Ikj",
        [
          course("CENG 291 ENGINEERING IN SOCIETY", "1BawwFVStFVH0aG0MVcZZYfBF7qACKJuS"),
          course("ENGL 263 LITERATURE I", "1Ba7toPeJxJdfizqb2oE3tM4MPhwuwB8q"),
          course("MATH 251 DIFFERENTIAL EQUATIONS", "1BbBvCOoT-BiFL4wQVnMAqYvvdiQeiuLk"),
          course("ME 251 INTRODUCTION TO FLUID DYNAMICS", "19qdZkt8rMPx4wAb8WrOCCmUgxYuH7Anb"),
          course("ME 255 STRENGHT OF MATERIALS I", "1AM_cz3bj5Dm-RFOe8y7w7-HFfRM4a-jg"),
          course("ME 259 APPLICATION OF COMPUTER GRAPHICS", "1BQSjR0fq_FE7AE50DvLdEcNf9fA7hE6D"),
          course("ME 261 DYNAMICS OF SOLID MECHANICS", "1BDTJNmRi3029JVPMPdehs2eBQ_y9HhN9"),
          course("ME 281 ENGINEERING MATERIAL I", "1BqJsXt6IqzPWb9oHjLs5A-_BEaj_sNYj"),
          course("ME 295 MECHANICAL LABORATORY I", "1Gzg129Xza3sfs5pB946u-mZdW0_iJPZ5"),
        ],
        [file("2nd Year First Sem Video Links", "1JkCU1mRcukZ2OJFqLyDY0rKnMdB5HCZt")],
      ),
      term(
        "sem-2",
        "MECH 2 SEM 2",
        "1IUDh_O6RTCB0or6biDS1yKUVdxbbjKRq",
        [
          course("ENGL 264 LITERATURE II", "1Ij2DbHMrYmvCg7b8eLWxCcIfwbTBa6K4"),
          course(
            "MATH 252 CALCULUS WITH SEVERAL VARIABLES",
            "1IiAF04KcUpoQzK4yEc7uQC-0ELb9FA3h",
          ),
          course("ME 252 FLUID DYNAMICS I", "1Il_XUVGez4TXTYtgatO1Wx95-h5gdI-7"),
          course(
            "ME 264 MECHANISM SYNTHESIS AND ANALYSIS I",
            "1Id-ysWaL7LJqvEu2zRcQ_DIrMP8OmO2-",
          ),
          course("ME 266 THERMODYNAMICS I", "1IZsHpP6klqysAoGGRDJv2awsdNJdHkSZ"),
          course("ME 274 SECOND YEAR DESIGN PROJECT", "1IWwYuyFPCZUjM2rAedsznesaZ-g6wFa8"),
          course(
            "ME 292 INDUSTRIAL ENGINEERING AND ERGONOMICS",
            "1REaod1dqVzOU4XTwdC3I-pJXGw_PPxsu",
          ),
          course("ME 296 MECHANICAL LABORATORY II", "1IwhhdxKjgHyEw1vRlxaugKAq-txVIHgS"),
        ],
      ),
    ],
  },
  {
    slug: "year-3",
    title: "Year 3",
    subtitle: "Mechanical Engineering · Year 3",
    url: FOLDER + "1kOAl6_-FjhoP7WR2pSbC7zRprAV6tBO9",
    files: [],
    terms: [
      term(
        "sem-1",
        "MECH 3 SEM 1",
        "1O82I2mM37aDPJ1tcUKO6SRT8r0MkQwYC",
        [
          course("ECON 151 INTRODUCTION TO ECONOMICS I", "1OvuFBWaR8kARTKQvz-Aw62EcYDFXemRf"),
          course("MATH 351 NUMERICAL ANALYSIS", "1OlZ5025OtsYAyYt5onjwtGMy9XFV4D3x"),
          course("ME 361 DYNAMICS OF MACHINERY", "1O8X-q12pwchfU5yCAbZIZ_0sQSEGxhpj"),
          course("ME 363 AUTOMATIC CONTROL I", "1Ogz8CddtjxHJahHdZq1fFF0QRwnu4uzV"),
          course("ME 365 THERMODYNAMICS II", "1O9ebxAAZme_vKoNuUis0U56esDAXRx_j"),
          course("ME 373 MACHINE DESIGN ELEMENT", "1OfMEauaOWwRrWRClDghji07Tql83tY-T"),
          course("ME 395 MECHANICAL LABORATORY III", "1P-K9-oBuh7r7dzSfKPU1u39ylAPfvu0B"),
          course(
            "STAT 252 PROBABILITY AND STATISTICS",
            "1OmQ7VhqB7HkYLXp_kdkHNFaKK137eUrL",
          ),
        ],
        [
          file("3rd Year First Sem Video Links", "1icuzfGEEdL4D43uUPiyeeFUvnHL9HPfO"),
          file("Youtube Links", "10a3ujJyD7VGNp_L5GZQidB8yUke21xqk"),
        ],
      ),
      term(
        "sem-2",
        "MECH 3 SEM 2",
        "1Qylma62WkUThXYm97_TSvcUE7CfmIosy",
        [
          course("EE 252 ELECTRICAL ENGINEERING MACHINES", "1RXb8GAO1vJlS9bur96NVwl9kfd5hgRbf"),
          course("ME 352 FLUID DYNAMICS II", "1RC7nSn85Bq3omty1B7cCWilOqdyorzOa"),
          course("ME 356 STRENGHT OF MATERIALS II", "1RAOC0638Ml9UZQJ2E4gBqHiPUlAao1VS"),
          course("ME 362 VIBRATIONS I", "1R6cH9TZhyOBMyi-gEnTfhbfGR-fWjjng"),
          course("ME 366 HEAT TRANSFER I", "1R5OiB4KkHveBzdREzclw3Znkv_RjnXVI"),
          course("ME 370 MANUFACTURING TECHNOLOGY", "1IVFdEp84WUmcm_QhjqG3Bo18CszLXq0g"),
          course("ME 374 MACHINE DESIGN", "1R--VV52cvAMH_opn4JMo6U510s0ZbXcJ"),
          course("ME 396 MECHANICAL LABORATORY IV", "1RcTCiFEbqT97iR-pE2r4pWFwUCWZn_6N"),
        ],
      ),
    ],
  },
  {
    slug: "year-4",
    title: "Year 4",
    subtitle: "Mechanical Engineering · Year 4",
    url: FOLDER + "1-TNromvj4IIhrj2hL7Kjchhbh-adlz-F",
    files: [],
    terms: [
      term(
        "sem-1",
        "MECH 4 SEM 1",
        "1tg8r8mDoFImEd8hlqlAoXkNu2s2DCZA1",
        [
          course("ME 451 BEHAVIOUR OF REAL FLUIDS", "1eU9KgFD98HKD_XAYPQktzhYs0C07-ehT"),
          course("ME 453 HYDRAULICS AND PNEUMATICS", "1vXOsLZpW8IVFMd2k0RZzhGokqQWw5JPB"),
          course("ME 455 STRENGTH OF MATERIALS III", "1elexhX3t2FnNLc1so9xZFDYyvSAlfIpz"),
          course("ME 461 VIBRATION II", "1gTWsDuQgI_AmGTucjLmtcjxD5aVqnzkm"),
          course("ME 463 AUTOMATIC CONTROL II", "1irwlaRvKmBU8vZr0RhpWk3hxbuezX9qg"),
          course(
            "ME 465 AIR CONDITIONING AND REFRIGERATION",
            "1ekwOQtOnnKG5tIz17O-LJ3ZiQ6Du3eSK",
          ),
          course("ME 467 RENEWABLE ENERGY CONVERSIONS", "1ww8tJ6bPG5L4GxSRZ4yEMJgx_dfSrR8-"),
          course("ME 469 FACILITIES DESIGN", "1gXNOMmaUhXKSDXyoCzPDrnyoEBXkJ8rq"),
          course(
            "ME 473 COMPUTER AIDED DESIGN/MANUFACTURING",
            "1sz0SVv76W1yfTsqM8zyLq6oZcljtTS3g",
          ),
          course("ME 477 PRODUCTION ENGINEERING I", "1wMLqG_2TfnqJGb8XUyq8Z3VdI9h1uYeJ"),
          course("ME 479 DISCRETE EVENT SIMULATION", "1cjFqP5kF8qLhTcGT7DboaIsXxM5XC71h"),
          course("ME 481 ENGINEERING MATERIALS II", "1gDiALLEpnUlOHxrNNLWaNlXiz6GuW_o9"),
          course("ME 483 MECHATRONICS", "1e3xwI_7YftZ1UbQwo2I3nS0eBLGo_72l"),
          course(
            "ME 489 VEHICLE CONTROL, SUSPENSION AND STABILITY",
            "1xM8Y6gn3eXgrNGgcTsYIis9tudfb1_DF",
          ),
          course(
            "ME 491 INDUSTRIAL ECONOMICS AND MANAGEMENT",
            "1to1jaTW1m04MSeC0gFKxlt6IGlS8Fhdp",
          ),
          course(
            "ME 495 MANAGEMENT AND MAINTENANCE OF AUTOMOBILE",
            "1cQ71m2D47CShZxNUoRTh-_syAD678Wsf",
          ),
          course("ME 497 FINAL YEAR DESIGN PROJECT", "1iULl_2X-uYlp_Ie6_Zb-U4SqTSn3r7hk"),
        ],
      ),
      term(
        "sem-2",
        "MECH 4 SEM 2",
        "1xgMsUiRK0ZhZXF-W8q5W4C-nwRYLBwFv",
        [
          course("ME 452 FLUID MACHINERY", "1CL2u5gyXADAXrD7ebZtkFql0TPzZ9P_1"),
          course("ME 456 INTRODUCTION TO FINITE ELEMENTS", "1CAnzsj63t48P_CG6QCeFciEbDgFgQy50"),
          course(
            "ME 462 MECHANISM SYNTHESIS AND ANALYSIS II",
            "1C5ydDeF7eeBtVaa4WlY_qIZXNfBxkgZZ",
          ),
          course("ME 464 INSTRUMENTATION", "1yyHLzmk_TaB3UWP0B1YPPPcwR-L8j7BH"),
          course("ME 468 INTERNAL COMBUSTION ENGINES", "1CF3F9ePmMoPhK4N_pwG_hCp7Njcqa938"),
          course("ME 472 MACHINE SHOP AND FACTORY DESIGN", "1CMtqbtDZtDlOi35o6y0pEXZUDCvEa1hL"),
          course("ME 474 PRODUCTION PLANNING AND CONTROL", "1ByKgWfbPMAiiXq5IgQgn4QDSOpC_sGa5"),
          course("ME 476 DESIGN OF VEHICLE STRUCTURES", "1CWFPcl3aAiI-UYs-O3P8mqx9VS3XK2UX"),
          course("ME 478 PRODUCTION ENGINEERING II", "1UZhbFxzSJ_1FyF5zXO7ksuEAQVkg4YPM"),
          course("ME 482 ENGINEERING MATERIALS III", "1CNbrqwoQALVTlVetj2ISczmgQOcvbNRP"),
          course(
            "ME 492 MANAGEMENT AND ENTREPRENEURSHIP DEVELOPMENT",
            "1xhNZ3uuu7JrK-uU0fVxrLa_HAP5Aw56d",
          ),
          course("ME 494 MAINTENANCE ENGINEERING", "1zceG7krtMXcMgzYJl_CqKfyK4IS_2Cj6"),
          course("ME 496 HUMAN FACTORS AND ERGONOMICS", "1CTPnmXtg8SA6MpiE9te3YgBbXE1k0uaO"),
          course("ME 498 FINAL YEAR DESIGN PROJECT II", "1BihVQeH7GJx3ZRETzlfUSP9jmZEC-Pqa"),
        ],
      ),
    ],
  },
  {
    slug: "video-links",
    title: "Video links",
    subtitle: "Every year's tutorial-video playlists",
    url: FOLDER + "1xYaHXcaRKsmy9ovA90SPBNp5yOvTGmTb",
    files: [
      file("1st Year First Sem Video Links", "1ft1UB9XTnZX5Zde9ByJCPITLwV9Kf53s"),
      file("1st Year Second Sem Video Links", "1xo6G-QFYRA6b8vBunTzZHcE331zvwyTE"),
      file("2nd Year First Sem Video Links", "1eudGqitR1fGOchsu5q_FhWCrtv_HI7OH"),
      file("2nd Year Second Sem Video Links", "15rJJzdp0hnGJ0vSem6vK8ix3jjZfhnio"),
      file("3rd Year First Sem Video Links", "1uvP4Q9mqpIrB4UaMUrXNbAD8wlZJOpN_"),
      file("Youtube Links", "1eNLekGNqDXn09LwuKCO6AX0-9R02ZN9X"),
    ],
    terms: [],
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Programmes offered by the KNUST College of Engineering, with Mechanical
 * Engineering (the only one with study folders so far) listed first. The rest
 * stay selectable and show an empty state until their materials are added.
 */
const OTHER_PROGRAMMES = [
  "Aerospace Engineering",
  "Agricultural and Biosystems Engineering",
  "Automobile Engineering",
  "Biomedical Engineering",
  "Chemical Engineering",
  "Civil Engineering",
  "Computer Engineering",
  "Electrical/Electronic Engineering",
  "Geological Engineering",
  "Geomatic Engineering",
  "Industrial Engineering",
  "Marine Engineering",
  "Materials Engineering",
  "Metallurgical Engineering",
  "Petroleum Engineering",
  "Petrochemical Engineering",
  "Telecommunication Engineering",
];

export const LIBRARY_PROGRAMS: LibraryProgram[] = [
  { slug: "mechanical-engineering", name: "Mechanical Engineering", years: MECHANICAL_YEARS },
  ...OTHER_PROGRAMMES.map((name) => ({ slug: slugify(name), name, years: [] })),
];

/** Find a programme by its slug. */
export function findLibraryProgram(slug: string | undefined): LibraryProgram | null {
  if (!slug) return null;
  return LIBRARY_PROGRAMS.find((entry) => entry.slug === slug) ?? null;
}

/** Find a year (or the guide) within a programme by its slug. */
export function findLibraryYear(
  program: LibraryProgram,
  slug: string | undefined,
): LibraryYear | null {
  if (!slug) return null;
  return program.years.find((entry) => entry.slug === slug) ?? null;
}

/** Find a term within a year by its slug. */
export function findLibraryTerm(
  year: LibraryYear,
  slug: string | undefined,
): LibraryTerm | null {
  if (!slug) return null;
  return year.terms.find((entry) => entry.slug === slug) ?? null;
}

/** Total course folders across every term of a year. */
export function countYearCourses(year: LibraryYear): number {
  return year.terms.reduce((total, entry) => total + entry.courses.length, 0);
}

/** Total course folders across every year of a programme. */
export function countProgramCourses(program: LibraryProgram): number {
  return program.years.reduce((total, entry) => total + countYearCourses(entry), 0);
}
