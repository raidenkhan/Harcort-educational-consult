-- ============================================================================
-- Harcourt — 0033 · Mechanical Engineering: the brochure's two missing courses
--
-- 0030 rebuilt the Mechanical curriculum from the department's website. This
-- migration reconciles it against the department's own BSc Mechanical
-- Engineering brochure (2021), the document the HoD's office publishes next to
-- the web page. The two sources agree on EVERY code, title, credit hour, level
-- and semester except for two courses that 0030 had to drop, because the
-- brochure prints them under a code another course already uses:
--
--   1. EE 252 · Electrical Engineering Machines
--      Level 300, Semester 2, 2 credit hours.
--      The brochure prints it as "ME 252" — but ME 252 is already Fluid
--      Dynamics I (Level 200, Semester 2). Electrical machines are taught by
--      the Electrical department, the Drive library files the folder as
--      EE 252, and the timetable uses EE 252, so the catalogue uses that code.
--      0030 dropped the row entirely; this adds it back.
--
--   2. ME 496 · Human Factors and Ergonomics
--      Level 400, Semester 2, 3 credit hours (Industrial Engineering option).
--      The brochure prints "ME 494" for both this option and Maintenance
--      Engineering (the core course). Two different courses cannot share one
--      code; the Drive library files this one as ME 496, so that is the code
--      the catalogue uses.
--
-- Nothing else changes: every other row in 0030 already matches the brochure,
-- including the Year 4 specialisation options and the technical electives.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

insert into public.courses (subject, name, description, year, semester, code, credits) values
  ('Mechanical Engineering', 'Electrical Engineering Machines',
   'KNUST Mechanical Engineering core course, Level 300 Semester 2.', 3, 2, 'EE 252', 2),
  ('Mechanical Engineering', 'Human Factors and Ergonomics',
   'Year 4 option course — Industrial Engineering specialisation (also open as an elective).', 4, 2, 'ME 496', 3)
on conflict (subject, code) where code is not null do update set
  name = excluded.name,
  description = excluded.description,
  year = excluded.year,
  semester = excluded.semester,
  credits = excluded.credits;
