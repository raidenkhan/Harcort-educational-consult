-- ============================================================================
-- Harcourt — 0037 · KNUST Aerospace Engineering curriculum
--
-- 0030 deliberately left Aerospace Engineering unseeded: the department's
-- programme page published no course structure. That source now exists — the
-- department's own "Aerospace engineering course outline" PDF, filed in the
-- public Academic Resources Drive folder:
--
--   https://drive.google.com/drive/folders/10J-Vpk6H0xJhiqGpMbdK0-wWEkz98FdF
--
-- It carries the semester-by-semester schedule (sections 11.1–11.8): codes,
-- titles and credit hours for Years 1–4, including the Year-4 technical
-- electives. Those are the rows seeded here, verbatim, so Aerospace students
-- get the same programme → level → semester → course directory Mechanical,
-- Industrial, Marine and Automobile students already have.
--
-- Like 0030, every programme keeps its own rows: a shared course (MATH 151,
-- ME 255…) is seeded per subject because the (subject, code) unique index is
-- per programme and the directory browses programme-first.
--
-- The Drive library is wired to these codes in
-- `src/services/library/driveLibrary.ts` (AEROSPACE_YEARS). The Drive was
-- filed by hand (a few folder titles differ from the outline), so term
-- placement follows this outline, not the folder a link sits in.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

insert into public.courses (subject, name, description, year, semester, code, credits) values
  -- Year One, Semester One
  ('Aerospace Engineering', 'Algebra', 'KNUST Aerospace Engineering core course, Level 100 Semester 1.', 1, 1, 'MATH 151', 4),
  ('Aerospace Engineering', 'Communication Skills I', 'KNUST Aerospace Engineering core course, Level 100 Semester 1.', 1, 1, 'ENGL 157', 2),
  ('Aerospace Engineering', 'Applied Electricity', 'KNUST Aerospace Engineering core course, Level 100 Semester 1.', 1, 1, 'EE 151', 3),
  ('Aerospace Engineering', 'Environmental Studies', 'KNUST Aerospace Engineering core course, Level 100 Semester 1.', 1, 1, 'CE 155', 2),
  ('Aerospace Engineering', 'Technical Drawing', 'KNUST Aerospace Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 159', 3),
  ('Aerospace Engineering', 'Introduction to Aviation Technology', 'KNUST Aerospace Engineering core course, Level 100 Semester 1.', 1, 1, 'AERO 157', 2),
  ('Aerospace Engineering', 'Introduction to Information Technology', 'KNUST Aerospace Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 157', 2),
  ('Aerospace Engineering', 'Information Literacy Skills I', 'KNUST Aerospace Engineering course, Level 100 Semester 1.', 1, 1, 'ILS 151', 2),
  -- Year One, Semester Two
  ('Aerospace Engineering', 'Calculus with Analysis', 'KNUST Aerospace Engineering core course, Level 100 Semester 2.', 1, 2, 'MATH 152', 4),
  ('Aerospace Engineering', 'Communication Skills II', 'KNUST Aerospace Engineering core course, Level 100 Semester 2.', 1, 2, 'ENGL 158', 2),
  ('Aerospace Engineering', 'Basic Electronics', 'KNUST Aerospace Engineering core course, Level 100 Semester 2.', 1, 2, 'EE 152', 2),
  ('Aerospace Engineering', 'Engineering Graphics', 'KNUST Aerospace Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 158', 3),
  ('Aerospace Engineering', 'Statics of Solid Mechanics', 'KNUST Aerospace Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 164', 2),
  ('Aerospace Engineering', 'Computer Programming for Engineers', 'KNUST Aerospace Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 168', 2),
  ('Aerospace Engineering', 'Aerospace Design Project I', 'KNUST Aerospace Engineering core course, Level 100 Semester 2.', 1, 2, 'AERO 174', 2),
  ('Aerospace Engineering', 'Information Literacy Skills II', 'KNUST Aerospace Engineering course, Level 100 Semester 2.', 1, 2, 'ILS 152', 2),
  -- Year Two, Semester One
  ('Aerospace Engineering', 'Differential Equations', 'KNUST Aerospace Engineering core course, Level 200 Semester 1.', 2, 1, 'MATH 251', 4),
  ('Aerospace Engineering', 'Literature in English I', 'KNUST Aerospace Engineering core course, Level 200 Semester 1.', 2, 1, 'ENGL 263', 1),
  ('Aerospace Engineering', 'Dynamics of Solid Mechanics', 'KNUST Aerospace Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 261', 2),
  ('Aerospace Engineering', 'Introduction to Fluid Mechanics', 'KNUST Aerospace Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 251', 2),
  ('Aerospace Engineering', 'Engineering Materials I', 'KNUST Aerospace Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 281', 2),
  ('Aerospace Engineering', 'Strength of Materials I', 'KNUST Aerospace Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 255', 3),
  ('Aerospace Engineering', 'Aerospace Engineering Vacation Training I', 'KNUST Aerospace Engineering practical course, Level 200 Semester 1.', 2, 1, 'AERO 293', 2),
  ('Aerospace Engineering', 'Mechanical Engineering Laboratory I', 'KNUST Aerospace Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 295', 1),
  ('Aerospace Engineering', 'Engineering in Society', 'KNUST Aerospace Engineering core course, Level 200 Semester 1.', 2, 1, 'CENG 291', 1),
  -- Year Two, Semester Two
  ('Aerospace Engineering', 'Calculus with Several Variables', 'KNUST Aerospace Engineering core course, Level 200 Semester 2.', 2, 2, 'MATH 252', 4),
  ('Aerospace Engineering', 'Literature in English II', 'KNUST Aerospace Engineering core course, Level 200 Semester 2.', 2, 2, 'ENGL 264', 1),
  ('Aerospace Engineering', 'Computer-Aided Design and Modelling', 'KNUST Aerospace Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 258', 3),
  ('Aerospace Engineering', 'Mechanisms Synthesis and Analysis I', 'KNUST Aerospace Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 264', 3),
  ('Aerospace Engineering', 'Aerospace Structures', 'KNUST Aerospace Engineering core course, Level 200 Semester 2.', 2, 2, 'AERO 256', 3),
  ('Aerospace Engineering', 'Thermodynamics I', 'KNUST Aerospace Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 266', 2),
  ('Aerospace Engineering', 'Aerospace Design Project II', 'KNUST Aerospace Engineering core course, Level 200 Semester 2.', 2, 2, 'AERO 274', 2),
  -- Year Three, Semester One
  ('Aerospace Engineering', 'Probability and Statistics', 'KNUST Aerospace Engineering core course, Level 300 Semester 1.', 3, 1, 'MATH 353', 2),
  ('Aerospace Engineering', 'Numerical Methods', 'KNUST Aerospace Engineering core course, Level 300 Semester 1.', 3, 1, 'MATH 351', 2),
  ('Aerospace Engineering', 'Automatic Control I', 'KNUST Aerospace Engineering core course, Level 300 Semester 1.', 3, 1, 'ME 363', 2),
  ('Aerospace Engineering', 'Aerospace Engineering Laboratory I', 'KNUST Aerospace Engineering core course, Level 300 Semester 1.', 3, 1, 'AERO 395', 1),
  ('Aerospace Engineering', 'Aerospace Industry and Engineering', 'KNUST Aerospace Engineering core course, Level 300 Semester 1.', 3, 1, 'AERO 391', 3),
  ('Aerospace Engineering', 'Aerodynamics I', 'KNUST Aerospace Engineering core course, Level 300 Semester 1.', 3, 1, 'AERO 351', 3),
  ('Aerospace Engineering', 'Aerospace Engineering Vacation Training II', 'KNUST Aerospace Engineering practical course, Level 300 Semester 1.', 3, 1, 'AERO 393', 2),
  ('Aerospace Engineering', 'Introduction to Economics I', 'KNUST Aerospace Engineering core course, Level 300 Semester 1.', 3, 1, 'ECON 151', 2),
  -- Year Three, Semester Two
  ('Aerospace Engineering', 'Air Vehicle Stability and Control', 'KNUST Aerospace Engineering core course, Level 300 Semester 2.', 3, 2, 'AERO 362', 3),
  ('Aerospace Engineering', 'Industrial Engineering and Ergonomics', 'KNUST Aerospace Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 392', 2),
  ('Aerospace Engineering', 'Aircraft Performance and Design', 'KNUST Aerospace Engineering core course, Level 300 Semester 2.', 3, 2, 'AERO 374', 3),
  ('Aerospace Engineering', 'Propulsion', 'KNUST Aerospace Engineering core course, Level 300 Semester 2.', 3, 2, 'AERO 368', 3),
  ('Aerospace Engineering', 'Heat Transfer', 'KNUST Aerospace Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 366', 3),
  ('Aerospace Engineering', 'Vibrations I', 'KNUST Aerospace Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 362', 3),
  ('Aerospace Engineering', 'Aerospace Engineering Laboratory II', 'KNUST Aerospace Engineering core course, Level 300 Semester 2.', 3, 2, 'AERO 396', 1),
  -- Year Four, Semester One (core)
  ('Aerospace Engineering', 'Avionics', 'KNUST Aerospace Engineering core course, Level 400 Semester 1.', 4, 1, 'AERO 483', 3),
  ('Aerospace Engineering', 'Aviation Business Management', 'KNUST Aerospace Engineering core course, Level 400 Semester 1.', 4, 1, 'AERO 491', 2),
  ('Aerospace Engineering', 'Final Year Project I', 'KNUST Aerospace Engineering core course, Level 400 Semester 1.', 4, 1, 'AERO 497', 3),
  ('Aerospace Engineering', 'Aircraft Maintenance Engineering', 'KNUST Aerospace Engineering core course, Level 400 Semester 1.', 4, 1, 'AERO 495', 2),
  ('Aerospace Engineering', 'Aerospace Vehicle Design', 'KNUST Aerospace Engineering core course, Level 400 Semester 1.', 4, 1, 'AERO 473', 4),
  ('Aerospace Engineering', 'Aerospace Engineering Vacation Training III', 'KNUST Aerospace Engineering practical course, Level 400 Semester 1.', 4, 1, 'AERO 493', 2),
  -- Year Four, Semester One (technical electives)
  ('Aerospace Engineering', 'Vibrations II', 'Year 4 technical elective (Aerospace Engineering).', 4, 1, 'ME 461', 3),
  ('Aerospace Engineering', 'Automatic Control II', 'Year 4 technical elective (Aerospace Engineering).', 4, 1, 'ME 463', 3),
  ('Aerospace Engineering', 'Mechatronics', 'Year 4 technical elective (Aerospace Engineering).', 4, 1, 'ME 483', 3),
  ('Aerospace Engineering', 'Composite Materials', 'Year 4 technical elective (Aerospace Engineering).', 4, 1, 'MSE 451', 3),
  ('Aerospace Engineering', 'Computer Aided Design and Manufacturing', 'Year 4 technical elective (Aerospace Engineering).', 4, 1, 'ME 473', 3),
  ('Aerospace Engineering', 'Facilities Design', 'Year 4 technical elective (Aerospace Engineering).', 4, 1, 'ME 469', 3),
  ('Aerospace Engineering', 'Operations Research', 'Year 4 technical elective (Aerospace Engineering).', 4, 1, 'ME 499', 3),
  ('Aerospace Engineering', 'Behaviour of Real Fluids', 'Year 4 technical elective (Aerospace Engineering).', 4, 1, 'ME 451', 3),
  ('Aerospace Engineering', 'Strength of Materials III', 'Year 4 technical elective (Aerospace Engineering).', 4, 1, 'ME 455', 3),
  -- Year Four, Semester Two (core)
  ('Aerospace Engineering', 'Entrepreneurship Development and Management', 'KNUST Aerospace Engineering core course, Level 400 Semester 2.', 4, 2, 'ME 492', 2),
  ('Aerospace Engineering', 'Aerodynamics II', 'KNUST Aerospace Engineering core course, Level 400 Semester 2.', 4, 2, 'AERO 452', 2),
  ('Aerospace Engineering', 'Final Year Project II', 'KNUST Aerospace Engineering core course, Level 400 Semester 2.', 4, 2, 'AERO 498', 5),
  ('Aerospace Engineering', 'Applied Meteorology', 'KNUST Aerospace Engineering core course, Level 400 Semester 2.', 4, 2, 'AERO 456', 2),
  ('Aerospace Engineering', 'Aerospace Safety and Air Security', 'KNUST Aerospace Engineering core course, Level 400 Semester 2.', 4, 2, 'AERO 492', 2),
  -- Year Four, Semester Two (technical electives)
  ('Aerospace Engineering', 'Mechanisms Synthesis and Analysis II', 'Year 4 technical elective (Aerospace Engineering).', 4, 2, 'ME 462', 3),
  ('Aerospace Engineering', 'Finite Element Methods', 'Year 4 technical elective (Aerospace Engineering).', 4, 2, 'ME 456', 3),
  ('Aerospace Engineering', 'Internal Combustion Engines', 'Year 4 technical elective (Aerospace Engineering).', 4, 2, 'ME 468', 3),
  ('Aerospace Engineering', 'Production Planning and Control', 'Year 4 technical elective (Aerospace Engineering).', 4, 2, 'ME 474', 3),
  ('Aerospace Engineering', 'Machine Shop and Factory Design', 'Year 4 technical elective (Aerospace Engineering).', 4, 2, 'ME 472', 3),
  ('Aerospace Engineering', 'Human Factors and Ergonomics', 'Year 4 technical elective (Aerospace Engineering).', 4, 2, 'ME 494', 3)
on conflict (subject, code) where code is not null do update set
  name = excluded.name,
  description = excluded.description,
  year = excluded.year,
  semester = excluded.semester,
  credits = excluded.credits;
