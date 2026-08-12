// Tabla de equivalencia de nombres de equipo entre fuentes. football-data.co.uk
// usa apodos cortos; el dataset de Transfermarkt usa el nombre comercial
// completo. Verificado a mano contra los 26 equipos que pasaron por LaLiga
// en las temporadas 2021-22 a 2025-26 (ver datos/historico.mjs y
// datos/lineups.mjs) — mapeo 1 a 1, sin ambigüedades.

export const FOOTBALL_DATA_A_TRANSFERMARKT = {
  Alaves: 'Deportivo Alavés',
  Almeria: 'UD Almería',
  'Ath Bilbao': 'Athletic Bilbao',
  'Ath Madrid': 'Atlético de Madrid',
  Barcelona: 'FC Barcelona',
  Betis: 'Real Betis Balompié',
  Cadiz: 'Cádiz CF',
  Celta: 'Celta de Vigo',
  Elche: 'Elche CF',
  Espanol: 'RCD Espanyol Barcelona',
  Getafe: 'Getafe CF',
  Girona: 'Girona FC',
  Granada: 'Granada CF',
  'Las Palmas': 'UD Las Palmas',
  Leganes: 'CD Leganés',
  Levante: 'Levante UD',
  Mallorca: 'RCD Mallorca',
  Osasuna: 'CA Osasuna',
  Oviedo: 'Real Oviedo',
  'Real Madrid': 'Real Madrid',
  Sevilla: 'Sevilla FC',
  Sociedad: 'Real Sociedad',
  Valencia: 'Valencia CF',
  Valladolid: 'Real Valladolid CF',
  Vallecano: 'Rayo Vallecano',
  Villarreal: 'Villarreal CF',
};

export const TRANSFERMARKT_A_FOOTBALL_DATA = Object.fromEntries(
  Object.entries(FOOTBALL_DATA_A_TRANSFERMARKT).map(([fd, tm]) => [tm, fd])
);
