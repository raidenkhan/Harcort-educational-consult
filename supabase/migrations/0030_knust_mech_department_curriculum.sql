-- ============================================================================
-- Harcourt — 0030 · KNUST mech-department curriculum, from the official site
--
-- Rebuilds the student-facing engineering catalog from the Department of
-- Mechanical Engineering's own published structures:
--   * https://mech.knust.edu.gh/ug/bsc-mechanical-engineering  (HTML tables)
--   * https://mech.knust.edu.gh/undergraduate/bsc-industrial-engineering
--   * BSc Marine Engineering brochure PDF  (MME-coded courses)
--   * BSc Automobile Engineering brochure PDF (AME-coded courses)
--
-- What 0026 seeded was largely INVENTED (e.g. "ME 159 Applied Electricity" —
-- the real ME 159 is Technical Drawing; ME 161/163/165/COE 158 do not exist
-- in the department's curriculum). This migration replaces those rows with
-- the real ones: codes, credit hours, level and semester exactly as
-- published. Each programme's rows are its own — a course two programmes
-- share (MATH 151, ME 270…) is seeded per programme, because the directory
-- browses programme → level → semester → course and the (subject, code)
-- unique index is per subject.
--
-- Site inconsistencies handled as follows (as printed vs deduped):
--   * ME 252 is "Fluid Dynamics I" (Y2S2) AND "Electrical Engineering
--     Machines" (Y3S2) on the Mechanical page — one code, one row: the Y2S2
--     listing wins; the Y3S2 duplicate is dropped.
--   * ME 494 is "Maintenance Engineering" (core, Y4S2) AND "Human Factors &
--     Ergonomics" (Industrial option) — the core course wins; industrial
--     students have IE 458 for ergonomics.
--   * IE 356 is both "Logistics and Supply Chain Engineering" and
--     "Reliability Engineering" — the former keeps the code; the latter is
--     inserted with a NULL code (the unique index only covers coded rows).
--   * AME 481 is "Automotive Workshop Practice II" (core) AND "Tractors and
--     Farm Equipment" (elective) — core keeps the code; elective gets NULL.
--   * AME 496 is "Vehicle Regulations, Maintenance and Use" (core) AND
--     "Philosophy for Engineers" — core keeps the code; elective gets NULL.
--
-- Stale rows (0026's invented codes, un-coded generic topics) are deleted
-- per programme — but NEVER one that a tutor offer, material, video, request
-- or engagement already references. Those survive until manually migrated.
--
-- Aerospace Engineering: the department lists the programme but publishes no
-- course structure (the page 404s) — it is deliberately NOT seeded. Its
-- rows can be added when a source exists.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Drop stale/un-coded rows in the four rebuilt programmes (guarded)
-- ---------------------------------------------------------------------------
delete from public.courses c
where c.subject in (
      'Mechanical Engineering', 'Industrial Engineering',
      'Marine Engineering', 'Automobile Engineering')
  and (
    c.code is null
    or c.code not in (
      -- every code this migration (re)seeds, across the four programmes
      'AME 252','AME 272','AME 274','AME 295','AME 296','AME 356','AME 362',
      'AME 365','AME 368','AME 371','AME 372','AME 373','AME 376','AME 381',
      'AME 386','AME 395','AME 396','AME 455','AME 467','AME 476','AME 478',
      'AME 481','AME 482','AME 483','AME 485','AME 496','AME 497','AME 498',
      'CE 155','CENG 291',
      'EE 151','EE 152','EE 252','ENGL 157','ENGL 158','ENGL 263','ENGL 264','ECON 151',
      'FC 181',
      'IE 152','IE 251','IE 252','IE 254','IE 351','IE 353','IE 354','IE 355',
      'IE 356','IE 357','IE 358','IE 360','IE 362','IE 363','IE 364','IE 365',
      'IE 366','IE 451','IE 452','IE 453','IE 454','IE 455','IE 456','IE 457',
      'IE 458','IE 459','IE 460','IE 461','IE 463',
      'MATH 151','MATH 152','MATH 251','MATH 252','MATH 351','MATH 353',
      'ME 157','ME 158','ME 159','ME 160','ME 164','ME 168','ME 172','ME 174',
      'ME 195','ME 251','ME 252','ME 255','ME 259','ME 261','ME 262','ME 264',
      'ME 266','ME 270','ME 274','ME 281','ME 284','ME 291','ME 295','ME 296',
      'ME 352','ME 356','ME 361','ME 362','ME 363','ME 365','ME 366','ME 373',
      'ME 374','ME 384','ME 392','ME 395','ME 396','ME 451','ME 452','ME 453',
      'ME 455','ME 456','ME 457','ME 461','ME 463','ME 464','ME 465','ME 467',
      'ME 468','ME 469','ME 470','ME 471','ME 472','ME 473','ME 474','ME 477',
      'ME 478','ME 481','ME 482','ME 483','ME 485','ME 486','ME 487','ME 488',
      'ME 489','ME 491','ME 492','ME 494','ME 496','ME 497','ME 498','ME 499',
      'MME 153','MME 155','MME 251','MME 252','MME 253','MME 254','MME 256',
      'MME 258','MME 291','MME 351','MME 352','MME 353','MME 354','MME 355',
      'MME 356','MME 358','MME 451','MME 452','MME 453','MME 454','MME 455',
      'MME 456','MME 457','MME 458','MME 459','MME 460','MME 461','MME 462',
      'MME 463','MME 464',
      'MSE 451','SES 171','SES 172'
    )
  )
  and not exists (select 1 from public.tutor_services ts where ts.course_id = c.id)
  and not exists (select 1 from public.course_materials m where m.course_id = c.id)
  and not exists (select 1 from public.course_videos v where v.course_id = c.id)
  and not exists (select 1 from public.tutor_requests r where r.course_id = c.id)
  and not exists (select 1 from public.engagements e where e.course_id = c.id);

-- ---------------------------------------------------------------------------
-- 2) Mechanical Engineering — https://mech.knust.edu.gh/ug/bsc-mechanical-engineering
-- ---------------------------------------------------------------------------
insert into public.courses (subject, name, description, year, semester, code, credits) values
  -- Year One, Semester One
  ('Mechanical Engineering', 'Algebra', 'KNUST Mechanical Engineering core course, Level 100 Semester 1.', 1, 1, 'MATH 151', 4),
  ('Mechanical Engineering', 'Communication Skills I', 'KNUST Mechanical Engineering core course, Level 100 Semester 1.', 1, 1, 'ENGL 157', 2),
  ('Mechanical Engineering', 'Applied Electricity', 'KNUST Mechanical Engineering core course, Level 100 Semester 1.', 1, 1, 'EE 151', 3),
  ('Mechanical Engineering', 'Environmental Studies', 'KNUST Mechanical Engineering core course, Level 100 Semester 1.', 1, 1, 'CE 155', 2),
  ('Mechanical Engineering', 'Technical Drawing', 'KNUST Mechanical Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 159', 3),
  ('Mechanical Engineering', 'Engineering Technology', 'KNUST Mechanical Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 195', 2),
  ('Mechanical Engineering', 'Introduction to Information Technology', 'KNUST Mechanical Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 157', 2),
  -- Year One, Semester Two
  ('Mechanical Engineering', 'Calculus with Analysis', 'KNUST Mechanical Engineering core course, Level 100 Semester 2.', 1, 2, 'MATH 152', 4),
  ('Mechanical Engineering', 'Communication Skills II', 'KNUST Mechanical Engineering core course, Level 100 Semester 2.', 1, 2, 'ENGL 158', 2),
  ('Mechanical Engineering', 'Basic Electronics', 'KNUST Mechanical Engineering core course, Level 100 Semester 2.', 1, 2, 'EE 152', 3),
  ('Mechanical Engineering', 'Engineering Drawing', 'KNUST Mechanical Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 160', 3),
  ('Mechanical Engineering', 'Statics of Solid Mechanics', 'KNUST Mechanical Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 164', 2),
  ('Mechanical Engineering', 'Computer Programming for Engineers', 'KNUST Mechanical Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 158', 2),
  ('Mechanical Engineering', 'First Year Design Project', 'KNUST Mechanical Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 174', 2),
  -- Year Two, Semester One
  ('Mechanical Engineering', 'Differential Equations', 'KNUST Mechanical Engineering core course, Level 200 Semester 1.', 2, 1, 'MATH 251', 4),
  ('Mechanical Engineering', 'Literature in English I', 'KNUST Mechanical Engineering core course, Level 200 Semester 1.', 2, 1, 'ENGL 263', 1),
  ('Mechanical Engineering', 'Dynamics of Solid Mechanics', 'KNUST Mechanical Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 261', 2),
  ('Mechanical Engineering', 'Introduction to Fluid Mechanics', 'KNUST Mechanical Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 251', 2),
  ('Mechanical Engineering', 'Engineering Materials I', 'KNUST Mechanical Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 281', 2),
  ('Mechanical Engineering', 'Strength of Materials I', 'KNUST Mechanical Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 255', 3),
  ('Mechanical Engineering', 'Applications of Computer Graphics', 'KNUST Mechanical Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 259', 3),
  ('Mechanical Engineering', 'Mechanical Engineering Laboratory I', 'KNUST Mechanical Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 295', 1),
  -- Year Two, Semester Two
  ('Mechanical Engineering', 'Calculus with Several Variables', 'KNUST Mechanical Engineering core course, Level 200 Semester 2.', 2, 2, 'MATH 252', 4),
  ('Mechanical Engineering', 'Literature in English II', 'KNUST Mechanical Engineering core course, Level 200 Semester 2.', 2, 2, 'ENGL 264', 1),
  ('Mechanical Engineering', 'Manufacturing Technology', 'KNUST Mechanical Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 270', 3),
  ('Mechanical Engineering', 'Mechanisms Synthesis and Analysis I', 'KNUST Mechanical Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 262', 3),
  ('Mechanical Engineering', 'Fluid Dynamics I', 'KNUST Mechanical Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 252', 2),
  ('Mechanical Engineering', 'Thermodynamics I', 'KNUST Mechanical Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 266', 2),
  ('Mechanical Engineering', 'Second Year Design Project', 'KNUST Mechanical Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 274', 2),
  ('Mechanical Engineering', 'Mechanical Engineering Laboratory II', 'KNUST Mechanical Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 296', 1),
  -- Year Three, Semester One
  ('Mechanical Engineering', 'Probability and Statistics', 'KNUST Mechanical Engineering core course, Level 300 Semester 1.', 3, 1, 'MATH 353', 2),
  ('Mechanical Engineering', 'Numerical Methods', 'KNUST Mechanical Engineering core course, Level 300 Semester 1.', 3, 1, 'MATH 351', 2),
  ('Mechanical Engineering', 'Automatic Control I', 'KNUST Mechanical Engineering core course, Level 300 Semester 1.', 3, 1, 'ME 363', 2),
  ('Mechanical Engineering', 'Thermodynamics II', 'KNUST Mechanical Engineering core course, Level 300 Semester 1.', 3, 1, 'ME 365', 3),
  ('Mechanical Engineering', 'Mechanical Engineering Laboratory III', 'KNUST Mechanical Engineering core course, Level 300 Semester 1.', 3, 1, 'ME 395', 1),
  ('Mechanical Engineering', 'Machine Elements Design', 'KNUST Mechanical Engineering core course, Level 300 Semester 1.', 3, 1, 'ME 373', 3),
  ('Mechanical Engineering', 'Dynamics of Machinery', 'KNUST Mechanical Engineering core course, Level 300 Semester 1.', 3, 1, 'ME 361', 3),
  ('Mechanical Engineering', 'Introduction to Economics I', 'KNUST Mechanical Engineering core course, Level 300 Semester 1.', 3, 1, 'ECON 151', 2),
  -- Year Three, Semester Two
  ('Mechanical Engineering', 'Strength of Materials II', 'KNUST Mechanical Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 356', 2),
  ('Mechanical Engineering', 'Industrial Engineering and Ergonomics', 'KNUST Mechanical Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 392', 2),
  ('Mechanical Engineering', 'Machine Design', 'KNUST Mechanical Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 374', 2),
  ('Mechanical Engineering', 'Fluid Dynamics II', 'KNUST Mechanical Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 352', 3),
  ('Mechanical Engineering', 'Heat Transfer', 'KNUST Mechanical Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 366', 3),
  ('Mechanical Engineering', 'Vibrations I', 'KNUST Mechanical Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 362', 3),
  ('Mechanical Engineering', 'Mechanical Engineering Laboratory IV', 'KNUST Mechanical Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 396', 1),
  -- Year Four, Semester One (core)
  ('Mechanical Engineering', 'Hydraulics and Pneumatics', 'KNUST Mechanical Engineering core course, Level 400 Semester 1.', 4, 1, 'ME 453', 3),
  ('Mechanical Engineering', 'Engineering Economy and Management', 'KNUST Mechanical Engineering core course, Level 400 Semester 1.', 4, 1, 'ME 491', 2),
  ('Mechanical Engineering', 'Final Year Project I', 'KNUST Mechanical Engineering core course, Level 400 Semester 1.', 4, 1, 'ME 497', 3),
  -- Year Four, Semester One (specialisation options + technical electives)
  ('Mechanical Engineering', 'Vibrations II', 'Year 4 option course — Applied Mechanics specialisation (also open as an elective).', 4, 1, 'ME 461', 3),
  ('Mechanical Engineering', 'Automatic Control II', 'Year 4 option course — Applied Mechanics specialisation (also open as an elective).', 4, 1, 'ME 463', 3),
  ('Mechanical Engineering', 'Strength of Materials III', 'Year 4 option course — Applied Mechanics specialisation (also open as an elective).', 4, 1, 'ME 455', 3),
  ('Mechanical Engineering', 'Design of Vehicle Structures', 'Year 4 option course — Automobile Engineering specialisation (also open as an elective).', 4, 1, 'ME 485', 3),
  ('Mechanical Engineering', 'Maintenance and Management of Transport', 'Year 4 option course — Automobile Engineering specialisation (also open as an elective).', 4, 1, 'ME 489', 3),
  ('Mechanical Engineering', 'Vehicle Power Train Systems', 'Year 4 option course — Automobile Engineering specialisation (also open as an elective).', 4, 1, 'ME 487', 3),
  ('Mechanical Engineering', 'Machine Tools Design', 'Year 4 option course — Design and Manufacturing specialisation (also open as an elective).', 4, 1, 'ME 471', 3),
  ('Mechanical Engineering', 'Computer Aided Design and Manufacturing', 'Year 4 option course — Design and Manufacturing specialisation (also open as an elective).', 4, 1, 'ME 473', 3),
  ('Mechanical Engineering', 'Production Engineering I', 'Year 4 option course — Design and Manufacturing specialisation (also open as an elective).', 4, 1, 'ME 477', 3),
  ('Mechanical Engineering', 'Facilities Design', 'Year 4 option course — Industrial Engineering specialisation (also open as an elective).', 4, 1, 'ME 469', 3),
  ('Mechanical Engineering', 'Discrete Event Simulation', 'Year 4 option course — Industrial Engineering specialisation (also open as an elective).', 4, 1, 'ME 457', 3),
  ('Mechanical Engineering', 'Operations Research', 'Year 4 option course — Industrial Engineering specialisation (also open as an elective).', 4, 1, 'ME 499', 3),
  ('Mechanical Engineering', 'Behaviour of Real Fluids', 'Year 4 option course — Thermo-fluids and Energy Systems specialisation (also open as an elective).', 4, 1, 'ME 451', 3),
  ('Mechanical Engineering', 'Air Conditioning and Refrigeration', 'Year 4 option course — Thermo-fluids and Energy Systems specialisation (also open as an elective).', 4, 1, 'ME 465', 3),
  ('Mechanical Engineering', 'Renewable Energy Conversion', 'Year 4 option course — Thermo-fluids and Energy Systems specialisation (also open as an elective).', 4, 1, 'ME 467', 2),
  ('Mechanical Engineering', 'Engineering Materials II', 'Year 4 technical elective (Mechanical Engineering).', 4, 1, 'ME 481', 2),
  ('Mechanical Engineering', 'Composite Materials', 'Year 4 technical elective (Mechanical Engineering).', 4, 1, 'MSE 451', 3),
  ('Mechanical Engineering', 'Mechatronics', 'Year 4 technical elective (Mechanical Engineering).', 4, 1, 'ME 483', 3),
  -- Year Four, Semester Two (core)
  ('Mechanical Engineering', 'Entrepreneurship Development and Management', 'KNUST Mechanical Engineering core course, Level 400 Semester 2.', 4, 2, 'ME 492', 2),
  ('Mechanical Engineering', 'Instrumentation', 'KNUST Mechanical Engineering core course, Level 400 Semester 2.', 4, 2, 'ME 464', 2),
  ('Mechanical Engineering', 'Final Year Project II', 'KNUST Mechanical Engineering core course, Level 400 Semester 2.', 4, 2, 'ME 498', 5),
  ('Mechanical Engineering', 'Maintenance Engineering', 'KNUST Mechanical Engineering core course, Level 400 Semester 2.', 4, 2, 'ME 494', 3),
  -- Year Four, Semester Two (specialisation options + technical electives)
  ('Mechanical Engineering', 'Vehicle Control, Suspension and Stability', 'Year 4 option course — Automobile Engineering specialisation (also open as an elective).', 4, 2, 'ME 486', 3),
  ('Mechanical Engineering', 'Internal Combustion Engines', 'Year 4 option course — Automobile / Thermo-fluids specialisations (also open as an elective).', 4, 2, 'ME 468', 3),
  ('Mechanical Engineering', 'Machine Shop and Factory Design', 'Year 4 option course — Design and Manufacturing specialisation (also open as an elective).', 4, 2, 'ME 472', 3),
  ('Mechanical Engineering', 'Production Engineering II', 'Year 4 option course — Design and Manufacturing specialisation (also open as an elective).', 4, 2, 'ME 478', 3),
  ('Mechanical Engineering', 'Production Planning and Control', 'Year 4 option course — Industrial Engineering specialisation (also open as an elective).', 4, 2, 'ME 474', 3),
  ('Mechanical Engineering', 'Fluid Machinery', 'Year 4 option course — Thermo-fluids and Energy Systems specialisation (also open as an elective).', 4, 2, 'ME 452', 3),
  ('Mechanical Engineering', 'Engineering Materials Processing', 'Year 4 technical elective (Mechanical Engineering).', 4, 2, 'ME 482', 2),
  ('Mechanical Engineering', 'Automation and Production Systems', 'Year 4 technical elective (Mechanical Engineering).', 4, 2, 'ME 470', 2),
  ('Mechanical Engineering', 'Automotive Electrical and Electronic Systems', 'Year 4 technical elective (Mechanical Engineering).', 4, 2, 'ME 488', 3)
on conflict (subject, code) where code is not null do update set
  name = excluded.name,
  description = excluded.description,
  year = excluded.year,
  semester = excluded.semester,
  credits = excluded.credits;

-- ---------------------------------------------------------------------------
-- 3) Industrial Engineering — …/undergraduate/bsc-industrial-engineering
-- ---------------------------------------------------------------------------
insert into public.courses (subject, name, description, year, semester, code, credits) values
  -- Year One, Semester One
  ('Industrial Engineering', 'Algebra', 'KNUST Industrial Engineering core course, Level 100 Semester 1.', 1, 1, 'MATH 151', 4),
  ('Industrial Engineering', 'Communication Skills I', 'KNUST Industrial Engineering core course, Level 100 Semester 1.', 1, 1, 'ENGL 157', 2),
  ('Industrial Engineering', 'Applied Electricity', 'KNUST Industrial Engineering core course, Level 100 Semester 1.', 1, 1, 'EE 151', 3),
  ('Industrial Engineering', 'Environmental Studies', 'KNUST Industrial Engineering core course, Level 100 Semester 1.', 1, 1, 'CE 155', 2),
  ('Industrial Engineering', 'Technical Drawing', 'KNUST Industrial Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 159', 3),
  ('Industrial Engineering', 'Engineering Technology', 'KNUST Industrial Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 195', 2),
  ('Industrial Engineering', 'Introduction to Information Technology', 'KNUST Industrial Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 157', 2),
  -- Year One, Semester Two
  ('Industrial Engineering', 'Calculus with Analysis', 'KNUST Industrial Engineering core course, Level 100 Semester 2.', 1, 2, 'MATH 152', 4),
  ('Industrial Engineering', 'Communication Skills II', 'KNUST Industrial Engineering core course, Level 100 Semester 2.', 1, 2, 'ENGL 158', 2),
  ('Industrial Engineering', 'Basic Electronics', 'KNUST Industrial Engineering core course, Level 100 Semester 2.', 1, 2, 'EE 152', 3),
  ('Industrial Engineering', 'Engineering Drawing', 'KNUST Industrial Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 160', 3),
  ('Industrial Engineering', 'Statics of Solid Mechanics', 'KNUST Industrial Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 164', 2),
  ('Industrial Engineering', 'Computer Programming for Engineers', 'KNUST Industrial Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 168', 2),
  ('Industrial Engineering', 'First Year Design Project', 'KNUST Industrial Engineering core course, Level 100 Semester 2.', 1, 2, 'IE 152', 3),
  -- Year Two, Semester One
  ('Industrial Engineering', 'Differential Equations', 'KNUST Industrial Engineering core course, Level 200 Semester 1.', 2, 1, 'MATH 251', 4),
  ('Industrial Engineering', 'Literature in English I', 'KNUST Industrial Engineering core course, Level 200 Semester 1.', 2, 1, 'ENGL 263', 1),
  ('Industrial Engineering', 'Dynamics of Solid Mechanics', 'KNUST Industrial Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 261', 2),
  ('Industrial Engineering', 'Introduction to Fluid Mechanics', 'KNUST Industrial Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 251', 2),
  ('Industrial Engineering', 'Engineering Materials I', 'KNUST Industrial Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 281', 2),
  ('Industrial Engineering', 'Strength of Materials I', 'KNUST Industrial Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 255', 3),
  ('Industrial Engineering', 'Applications of Computer Graphics', 'KNUST Industrial Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 259', 3),
  ('Industrial Engineering', 'Industrial Engineering Laboratory I', 'KNUST Industrial Engineering core course, Level 200 Semester 1.', 2, 1, 'IE 251', 2),
  -- Year Two, Semester Two
  ('Industrial Engineering', 'Calculus with Several Variables', 'KNUST Industrial Engineering core course, Level 200 Semester 2.', 2, 2, 'MATH 252', 4),
  ('Industrial Engineering', 'Literature in English II', 'KNUST Industrial Engineering core course, Level 200 Semester 2.', 2, 2, 'ENGL 264', 1),
  ('Industrial Engineering', 'Manufacturing Technology', 'KNUST Industrial Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 270', 3),
  ('Industrial Engineering', 'Mechanisms Synthesis and Analysis I', 'KNUST Industrial Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 262', 3),
  ('Industrial Engineering', 'Fluid Dynamics I', 'KNUST Industrial Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 252', 2),
  ('Industrial Engineering', 'Thermodynamics I', 'KNUST Industrial Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 266', 2),
  ('Industrial Engineering', 'Second Year Design Project', 'KNUST Industrial Engineering core course, Level 200 Semester 2.', 2, 2, 'IE 252', 2),
  ('Industrial Engineering', 'Industrial Engineering Laboratory II', 'KNUST Industrial Engineering core course, Level 200 Semester 2.', 2, 2, 'IE 254', 1),
  -- Year Three, Semester One
  ('Industrial Engineering', 'Probability and Statistics', 'KNUST Industrial Engineering core course, Level 300 Semester 1.', 3, 1, 'MATH 353', 2),
  ('Industrial Engineering', 'Numerical Methods', 'KNUST Industrial Engineering core course, Level 300 Semester 1.', 3, 1, 'MATH 351', 2),
  ('Industrial Engineering', 'Process Planning Systems', 'KNUST Industrial Engineering core course, Level 300 Semester 1.', 3, 1, 'IE 363', 2),
  ('Industrial Engineering', 'Engineering Work Study', 'KNUST Industrial Engineering core course, Level 300 Semester 1.', 3, 1, 'IE 365', 2),
  ('Industrial Engineering', 'Operations Research I', 'KNUST Industrial Engineering core course, Level 300 Semester 1.', 3, 1, 'IE 351', 2),
  ('Industrial Engineering', 'Ethics, Contract and Production Liability Law', 'KNUST Industrial Engineering core course, Level 300 Semester 1.', 3, 1, 'IE 364', 2),
  ('Industrial Engineering', 'Discrete Event Simulation', 'KNUST Industrial Engineering core course, Level 300 Semester 1.', 3, 1, 'IE 355', 3),
  ('Industrial Engineering', 'Project Management', 'KNUST Industrial Engineering core course, Level 300 Semester 1.', 3, 1, 'IE 357', 2),
  -- Year Three, Semester Two
  ('Industrial Engineering', 'Logistics and Supply Chain Engineering', 'KNUST Industrial Engineering core course, Level 300 Semester 2.', 3, 2, 'IE 356', 2),
  ('Industrial Engineering', 'Operations Research II', 'KNUST Industrial Engineering core course, Level 300 Semester 2.', 3, 2, 'IE 354', 2),
  ('Industrial Engineering', 'Computer-Aided Design and Manufacturing', 'KNUST Industrial Engineering core course, Level 300 Semester 2.', 3, 2, 'IE 358', 3),
  ('Industrial Engineering', 'Quality Assurance', 'KNUST Industrial Engineering core course, Level 300 Semester 2.', 3, 2, 'IE 360', 2),
  ('Industrial Engineering', 'Industrial Engineering Laboratory III', 'KNUST Industrial Engineering core course, Level 300 Semester 2.', 3, 2, 'IE 362', 1),
  ('Industrial Engineering', 'Supervised Industrial Work Experience', 'KNUST Industrial Engineering core course, Level 300 Semester 2.', 3, 2, 'IE 353', 1),
  ('Industrial Engineering', 'Advanced Manufacturing Technology I', 'KNUST Industrial Engineering core course, Level 300 Semester 2.', 3, 2, 'IE 366', 3),
  -- Year Four, Semester One
  ('Industrial Engineering', 'Engineering Economy and Management', 'KNUST Industrial Engineering core course, Level 400 Semester 1.', 4, 1, 'ME 491', 2),
  ('Industrial Engineering', 'Facilities Design and Material Handling', 'KNUST Industrial Engineering core course, Level 400 Semester 1.', 4, 1, 'IE 451', 3),
  ('Industrial Engineering', 'Industrial Engineering Laboratory IV', 'KNUST Industrial Engineering core course, Level 400 Semester 1.', 4, 1, 'IE 453', 1),
  ('Industrial Engineering', 'Costing and Break-even Analysis', 'KNUST Industrial Engineering core course, Level 400 Semester 1.', 4, 1, 'IE 455', 2),
  ('Industrial Engineering', 'Advanced Manufacturing Technology II', 'KNUST Industrial Engineering core course, Level 400 Semester 1.', 4, 1, 'IE 457', 3),
  ('Industrial Engineering', 'Risk Analysis', 'KNUST Industrial Engineering core course, Level 400 Semester 1.', 4, 1, 'IE 459', 2),
  ('Industrial Engineering', 'Industrial Safety and Manufacturing Relations', 'KNUST Industrial Engineering core course, Level 400 Semester 1.', 4, 1, 'IE 461', 2),
  ('Industrial Engineering', 'Final Year Project I', 'KNUST Industrial Engineering core course, Level 400 Semester 1.', 4, 1, 'IE 463', 3),
  -- Year Four, Semester Two
  ('Industrial Engineering', 'Automation and Production Systems', 'KNUST Industrial Engineering core course, Level 400 Semester 2.', 4, 2, 'IE 452', 2),
  ('Industrial Engineering', 'Production Planning and Control', 'KNUST Industrial Engineering core course, Level 400 Semester 2.', 4, 2, 'IE 454', 3),
  ('Industrial Engineering', 'Maintenance Engineering', 'KNUST Industrial Engineering core course, Level 400 Semester 2.', 4, 2, 'ME 494', 3),
  ('Industrial Engineering', 'Systems Integration', 'KNUST Industrial Engineering core course, Level 400 Semester 2.', 4, 2, 'IE 456', 1),
  ('Industrial Engineering', 'Entrepreneurship Development and Management', 'KNUST Industrial Engineering core course, Level 400 Semester 2.', 4, 2, 'ME 492', 2),
  ('Industrial Engineering', 'Human Factors and Ergonomics', 'KNUST Industrial Engineering core course, Level 400 Semester 2.', 4, 2, 'IE 458', 3),
  ('Industrial Engineering', 'Final Year Project II', 'KNUST Industrial Engineering core course, Level 400 Semester 2.', 4, 2, 'IE 460', 5)
on conflict (subject, code) where code is not null do update set
  name = excluded.name,
  description = excluded.description,
  year = excluded.year,
  semester = excluded.semester,
  credits = excluded.credits;

-- The site lists IE 356 twice (Logistics AND Reliability Engineering). The
-- coded row above keeps Logistics; Reliability rides without a code.
insert into public.courses (subject, name, description, year, semester, code, credits)
select 'Industrial Engineering', 'Reliability Engineering',
       'KNUST Industrial Engineering core course, Level 300 Semester 2 (listed under IE 356 on the department site).',
       3, 2, null, 3
where not exists (
  select 1 from public.courses
  where subject = 'Industrial Engineering' and code is null and name = 'Reliability Engineering'
);

-- ---------------------------------------------------------------------------
-- 4) Marine Engineering — BSc Marine Engineering brochure (2021 PDF)
-- ---------------------------------------------------------------------------
insert into public.courses (subject, name, description, year, semester, code, credits) values
  -- Year One, Semester One
  ('Marine Engineering', 'Algebra', 'KNUST Marine Engineering core course, Level 100 Semester 1.', 1, 1, 'MATH 151', 4),
  ('Marine Engineering', 'Communication Skills I', 'KNUST Marine Engineering core course, Level 100 Semester 1.', 1, 1, 'ENGL 157', 2),
  ('Marine Engineering', 'Applied Electricity', 'KNUST Marine Engineering core course, Level 100 Semester 1.', 1, 1, 'EE 151', 3),
  ('Marine Engineering', 'Marine Environmental Studies', 'KNUST Marine Engineering core course, Level 100 Semester 1.', 1, 1, 'MME 155', 2),
  ('Marine Engineering', 'Technical Drawing', 'KNUST Marine Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 159', 3),
  ('Marine Engineering', 'Introduction to Information Technology', 'KNUST Marine Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 157', 2),
  ('Marine Engineering', 'Marine Engineering Technology', 'KNUST Marine Engineering core course, Level 100 Semester 1.', 1, 1, 'MME 153', 2),
  ('Marine Engineering', 'French for Communication I', 'KNUST Marine Engineering core course, Level 100 Semester 1.', 1, 1, 'FC 181', 2),
  -- Year One, Semester Two
  ('Marine Engineering', 'Calculus with Analysis', 'KNUST Marine Engineering core course, Level 100 Semester 2.', 1, 2, 'MATH 152', 4),
  ('Marine Engineering', 'Communication Skills II', 'KNUST Marine Engineering core course, Level 100 Semester 2.', 1, 2, 'ENGL 158', 2),
  ('Marine Engineering', 'Basic Electronics', 'KNUST Marine Engineering core course, Level 100 Semester 2.', 1, 2, 'EE 152', 3),
  ('Marine Engineering', 'Engineering Drawing', 'KNUST Marine Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 160', 3),
  ('Marine Engineering', 'Statics of Solid Mechanics', 'KNUST Marine Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 164', 2),
  ('Marine Engineering', 'Computer Programming for Engineers', 'KNUST Marine Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 168', 2),
  ('Marine Engineering', 'First Year Design Project', 'KNUST Marine Engineering core course, Level 100 Semester 2.', 1, 2, 'IE 152', 3),
  -- Year Two, Semester One
  ('Marine Engineering', 'Differential Equations', 'KNUST Marine Engineering core course, Level 200 Semester 1.', 2, 1, 'MATH 251', 4),
  ('Marine Engineering', 'Economics and Commercial Geography', 'KNUST Marine Engineering core course, Level 200 Semester 1.', 2, 1, 'MME 291', 2),
  ('Marine Engineering', 'Dynamics of Solid Mechanics', 'KNUST Marine Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 261', 2),
  ('Marine Engineering', 'Introduction to Fluid Mechanics', 'KNUST Marine Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 251', 2),
  ('Marine Engineering', 'Marine Engineering Materials', 'KNUST Marine Engineering core course, Level 200 Semester 1.', 2, 1, 'MME 251', 2),
  ('Marine Engineering', 'Strength of Marine Materials I', 'KNUST Marine Engineering core course, Level 200 Semester 1.', 2, 1, 'MME 253', 3),
  ('Marine Engineering', 'Applications of Computer Graphics', 'KNUST Marine Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 259', 3),
  ('Marine Engineering', 'Fundamentals of Aquatic Skills', 'KNUST Marine Engineering core course, Level 200 Semester 1.', 2, 1, 'SES 171', 2),
  -- Year Two, Semester Two
  ('Marine Engineering', 'Calculus with Several Variables', 'KNUST Marine Engineering core course, Level 200 Semester 2.', 2, 2, 'MATH 252', 4),
  ('Marine Engineering', 'Marine Engineering Design Project II', 'KNUST Marine Engineering core course, Level 200 Semester 2.', 2, 2, 'MME 252', 2),
  ('Marine Engineering', 'Marine Mechanisms, Synthesis and Analysis', 'KNUST Marine Engineering core course, Level 200 Semester 2.', 2, 2, 'MME 254', 3),
  ('Marine Engineering', 'Manufacturing Technology', 'KNUST Marine Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 270', 3),
  ('Marine Engineering', 'Marine Engineering Laboratory I', 'KNUST Marine Engineering core course, Level 200 Semester 2.', 2, 2, 'MME 256', 1),
  ('Marine Engineering', 'Seamanship', 'KNUST Marine Engineering core course, Level 200 Semester 2.', 2, 2, 'MME 258', 2),
  ('Marine Engineering', 'Aquatic Strokes Development and Refinement', 'KNUST Marine Engineering core course, Level 200 Semester 2.', 2, 2, 'SES 172', 2),
  -- Year Three, Semester One
  ('Marine Engineering', 'Numerical Analysis', 'KNUST Marine Engineering core course, Level 300 Semester 1.', 3, 1, 'MATH 353', 2),
  ('Marine Engineering', 'Statistics', 'KNUST Marine Engineering core course, Level 300 Semester 1.', 3, 1, 'MATH 351', 2),
  ('Marine Engineering', 'Automatic Control I', 'KNUST Marine Engineering core course, Level 300 Semester 1.', 3, 1, 'ME 363', 2),
  ('Marine Engineering', 'Dynamics of Machinery', 'KNUST Marine Engineering core course, Level 300 Semester 1.', 3, 1, 'ME 361', 3),
  ('Marine Engineering', 'Design of Marine Machine Elements', 'KNUST Marine Engineering core course, Level 300 Semester 1.', 3, 1, 'MME 351', 3),
  ('Marine Engineering', 'Marine Electrical Technology', 'KNUST Marine Engineering core course, Level 300 Semester 1.', 3, 1, 'MME 353', 2),
  ('Marine Engineering', 'Basic Ship Structure', 'KNUST Marine Engineering core course, Level 300 Semester 1.', 3, 1, 'MME 355', 2),
  ('Marine Engineering', 'Engineering Thermodynamics', 'KNUST Marine Engineering core course, Level 300 Semester 1.', 3, 1, 'ME 365', 3),
  -- Year Three, Semester Two
  ('Marine Engineering', 'Industrial Engineering and Ergonomics', 'KNUST Marine Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 392', 2),
  ('Marine Engineering', 'Marine Internal Combustion Engines', 'KNUST Marine Engineering core course, Level 300 Semester 2.', 3, 2, 'MME 352', 2),
  ('Marine Engineering', 'Strength of Marine Materials II', 'KNUST Marine Engineering core course, Level 300 Semester 2.', 3, 2, 'MME 354', 3),
  ('Marine Engineering', 'Marine Electrical Technology and Electrical Measurements', 'KNUST Marine Engineering core course, Level 300 Semester 2.', 3, 2, 'MME 356', 2),
  ('Marine Engineering', 'Heat Transfer', 'KNUST Marine Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 366', 2),
  ('Marine Engineering', 'Vibrations', 'KNUST Marine Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 362', 3),
  ('Marine Engineering', 'Fluid Dynamics', 'KNUST Marine Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 352', 3),
  ('Marine Engineering', 'Marine Engineering Laboratory II', 'KNUST Marine Engineering core course, Level 300 Semester 2.', 3, 2, 'MME 358', 1),
  -- Year Four, Semester One (core)
  ('Marine Engineering', 'Marine Engineering Practical', 'KNUST Marine Engineering core course, Level 400 Semester 1.', 4, 1, 'MME 451', 2),
  ('Marine Engineering', 'Hydraulics and Pneumatics', 'KNUST Marine Engineering core course, Level 400 Semester 1.', 4, 1, 'ME 453', 3),
  ('Marine Engineering', 'Marine Engineering Economy, Accounting and Management', 'KNUST Marine Engineering core course, Level 400 Semester 1.', 4, 1, 'MME 453', 1),
  ('Marine Engineering', 'Final Year Project I', 'KNUST Marine Engineering core course, Level 400 Semester 1.', 4, 1, 'MME 455', 2),
  ('Marine Engineering', 'Marine Air Conditioning and Refrigeration', 'KNUST Marine Engineering core course, Level 400 Semester 1.', 4, 1, 'MME 457', 3),
  ('Marine Engineering', 'Naval Architecture I', 'KNUST Marine Engineering core course, Level 400 Semester 1.', 4, 1, 'MME 459', 2),
  -- Year Four, Semester One (technical electives — select at least one)
  ('Marine Engineering', 'Marine Internal Combustion Engines II', 'Year 4 technical elective — select at least one (Marine Engineering).', 4, 1, 'MME 461', 2),
  ('Marine Engineering', 'Marine Machinery Systems Design', 'Year 4 technical elective — select at least one (Marine Engineering).', 4, 1, 'MME 463', 2),
  -- Year Four, Semester Two (core)
  ('Marine Engineering', 'Ship Operation, Regulations and Management', 'KNUST Marine Engineering core course, Level 400 Semester 2.', 4, 2, 'MME 452', 2),
  ('Marine Engineering', 'Final Year Project II', 'KNUST Marine Engineering core course, Level 400 Semester 2.', 4, 2, 'MME 454', 5),
  ('Marine Engineering', 'Marine Maintenance Engineering', 'KNUST Marine Engineering core course, Level 400 Semester 2.', 4, 2, 'MME 456', 2),
  ('Marine Engineering', 'Naval Architecture II', 'KNUST Marine Engineering core course, Level 400 Semester 2.', 4, 2, 'MME 458', 2),
  ('Marine Engineering', 'Ship Safety, Environment and Watchkeeping', 'KNUST Marine Engineering core course, Level 400 Semester 2.', 4, 2, 'MME 460', 2),
  -- Year Four, Semester Two (technical electives — select at least one)
  ('Marine Engineering', 'Marine Control Engineering and Automation', 'Year 4 technical elective — select at least one (Marine Engineering).', 4, 2, 'MME 462', 3),
  ('Marine Engineering', 'Ship Construction', 'Year 4 technical elective — select at least one (Marine Engineering).', 4, 2, 'MME 464', 3)
on conflict (subject, code) where code is not null do update set
  name = excluded.name,
  description = excluded.description,
  year = excluded.year,
  semester = excluded.semester,
  credits = excluded.credits;

-- ---------------------------------------------------------------------------
-- 5) Automobile Engineering — BSc Automobile Engineering brochure (2021 PDF)
-- ---------------------------------------------------------------------------
insert into public.courses (subject, name, description, year, semester, code, credits) values
  -- Year One, Semester One
  ('Automobile Engineering', 'Algebra', 'KNUST Automobile Engineering core course, Level 100 Semester 1.', 1, 1, 'MATH 151', 4),
  ('Automobile Engineering', 'Communication Skills I', 'KNUST Automobile Engineering core course, Level 100 Semester 1.', 1, 1, 'ENGL 157', 2),
  ('Automobile Engineering', 'Applied Electricity', 'KNUST Automobile Engineering core course, Level 100 Semester 1.', 1, 1, 'EE 151', 3),
  ('Automobile Engineering', 'Environmental Studies', 'KNUST Automobile Engineering core course, Level 100 Semester 1.', 1, 1, 'CE 155', 2),
  ('Automobile Engineering', 'Technical Drawing', 'KNUST Automobile Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 159', 3),
  ('Automobile Engineering', 'Computer Programming for Engineers', 'KNUST Automobile Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 168', 2),
  ('Automobile Engineering', 'Introduction to Information Technology', 'KNUST Automobile Engineering core course, Level 100 Semester 1.', 1, 1, 'ME 157', 2),
  -- Year One, Semester Two
  ('Automobile Engineering', 'Calculus with Analysis', 'KNUST Automobile Engineering core course, Level 100 Semester 2.', 1, 2, 'MATH 152', 4),
  ('Automobile Engineering', 'Communication Skills II', 'KNUST Automobile Engineering core course, Level 100 Semester 2.', 1, 2, 'ENGL 158', 2),
  ('Automobile Engineering', 'Basic Electronics', 'KNUST Automobile Engineering core course, Level 100 Semester 2.', 1, 2, 'EE 152', 3),
  ('Automobile Engineering', 'Engineering Drawing', 'KNUST Automobile Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 160', 3),
  ('Automobile Engineering', 'Statics', 'KNUST Automobile Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 164', 2),
  ('Automobile Engineering', 'Basic Thermodynamics', 'KNUST Automobile Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 266', 2),
  ('Automobile Engineering', 'Measurement and Instrumentation', 'KNUST Automobile Engineering core course, Level 100 Semester 2.', 1, 2, 'ME 172', 2),
  -- Year Two, Semester One
  ('Automobile Engineering', 'Differential Equations', 'KNUST Automobile Engineering core course, Level 200 Semester 1.', 2, 1, 'MATH 251', 4),
  ('Automobile Engineering', 'Technical Report Writing and Presentation', 'KNUST Automobile Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 291', 2),
  ('Automobile Engineering', 'Dynamics', 'KNUST Automobile Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 261', 2),
  ('Automobile Engineering', 'Introduction to Fluid Mechanics', 'KNUST Automobile Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 251', 2),
  ('Automobile Engineering', 'Engineering Materials', 'KNUST Automobile Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 281', 2),
  ('Automobile Engineering', 'Strength of Materials I', 'KNUST Automobile Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 255', 3),
  ('Automobile Engineering', 'Applications of Computer Graphics', 'KNUST Automobile Engineering core course, Level 200 Semester 1.', 2, 1, 'ME 259', 3),
  ('Automobile Engineering', 'Automobile Engineering Laboratory I', 'KNUST Automobile Engineering core course, Level 200 Semester 1.', 2, 1, 'AME 295', 1),
  ('Automobile Engineering', 'Engineering in Society', 'KNUST Automobile Engineering core course, Level 200 Semester 1.', 2, 1, 'CENG 291', 2),
  -- Year Two, Semester Two
  ('Automobile Engineering', 'Calculus with Several Variables', 'KNUST Automobile Engineering core course, Level 200 Semester 2.', 2, 2, 'MATH 252', 4),
  ('Automobile Engineering', 'Automotive Electrical Systems and Electronics', 'KNUST Automobile Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 284', 2),
  ('Automobile Engineering', 'Manufacturing Technology', 'KNUST Automobile Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 270', 3),
  ('Automobile Engineering', 'Mechanisms Synthesis and Analysis I', 'KNUST Automobile Engineering core course, Level 200 Semester 2.', 2, 2, 'ME 264', 3),
  ('Automobile Engineering', 'Fluid Mechanics', 'KNUST Automobile Engineering core course, Level 200 Semester 2.', 2, 2, 'AME 252', 2),
  ('Automobile Engineering', 'Design of Auto Machine Elements', 'KNUST Automobile Engineering core course, Level 200 Semester 2.', 2, 2, 'AME 274', 3),
  ('Automobile Engineering', 'Automobile Engineering Laboratory II', 'KNUST Automobile Engineering core course, Level 200 Semester 2.', 2, 2, 'AME 296', 1),
  ('Automobile Engineering', 'Automobile Engineering Vacation Training I', 'KNUST Automobile Engineering core course, Level 200 Semester 2.', 2, 2, 'AME 272', 2),
  -- Year Three, Semester One
  ('Automobile Engineering', 'Probability and Statistics', 'KNUST Automobile Engineering core course, Level 300 Semester 1.', 3, 1, 'MATH 353', 2),
  ('Automobile Engineering', 'Numerical Methods', 'KNUST Automobile Engineering core course, Level 300 Semester 1.', 3, 1, 'MATH 351', 2),
  ('Automobile Engineering', 'Design of Auto Mechanical Systems', 'KNUST Automobile Engineering core course, Level 300 Semester 1.', 3, 1, 'AME 373', 3),
  ('Automobile Engineering', 'Dynamics of Machinery', 'KNUST Automobile Engineering core course, Level 300 Semester 1.', 3, 1, 'ME 361', 3),
  ('Automobile Engineering', 'Heat Transfer and Combustion', 'KNUST Automobile Engineering core course, Level 300 Semester 1.', 3, 1, 'AME 365', 3),
  ('Automobile Engineering', 'Land Vehicle Design', 'KNUST Automobile Engineering core course, Level 300 Semester 1.', 3, 1, 'AME 371', 2),
  ('Automobile Engineering', 'Automotive Workshop Practice I', 'KNUST Automobile Engineering core course, Level 300 Semester 1.', 3, 1, 'AME 381', 2),
  ('Automobile Engineering', 'Automobile Engineering Laboratory III', 'KNUST Automobile Engineering core course, Level 300 Semester 1.', 3, 1, 'AME 395', 1),
  -- Year Three, Semester Two
  ('Automobile Engineering', 'Industrial Engineering and Ergonomics', 'KNUST Automobile Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 392', 2),
  ('Automobile Engineering', 'Vibrations for Automobile Engineers', 'KNUST Automobile Engineering core course, Level 300 Semester 2.', 3, 2, 'AME 362', 2),
  ('Automobile Engineering', 'Microprocessors and Mechatronics Applications', 'KNUST Automobile Engineering core course, Level 300 Semester 2.', 3, 2, 'ME 384', 3),
  ('Automobile Engineering', 'Automotive Chassis', 'KNUST Automobile Engineering core course, Level 300 Semester 2.', 3, 2, 'AME 376', 3),
  ('Automobile Engineering', 'Manual Power Train', 'KNUST Automobile Engineering core course, Level 300 Semester 2.', 3, 2, 'AME 386', 2),
  ('Automobile Engineering', 'Land Vehicle Structures', 'KNUST Automobile Engineering core course, Level 300 Semester 2.', 3, 2, 'AME 356', 3),
  ('Automobile Engineering', 'Automotive Spark-Ignition Engines', 'KNUST Automobile Engineering core course, Level 300 Semester 2.', 3, 2, 'AME 368', 2),
  ('Automobile Engineering', 'Automobile Engineering Laboratory IV', 'KNUST Automobile Engineering core course, Level 300 Semester 2.', 3, 2, 'AME 396', 1),
  ('Automobile Engineering', 'Automobile Engineering Vacation Training II', 'KNUST Automobile Engineering core course, Level 300 Semester 2.', 3, 2, 'AME 372', 2),
  -- Year Four, Semester One (core)
  ('Automobile Engineering', 'Hydraulics and Pneumatics', 'KNUST Automobile Engineering core course, Level 400 Semester 1.', 4, 1, 'ME 453', 3),
  ('Automobile Engineering', 'Engineering Economy and Management', 'KNUST Automobile Engineering core course, Level 400 Semester 1.', 4, 1, 'ME 491', 2),
  ('Automobile Engineering', 'Final Year Project I', 'KNUST Automobile Engineering core course, Level 400 Semester 1.', 4, 1, 'AME 497', 3),
  ('Automobile Engineering', 'Automotive Compression-Ignition Engines', 'KNUST Automobile Engineering core course, Level 400 Semester 1.', 4, 1, 'AME 467', 2),
  ('Automobile Engineering', 'Automatic Power Train', 'KNUST Automobile Engineering core course, Level 400 Semester 1.', 4, 1, 'AME 485', 4),
  ('Automobile Engineering', 'Automotive Workshop Practice II', 'KNUST Automobile Engineering core course, Level 400 Semester 1.', 4, 1, 'AME 481', 2),
  -- Year Four, Semester One (technical electives)
  ('Automobile Engineering', 'Off-Road Vehicles', 'Year 4 technical elective (Automobile Engineering).', 4, 1, 'AME 483', 2),
  ('Automobile Engineering', 'Vehicle Air-Conditioning and Refrigeration', 'Year 4 technical elective (Automobile Engineering).', 4, 1, 'AME 455', 2),
  -- Year Four, Semester Two (core)
  ('Automobile Engineering', 'Entrepreneurship Development and Management', 'KNUST Automobile Engineering core course, Level 400 Semester 2.', 4, 2, 'ME 492', 2),
  ('Automobile Engineering', 'Final Year Project II', 'KNUST Automobile Engineering core course, Level 400 Semester 2.', 4, 2, 'AME 498', 5),
  ('Automobile Engineering', 'Vehicle Regulations, Maintenance and Use', 'KNUST Automobile Engineering core course, Level 400 Semester 2.', 4, 2, 'AME 496', 2),
  ('Automobile Engineering', 'Finite Element Methods', 'KNUST Automobile Engineering core course, Level 400 Semester 2.', 4, 2, 'ME 456', 3),
  ('Automobile Engineering', 'Modern Automobile Technology', 'KNUST Automobile Engineering core course, Level 400 Semester 2.', 4, 2, 'AME 476', 3),
  -- Year Four, Semester Two (technical electives)
  ('Automobile Engineering', 'Heavy Duty Vehicles', 'Year 4 technical elective (Automobile Engineering).', 4, 2, 'AME 478', 2),
  ('Automobile Engineering', 'Special Vehicles', 'Year 4 technical elective (Automobile Engineering).', 4, 2, 'AME 482', 2)
on conflict (subject, code) where code is not null do update set
  name = excluded.name,
  description = excluded.description,
  year = excluded.year,
  semester = excluded.semester,
  credits = excluded.credits;

-- AME 481 is both "Automotive Workshop Practice II" (core, coded above) and
-- "Tractors and Farm Equipment" (elective) on the site — the elective rides
-- without a code so both survive.
insert into public.courses (subject, name, description, year, semester, code, credits)
select 'Automobile Engineering', 'Tractors and Farm Equipment',
       'Year 4 technical elective (Automobile Engineering) — listed under AME 481 on the department site.',
       4, 1, null, 2
where not exists (
  select 1 from public.courses
  where subject = 'Automobile Engineering' and code is null and name = 'Tractors and Farm Equipment'
);

-- AME 496 is both "Vehicle Regulations, Maintenance and Use" (core, coded
-- above) and "Philosophy for Engineers" — same treatment.
insert into public.courses (subject, name, description, year, semester, code, credits)
select 'Automobile Engineering', 'Philosophy for Engineers',
       'Year 4 course (Automobile Engineering) — listed under AME 496 on the department site.',
       4, 2, null, 2
where not exists (
  select 1 from public.courses
  where subject = 'Automobile Engineering' and code is null and name = 'Philosophy for Engineers'
);

