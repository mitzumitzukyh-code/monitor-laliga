// Mapeo de nombres entre football-data.org (fuente en vivo, Fase 3) y los
// nombres cortos canónicos que ya usa todo el motor desde Fase 0
// (football-data.co.uk). Roster verificado con una llamada real a
// /v4/competitions/PD/matches?matchday=1 el 2026-08-13 — los 20 equipos de
// la temporada 2026-27, con id real de football-data.org.
//
// Racing de Santander, Deportivo de La Coruña y Málaga no tienen ninguna
// fila en datos/cache/laliga.json (nunca estuvieron en las 5 temporadas de
// Fase 0) — el suavizado bayesiano de motor/elo.mjs (PESO_PRIOR_PARTIDOS)
// ya está pensado exactamente para este caso: sin historial, caen al
// promedio de liga en vez de romper el cálculo.

export const EQUIPOS_VIVOS_2026_27 = [
  { idVivo: 263, nombreVivo: 'Deportivo Alavés', corto: 'Alaves' },
  { idVivo: 82, nombreVivo: 'Getafe CF', corto: 'Getafe' },
  { idVivo: 559, nombreVivo: 'Sevilla FC', corto: 'Sevilla' },
  { idVivo: 87, nombreVivo: 'Rayo Vallecano de Madrid', corto: 'Vallecano' },
  { idVivo: 5335, nombreVivo: 'Real Racing Club de Santander', corto: 'Racing' }, // sin historial
  { idVivo: 94, nombreVivo: 'Villarreal CF', corto: 'Villarreal' },
  { idVivo: 80, nombreVivo: 'RCD Espanyol de Barcelona', corto: 'Espanol' },
  { idVivo: 88, nombreVivo: 'Levante UD', corto: 'Levante' },
  { idVivo: 558, nombreVivo: 'RC Celta de Vigo', corto: 'Celta' },
  { idVivo: 79, nombreVivo: 'CA Osasuna', corto: 'Osasuna' },
  { idVivo: 560, nombreVivo: 'RC Deportivo La Coruña', corto: 'Coruna' }, // sin historial
  { idVivo: 285, nombreVivo: 'Elche CF', corto: 'Elche' },
  { idVivo: 78, nombreVivo: 'Club Atlético de Madrid', corto: 'Ath Madrid' },
  { idVivo: 84, nombreVivo: 'Málaga CF', corto: 'Malaga' }, // sin historial
  { idVivo: 95, nombreVivo: 'Valencia CF', corto: 'Valencia' },
  { idVivo: 90, nombreVivo: 'Real Betis Balompié', corto: 'Betis' },
  { idVivo: 86, nombreVivo: 'Real Madrid CF', corto: 'Real Madrid' },
  { idVivo: 92, nombreVivo: 'Real Sociedad de Fútbol', corto: 'Sociedad' },
  { idVivo: 81, nombreVivo: 'FC Barcelona', corto: 'Barcelona' },
  { idVivo: 77, nombreVivo: 'Athletic Club', corto: 'Ath Bilbao' },
];

export const VIVO_A_CORTO = new Map(EQUIPOS_VIVOS_2026_27.map((e) => [e.nombreVivo, e.corto]));
export const ID_VIVO_A_CORTO = new Map(EQUIPOS_VIVOS_2026_27.map((e) => [e.idVivo, e.corto]));
export const CORTO_A_ID_VIVO = new Map(EQUIPOS_VIVOS_2026_27.map((e) => [e.corto, e.idVivo]));
