-- Monitor LaLiga — esquema de Supabase (Fase 3).
--
-- Un solo usuario, sin multiusuario. Las tablas se escriben desde datos/api.mjs
-- y los flujos de n8n usando la service_role key (que ignora RLS). RLS se deja
-- prendido de todos modos, con una sola política: lectura pública (anon), para
-- que la web estática de Fase 5 pueda leer directo sin backend propio. Nada de
-- INSERT/UPDATE/DELETE para anon — eso solo pasa desde el backend.
--
-- Nomenclatura: nombres de columna en snake_case (convención de Postgres/
-- Supabase), no en camelCase como el resto del proyecto en JS.

-- ============================================================
-- teams — catálogo de equipos, id = team id de api-sports.
-- ============================================================
create table if not exists teams (
  id integer primary key,                 -- team_id de api-sports
  name text not null,                      -- nombre completo (api-sports)
  name_fd text,                            -- nombre corto de football-data.co.uk
                                            -- (ver datos/equipos.mjs), nulo si
                                            -- el equipo nunca apareció en el
                                            -- histórico (recién ascendido)
  created_at timestamptz not null default now()
);

-- ============================================================
-- fixtures — un partido de LaLiga, en vivo o histórico.
-- ============================================================
create table if not exists fixtures (
  id bigint primary key,                   -- fixture_id de api-sports
  league_id integer not null default 140,  -- LaLiga
  season integer not null,                 -- año de inicio (ej. 2026 = 2026-27)
  round text,                              -- texto crudo de api-sports
  date timestamptz not null,
  home_team_id integer not null references teams(id),
  away_team_id integer not null references teams(id),
  home_goals integer,                      -- nulo hasta que se juegue
  away_goals integer,
  status text not null default 'NS',       -- NS, 1H, HT, 2H, FT, PST, etc.
  updated_at timestamptz not null default now()
);

create index if not exists idx_fixtures_date on fixtures(date);
create index if not exists idx_fixtures_home on fixtures(home_team_id);
create index if not exists idx_fixtures_away on fixtures(away_team_id);
create index if not exists idx_fixtures_season on fixtures(season);

-- ============================================================
-- lineups — convocatoria real de un partido (titular/banca).
-- NOTA (2026-08-12): el plan gratis de api-sports.io NO incluye
-- fixtures/lineups para LaLiga (coverage.fixtures.lineups=false,
-- verificado contra /leagues?id=140). Esta tabla queda lista para cuando
-- haya una fuente que sí la alimente (plan de pago, u otra API) — hoy
-- datos/api.mjs no la llena en vivo.
-- ============================================================
create table if not exists lineups (
  id bigserial primary key,
  fixture_id bigint not null references fixtures(id),
  team_id integer not null references teams(id),
  player_id integer not null,
  player_name text not null,
  position text,
  is_starting boolean not null default false,
  created_at timestamptz not null default now(),
  unique (fixture_id, player_id)
);

create index if not exists idx_lineups_fixture on lineups(fixture_id, team_id);

-- ============================================================
-- absences — jugadores regulares ausentes de un partido (lesión, banca,
-- suspensión — no se distingue la causa, ver motor/ausencias.mjs).
-- NOTA (2026-08-12): mismo límite que lineups — api-sports.io /injuries no
-- está en el plan gratis para LaLiga (coverage.injuries=false). Esta tabla
-- queda lista, sin alimentarse en vivo por ahora. El ajuste ya se había
-- botado en Fase 2 por no ganarse el puesto contra el backtest, así que
-- tampoco haría falta activarlo aunque hubiera datos.
-- ============================================================
create table if not exists absences (
  id bigserial primary key,
  fixture_id bigint not null references fixtures(id),
  team_id integer not null references teams(id),
  player_id integer not null,
  player_name text not null,
  reason text,                             -- 'injury' | 'suspension' | 'unknown'
  source text not null,                    -- de dónde se detectó/reportó
  created_at timestamptz not null default now()
);

create index if not exists idx_absences_fixture on absences(fixture_id, team_id);

-- ============================================================
-- predictions — una predicción por partido, con los lambdas y
-- coeficientes usados (para poder reproducir el cálculo exacto después).
-- ============================================================
create table if not exists predictions (
  id bigserial primary key,
  fixture_id bigint not null references fixtures(id),
  lh numeric not null,
  la numeric not null,
  prob_local numeric not null,
  prob_empate numeric not null,
  prob_visitante numeric not null,
  rho numeric not null,
  semivida_jornadas numeric not null,
  peso_prior numeric not null,
  resultado_real text,                     -- 'local' | 'empate' | 'visitante', nulo hasta jugarse
  brier numeric,                           -- calculado una vez se sabe el resultado
  created_at timestamptz not null default now(),
  unique (fixture_id)
);

-- ============================================================
-- calibration — historial de qué valor tenía cada coeficiente y desde
-- cuándo (para poder explicar "con qué RHO se calculó esta predicción
-- vieja" sin tener que ir a buscarlo en el historial de git).
-- ============================================================
create table if not exists calibration (
  id bigserial primary key,
  coefficient_name text not null,          -- ej. 'RHO', 'SEMIVIDA_JORNADAS'
  value numeric not null,
  effective_from date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- api_usage — contador de peticiones a api-sports, persistido, para el
-- freno duro de la regla 5 (100/día, freno a 80). Una fila por día.
-- ============================================================
create table if not exists api_usage (
  date date primary key,
  requests_used integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RLS: lectura pública, escritura solo desde el backend (service_role,
-- que ignora RLS de todas formas).
-- ============================================================
alter table teams enable row level security;
alter table fixtures enable row level security;
alter table lineups enable row level security;
alter table absences enable row level security;
alter table predictions enable row level security;
alter table calibration enable row level security;
alter table api_usage enable row level security;

create policy "lectura publica" on teams for select using (true);
create policy "lectura publica" on fixtures for select using (true);
create policy "lectura publica" on lineups for select using (true);
create policy "lectura publica" on absences for select using (true);
create policy "lectura publica" on predictions for select using (true);
create policy "lectura publica" on calibration for select using (true);
-- api_usage no lleva política de lectura pública: es contabilidad interna,
-- no hace falta exponerla a la web de Fase 5.
