-- ============================================================================
-- Harcourt — 0002 · KNUST engineering course taxonomy
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
--
-- Targets the initial audience: Ghanaian students, KNUST engineering first.
-- Adds engineering-focused courses alongside the general catalog.
-- ============================================================================

insert into public.courses (subject, name, description) values
  -- Engineering Mathematics
  ('Engineering Mathematics', 'Algebra & Trigonometry',    'Algebraic manipulation, trig identities and equations'),
  ('Engineering Mathematics', 'Calculus I',                'Limits, differentiation and applications'),
  ('Engineering Mathematics', 'Calculus II',               'Integration, series and multivariable calculus'),
  ('Engineering Mathematics', 'Differential Equations',    'First and second order ODEs, Laplace transforms'),
  ('Engineering Mathematics', 'Numerical Methods',         'Root finding, interpolation and numerical integration'),
  ('Engineering Mathematics', 'Probability & Statistics',  'Probability theory and engineering statistics'),

  -- Engineering Sciences & general
  ('Engineering Sciences',    'Engineering Physics I',     'Mechanics, waves and introductory electromagnetism'),
  ('Engineering Sciences',    'Engineering Physics II',    'Advanced electromagnetism, optics and modern physics'),
  ('Engineering Sciences',    'Engineering Chemistry',     'Chemical principles for engineering'),
  ('Engineering Sciences',    'Technical Report Writing',  'Structuring engineering reports and documentation'),
  ('Engineering Sciences',    'Communication Skills',      'Academic and professional communication'),

  -- Computer Engineering
  ('Computer Engineering',    'C Programming',             'Programming fundamentals in C'),
  ('Computer Engineering',    'Data Structures & Algorithms', 'Lists, trees, graphs and algorithm analysis'),
  ('Computer Engineering',    'Computer Organization & Architecture', 'CPU design, memory and instruction sets'),
  ('Computer Engineering',    'Operating Systems',         'Processes, scheduling, memory and file systems'),
  ('Computer Engineering',    'Microprocessors & Microcontrollers', 'Assembly, interfacing and embedded basics'),
  ('Computer Engineering',    'Computer Networks',         'OSI model, TCP/IP and network design'),

  -- Electrical & Electronic Engineering
  ('Electrical & Electronic Engineering', 'Circuit Theory I',   'Ohm''s law, KVL/KCL, mesh and nodal analysis'),
  ('Electrical & Electronic Engineering', 'Circuit Theory II',  'AC circuits, phasors, resonance and filters'),
  ('Electrical & Electronic Engineering', 'Electronics I',      'Diodes, transistors and amplifiers'),
  ('Electrical & Electronic Engineering', 'Electronics II',     'Op-amps, oscillators and digital electronics'),
  ('Electrical & Electronic Engineering', 'Signals & Systems',  'Continuous and discrete signals, transforms'),
  ('Electrical & Electronic Engineering', 'Control Systems',    'Transfer functions, stability and feedback'),
  ('Electrical & Electronic Engineering', 'Electrical Machines', 'DC and AC machines, transformers'),
  ('Electrical & Electronic Engineering', 'Power Systems',      'Generation, transmission and distribution'),

  -- Mechanical Engineering
  ('Mechanical Engineering',  'Engineering Mechanics (Statics)', 'Force systems, equilibrium and centroids'),
  ('Mechanical Engineering',  'Dynamics',                  'Kinematics and kinetics of particles and rigid bodies'),
  ('Mechanical Engineering',  'Strength of Materials',     'Stress, strain, beams and torsion'),
  ('Mechanical Engineering',  'Fluid Mechanics',           'Fluid statics, dynamics and pipe flow'),
  ('Mechanical Engineering',  'Thermodynamics',            'Laws of thermodynamics, cycles and heat engines'),
  ('Mechanical Engineering',  'Heat Transfer',             'Conduction, convection and radiation'),
  ('Mechanical Engineering',  'Machine Design',            'Shafts, gears, bearings and failure theories'),
  ('Mechanical Engineering',  'Engineering Drawing & CAD', 'Technical drawing and CAD modelling'),

  -- Civil Engineering
  ('Civil Engineering',       'Structural Analysis I',     'Beams, frames and influence lines'),
  ('Civil Engineering',       'Geotechnical Engineering',  'Soil mechanics and foundations'),
  ('Civil Engineering',       'Surveying',                 'Levelling, traversing and GPS'),
  ('Civil Engineering',       'Construction Materials',    'Concrete, steel and timber behaviour'),
  ('Civil Engineering',       'Transportation Engineering','Highway design and traffic engineering'),

  -- Chemical & Petroleum Engineering
  ('Chemical & Petroleum Engineering', 'Chemical Process Principles', 'Material and energy balances'),
  ('Chemical & Petroleum Engineering', 'Petroleum Engineering',       'Reservoir, drilling and production basics'),
  ('Chemical & Petroleum Engineering', 'Process Heat Transfer',       'Heat exchangers and process design')
on conflict (subject, name) do nothing;
