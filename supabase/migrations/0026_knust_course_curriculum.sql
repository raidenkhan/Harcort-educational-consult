-- ============================================================================
-- Harcourt — 0026 · KNUST course codes, credits, semesters + real curriculum
--
-- The catalog used to carry generic topic rows ("Fluid Mechanics",
-- "Thermodynamics") with no code, no credit hours and no level, so the
-- Program → Year → Course directory had nothing correct to show. This
-- migration gives `courses` the three fields that directory needs:
--
--   code      text       — the KNUST course code (e.g. ME 255)
--   credits   smallint   — credit hours
--   semester  smallint   — 1 or 2 (null = runs in both / not semester-bound)
--
-- and seeds the authoritative Mechanical Engineering curriculum (Level 100 →
-- 400, both semesters) from the programme data supplied for the rebuild.
--
-- Existing generic Mechanical Engineering rows are removed first — but ONLY
-- when nothing references them (tutor offers, materials, videos, requests,
-- engagements). A row that is already in use is left alone; this migration
-- never cascades a tutor's live offer away.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

alter table public.courses add column if not exists code text;
alter table public.courses add column if not exists credits smallint;
alter table public.courses add column if not exists semester smallint;

alter table public.courses drop constraint if exists courses_semester_check;
alter table public.courses add constraint courses_semester_check
  check (semester is null or semester in (1, 2));

alter table public.courses drop constraint if exists courses_credits_check;
alter table public.courses add constraint courses_credits_check
  check (credits is null or (credits >= 0 and credits <= 12));

-- One row per (programme, code): a code can only name one course.
create unique index if not exists idx_courses_subject_code
  on public.courses (subject, code)
  where code is not null;

-- Drop the generic, un-coded Mechanical Engineering topics — but never one
-- that something already points at.
delete from public.courses c
where c.subject = 'Mechanical Engineering'
  and c.code is null
  and not exists (select 1 from public.tutor_services ts where ts.course_id = c.id)
  and not exists (select 1 from public.course_materials m where m.course_id = c.id)
  and not exists (select 1 from public.course_videos v where v.course_id = c.id)
  and not exists (select 1 from public.tutor_requests r where r.course_id = c.id)
  and not exists (select 1 from public.engagements e where e.course_id = c.id);

-- The KNUST Mechanical Engineering curriculum: Level 100 → 400, semester 1
-- and 2, with codes and credit hours. `year` is the level (1 = Level 100).
insert into public.courses (subject, name, description, year, semester, code, credits) values
  ('Mechanical Engineering', 'Mathematics I (Algebra & Calculus)', 'Foundational algebra, trigonometry, differential calculus, functions, limits, and applications of derivatives for engineering disciplines.', 1, 1, 'MATH 151', 3),
  ('Mechanical Engineering', 'Applied Electricity & Circuit Analysis', 'Electric circuit theorems, DC/AC circuits, electromagnetism, transformers, three-phase power, and electrical machinery fundamentals for mechanical engineers.', 1, 1, 'ME 159', 3),
  ('Mechanical Engineering', 'Engineering Drawing I', 'Technical lettering, orthographic projections, isometric and oblique drawings, auxiliary views, and sectioning principles.', 1, 1, 'ME 161', 2),
  ('Mechanical Engineering', 'Workshop Technology & Mechanical Practice I', 'Hands-on training in machine shop practices, bench work, fitting, drilling, lathe turning, metal cutting tools, and industrial safety.', 1, 1, 'ME 163', 2),
  ('Mechanical Engineering', 'Introduction to Mechanical Engineering', 'Overview of mechanical engineering professions, thermo-fluids, mechanics, automotive, energy conversion, ethics, and career orientation.', 1, 1, 'ME 165', 2),
  ('Mechanical Engineering', 'Mathematics II (Integral Calculus & Vectors)', 'Definite and indefinite integrals, integration techniques, applications to areas and volumes of revolution, vector algebra, dot and cross products.', 1, 2, 'MATH 152', 3),
  ('Mechanical Engineering', 'Basic Electronics & Semiconductor Principles', 'Semiconductor physics, p-n junction diodes, BJT transistors, operational amplifiers (op-amps), logic gates, and sensor interfaces for mechanical automation.', 1, 2, 'ME 160', 3),
  ('Mechanical Engineering', 'Engineering Drawing II & 2D CAD', 'Assembly drawing, limits, fits, tolerances, surface texture symbols, and computer-aided drafting (CAD) using AutoCAD.', 1, 2, 'ME 162', 2),
  ('Mechanical Engineering', 'Workshop Technology & Mechanical Practice II', 'Welding processes (shielded metal arc, oxy-acetylene gas), sheet metal work, forging, foundry practice, pattern making, and casting techniques.', 1, 2, 'ME 164', 2),
  ('Mechanical Engineering', 'Computer Programming for Engineers (C++ & Python)', 'Algorithms, pseudocode, flowcharts, variables, loops, arrays, functions, and numerical computation for engineering equations using C++ and Python.', 1, 2, 'COE 158', 2),
  ('Mechanical Engineering', 'Mathematics III (Advanced Calculus & ODEs)', 'Ordinary differential equations (1st and 2nd order), Laplace transforms, partial differentiation, and multiple integrals for engineering mechanics.', 2, 1, 'MATH 251', 3),
  ('Mechanical Engineering', 'Strength of Materials I', 'Mechanics of deformable bodies, simple stress and strain, thermal stresses, shear force and bending moment diagrams, flexural formula, and shear stresses in beams.', 2, 1, 'ME 251', 3),
  ('Mechanical Engineering', 'Engineering Thermodynamics I', 'Thermodynamic systems, properties of pure substances, work and heat transfer, First Law for closed and open control volumes, and Second Law principles.', 2, 1, 'ME 253', 3),
  ('Mechanical Engineering', 'Fluid Mechanics I', 'Fluid statics, pressure measurement, hydrostatic forces on submerged surfaces, buoyancy, fluid kinematics, continuity, and Bernoulli equation.', 2, 1, 'ME 255', 3),
  ('Mechanical Engineering', 'Material Science I (Engineering Materials)', 'Atomic bonding, crystalline structures (BCC, FCC, HCP), crystal defects, diffusion, mechanical testing of metals, and iron-iron carbide phase diagram.', 2, 1, 'ME 257', 3),
  ('Mechanical Engineering', 'Mathematics IV (Linear Algebra & Numerical Methods)', 'Matrices, determinants, eigenvalues and eigenvectors, systems of linear equations, Gauss elimination, Newton-Raphson, and numerical integration.', 2, 2, 'MATH 252', 3),
  ('Mechanical Engineering', 'Strength of Materials II', 'Torsion of circular shafts, complex state of stress, Mohr’s circle, thin and thick-walled pressure vessels, column buckling (Euler formula), and deflection of beams.', 2, 2, 'ME 252', 3),
  ('Mechanical Engineering', 'Engineering Thermodynamics II (Power Cycles)', 'Gas power cycles (Otto, Diesel, Dual, Brayton), vapor power cycles (Rankine cycle with reheat and regeneration), and refrigeration vapor compression cycles.', 2, 2, 'ME 254', 3),
  ('Mechanical Engineering', 'Fluid Mechanics II (Viscous Flow & Pipes)', 'Laminar and turbulent flows in pipes, Reynolds number, Darcy-Weisbach equation, Moody diagram, minor losses, pipe networks, and boundary layer theory.', 2, 2, 'ME 256', 3),
  ('Mechanical Engineering', 'Machine Drawing & 3D CAD Modeling', 'Parametric 3D solid modeling using SolidWorks/Inventor, assembly modeling, exploded views, bill of materials (BOM), and mechanical fasteners.', 2, 2, 'ME 260', 2),
  ('Mechanical Engineering', 'Machine Design I', 'Design methodology, static and fatigue failure theories (Soderberg, Goodman), design of transmission shafts, keys, couplings, and bolted joints.', 3, 1, 'ME 357', 3),
  ('Mechanical Engineering', 'Manufacturing Technology I (Processes)', 'Metal forming processes (rolling, forging, extrusion, drawing), sheet metal stamping, powder metallurgy, plastic molding, and manufacturing economics.', 3, 1, 'ME 359', 3),
  ('Mechanical Engineering', 'Engineering Mechanics III (Advanced Dynamics)', 'Analytical mechanics, generalized coordinates, Lagrange’s equations, multi-degree-of-freedom vibration systems, and mode shapes.', 3, 1, 'ME 361', 3),
  ('Mechanical Engineering', 'Machine Design II (Gears, Bearings & Drives)', 'Design of spur, helical, bevel, and worm gears (AGMA standards), hydrodynamic and rolling-element bearings (L10 life rating), brakes, clutches, and belt drives.', 3, 2, 'ME 352', 3),
  ('Mechanical Engineering', 'Heat Transfer & Thermal Equipment Design', 'Steady and unsteady conduction, forced and natural convection correlations, radiation heat exchange, and design of shell-and-tube heat exchangers (LMTD and NTU methods).', 3, 2, 'ME 354', 3),
  ('Mechanical Engineering', 'Mechanics of Machines & Balancing', 'Static and dynamic balancing of rotating shafts, balancing of single and multi-cylinder in-line and V-engines, firing orders, and flywheel sizing.', 3, 2, 'ME 356', 3),
  ('Mechanical Engineering', 'Manufacturing Technology II (CNC & Metrology)', 'Theory of metal cutting (Merchant circle), tool wear and Taylor tool life equation, CNC G-code programming, and precision dimensional metrology.', 3, 2, 'ME 358', 3),
  ('Mechanical Engineering', 'Computational Methods & Finite Element Analysis (FEA)', 'Introduction to finite element method (FEM), 1D bar and truss elements, 2D beam elements, plane stress/strain, stiffness matrices, and ANSYS simulation.', 3, 2, 'ME 360', 3),
  ('Mechanical Engineering', 'Operations Research & Production Management', 'Linear programming (simplex method), transportation and assignment models, critical path method (CPM/PERT), inventory control (EOQ), and queueing theory.', 3, 2, 'ME 362', 3),
  ('Mechanical Engineering', 'Power Plant Engineering', 'Thermal steam power cycles, super-critical boilers, steam turbines, gas turbine combined cycle (CCGT), hydro-electric power plants (Akosombo, Bui), and plant economics.', 4, 1, 'ME 451', 3),
  ('Mechanical Engineering', 'Refrigeration and Air Conditioning (HVAC)', 'Psychrometric processes, cooling load estimation, vapor compression and absorption systems, refrigerants (R134a, R410A, low-GWP), duct design, and air distribution.', 4, 1, 'ME 453', 3),
  ('Mechanical Engineering', 'Turbo-Machinery', 'Euler turbomachine equation, velocity triangles, centrifugal and axial flow pumps, compressors, impulse and reaction turbines, cavitation, and NPSH.', 4, 1, 'ME 455', 3),
  ('Mechanical Engineering', 'Computer-Aided Design & Manufacturing (CAD/CAM)', 'CAD geometric representations (B-rep, CSG, NURBS), toolpath generation, multi-axis CNC machining, post-processing, and additive manufacturing integration.', 4, 1, 'ME 457', 3),
  ('Mechanical Engineering', 'Maintenance Engineering & Plant Reliability', 'Reliability-Centered Maintenance (RCM), Mean Time Between Failures (MTBF), vibration condition monitoring, oil analysis, thermography, and total productive maintenance (TPM).', 4, 1, 'ME 459', 3),
  ('Mechanical Engineering', 'Final Year Research Project I (Capstone Design)', 'Literature review, problem definition, mathematical and CAD design, engineering feasibility, and proposal defense of the capstone engineering design.', 4, 1, 'ME 497', 3),
  ('Mechanical Engineering', 'Internal Combustion Engines & Alternative Fuels', 'Spark-ignition and compression-ignition combustion physics, knock phenomenon, fuel injection systems, turbocharging, alternative biofuels, and emissions control (Euro/EPA).', 4, 2, 'ME 452', 3),
  ('Mechanical Engineering', 'Renewable Energy Technologies', 'Solar thermal collectors, solar photovoltaics (PV), wind turbine aerodynamics (Betz limit), biomass gasification, and mini-hydro systems in Ghana.', 4, 2, 'ME 454', 3),
  ('Mechanical Engineering', 'Industrial Robotics & Mechatronics', 'Kinematics of robotic manipulators, Denavit-Hartenberg (D-H) convention, Jacobians, trajectory planning, stepper/servo actuators, and PLC ladder logic.', 4, 2, 'ME 456', 3),
  ('Mechanical Engineering', 'Engineering Economics & Project Management', 'Time value of money, Net Present Value (NPV), Internal Rate of Return (IRR), depreciation, lifecycle costing, contract law (FIDIC), and engineering entrepreneurship.', 4, 2, 'ME 458', 3),
  ('Mechanical Engineering', 'Automotive Engineering & Vehicle Dynamics', 'Vehicle acceleration, aerodynamic drag, rolling resistance, tire-road friction, braking performance, cornering dynamics (understeer/oversteer), and suspension design.', 4, 2, 'ME 460', 3),
  ('Mechanical Engineering', 'Final Year Research Project II (Capstone Defense & Thesis)', 'Prototype construction, experimentation, testing, data collection, comprehensive engineering thesis writing, and oral defense before the departmental examination panel.', 4, 2, 'ME 498', 3)

on conflict (subject, name) do update
  set code        = excluded.code,
      credits     = excluded.credits,
      semester    = excluded.semester,
      year        = excluded.year,
      description = excluded.description;

comment on column public.courses.code is
  'KNUST course code, e.g. "ME 255" (0026). Null for legacy topic-only rows.';
comment on column public.courses.credits is
  'Credit hours for the course (0026).';
comment on column public.courses.semester is
  '1 or 2; null = runs across both / not semester-bound (0026).';
