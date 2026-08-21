// Sistema visual del panel. Portado del diseño "Monitor eSports"
// (claude.ai/design, proyecto 122c2ecb), con tres correcciones deliberadas
// respecto al original, todas señaladas en la revisión del diseño:
//
//   1. El gris de texto secundario sube de #6F7784 a #7A828F. Sobre el fondo
//      #05070A el original da 4.86:1 y algunos usos bajaban a 3.5:1 (#5F6577),
//      que no pasa AA. El nuevo da 5.2:1 en todos sus usos.
//   2. Piso tipográfico de 11px. El original bajaba a 8.5px en el rail y 9px
//      en los chips. El rail pasa de 80px a 92px de ancho para que las
//      etiquetas quepan a 11px.
//   3. El rojo es la marca, no el error. Una tendencia negativa va en ámbar
//      (--aviso), nunca en rojo. El original decía esta regla en su README y
//      la rompía en tres sitios.
//
// Sin variables de color escritas dos veces: todo sale de :root.

export const TOKENS = {
  fondo: '#05070A',
  fondoPanel: '#080A0E',
  tarjeta: '#0D1015',
  tarjetaInterior: '#11141A',
  linea: '#1a1e26',
  lineaMedia: '#242933',
  lineaFuerte: '#343943',
  tinta: '#F2F4F7',
  tintaMedia: '#A7ADB8',
  tintaSuave: '#8B95A5',
  tintaApagada: '#7A828F',
  acento: '#FF2638',
  acentoHover: '#FF3347',
  ok: '#19E68C',
  aviso: '#FFB000',
  rail: '92px',
};

export function estilos() {
  return `
  :root {
    --fondo: ${TOKENS.fondo};
    --fondo-panel: ${TOKENS.fondoPanel};
    --tarjeta: ${TOKENS.tarjeta};
    --tarjeta-interior: ${TOKENS.tarjetaInterior};
    --linea: ${TOKENS.linea};
    --linea-media: ${TOKENS.lineaMedia};
    --linea-fuerte: ${TOKENS.lineaFuerte};
    --tinta: ${TOKENS.tinta};
    --tinta-media: ${TOKENS.tintaMedia};
    --tinta-suave: ${TOKENS.tintaSuave};
    --tinta-apagada: ${TOKENS.tintaApagada};
    --acento: ${TOKENS.acento};
    --acento-hover: ${TOKENS.acentoHover};
    --ok: ${TOKENS.ok};
    --aviso: ${TOKENS.aviso};
    --rail: ${TOKENS.rail};
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    --texto: Manrope, 'Segoe UI', system-ui, -apple-system, sans-serif;
    --r-card: 12px;
    --r-caja: 8px;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--fondo);
    color: var(--tinta);
    font-family: var(--texto);
    font-size: 13px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--acento); text-decoration: none; }
  a:hover { color: var(--acento-hover); }
  ::selection { background: rgba(255,38,56,.25); }

  /* Foco visible en TODO lo que se puede alcanzar con Tab. El diseño
     original no tenía un solo <button> ni un solo aria-*: acá cada control
     es un botón real. */
  :focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; border-radius: 4px; }

  .app {
    display: grid;
    grid-template-columns: var(--rail) minmax(0, 1fr);
    min-height: 100vh;
    min-width: 1180px;
  }

  /* --- rail lateral --- */
  .rail {
    background: var(--fondo);
    border-right: 1px solid var(--linea);
    display: flex; flex-direction: column;
    padding: 20px 0;
    position: sticky; top: 0; height: 100vh;
  }
  .rail-btn {
    appearance: none; border: 1px solid transparent; background: none;
    font: inherit; color: var(--tinta-apagada); cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 12px 4px; margin: 0 8px 4px; border-radius: 10px;
    text-align: center;
  }
  .rail-btn span {
    font-size: 11px; font-weight: 700; letter-spacing: 0.04em; line-height: 1.15;
    hyphens: manual; overflow-wrap: anywhere; max-width: 100%;
  }
  .rail-btn:hover { color: var(--tinta-media); background: rgba(255,255,255,.03); }
  .rail-btn[aria-current="page"] {
    color: var(--acento);
    background: rgba(255,38,56,.08);
    border-color: rgba(255,38,56,.4);
    box-shadow: inset 0 0 18px rgba(255,38,56,.14);
  }
  .rail-abajo { margin-top: auto; }

  /* --- cabecera --- */
  .col { display: flex; flex-direction: column; min-width: 0; background: var(--fondo-panel); }
  header.barra {
    display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr);
    align-items: center; gap: 24px;
    height: 80px; padding: 0 26px;
    border-bottom: 1px solid var(--linea);
    background: var(--fondo);
    position: sticky; top: 0; z-index: 20;
  }
  .marca { display: flex; align-items: center; gap: 13px; }
  .marca-sigla {
    width: 42px; height: 42px; border-radius: 10px; flex: none;
    display: grid; place-items: center;
    font-family: var(--mono); font-weight: 700; font-size: 15px;
    color: var(--acento);
    border: 1px solid rgba(255,38,56,.45);
    background: rgba(255,38,56,.07);
  }
  .marca-nombre { font-size: 19px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.1; }
  .marca-nombre em { font-style: normal; color: var(--acento); }
  .marca-bajada {
    white-space: nowrap;
    font-size: 11px; font-weight: 700; letter-spacing: 0.16em;
    color: var(--tinta-apagada); text-transform: uppercase; margin-top: 2px;
  }
  nav.principal { display: flex; align-items: center; gap: 4px; height: 100%; }
  .nav-btn {
    appearance: none; background: none; border: 0; font: inherit; cursor: pointer;
    height: 100%; padding: 0 14px;
    font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
    color: var(--tinta-media);
    border-bottom: 2px solid transparent;
  }
  .nav-btn:hover { color: var(--tinta); }
  .nav-btn[aria-current="page"] {
    color: var(--acento); border-bottom-color: var(--acento);
    text-shadow: 0 0 14px rgba(255,38,56,.5);
  }
  .sello { justify-self: end; text-align: right; }
  .sello-etq {
    font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
    color: var(--tinta-apagada); text-transform: uppercase;
  }
  .sello-val { font-family: var(--mono); font-size: 13px; color: var(--tinta-media); margin-top: 2px; }

  /* --- franja de estado --- */
  .franja {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 26px; font-size: 12px;
    border-bottom: 1px solid var(--linea);
  }
  .franja.aviso { background: rgba(255,176,0,.09); color: #FFD98A; border-bottom-color: rgba(255,176,0,.3); }
  .franja.ok { background: rgba(25,230,140,.07); color: #9BF0C6; border-bottom-color: rgba(25,230,140,.25); }
  .franja code { font-family: var(--mono); font-size: 11px; }

  main { padding: 26px; flex: 1; }
  .vista[hidden] { display: none; }

  /* --- tipografía de sección --- */
  h1.titulo { font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.01em; }
  .bajada { color: var(--tinta-suave); font-size: 13px; margin: 6px 0 0; max-width: 74ch; }
  .encabezado { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
  .rotulo {
    font-size: 11px; font-weight: 800; letter-spacing: 0.12em;
    color: var(--tinta-apagada); text-transform: uppercase;
    margin: 28px 0 11px;
  }
  .rotulo:first-child { margin-top: 0; }

  /* --- tarjetas --- */
  .tarjeta {
    background: var(--tarjeta); border: 1px solid var(--linea-media);
    border-radius: var(--r-card); padding: 18px;
  }
  .rejilla { display: grid; gap: 14px; }
  .rejilla.k4 { grid-template-columns: repeat(4, minmax(0,1fr)); }
  .rejilla.k3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .rejilla.k2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .con-lateral { display: grid; grid-template-columns: minmax(0,1fr) 340px; gap: 18px; align-items: start; }

  /* --- KPI --- */
  .kpi-etq { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; color: var(--tinta-apagada); text-transform: uppercase; }
  .kpi-cifra { font-family: var(--mono); font-size: 30px; font-weight: 700; line-height: 1.1; margin-top: 10px; }
  .kpi-pie { font-size: 12px; color: var(--tinta-suave); margin-top: 8px; }
  .kpi-cifra.acento { color: var(--acento); }
  .kpi-cifra.ok { color: var(--ok); }

  /* --- escudos --- */
  .escudo {
    width: 30px; height: 30px; flex: none; border-radius: var(--r-caja);
    display: grid; place-items: center; overflow: hidden;
    border: 1px solid var(--linea-fuerte); background: rgba(255,255,255,.04);
    font-family: var(--mono); font-size: 11px; font-weight: 700; color: var(--tinta-media);
  }
  .escudo img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .escudo.sm { width: 24px; height: 24px; font-size: 10px; }
  .escudo.lg { width: 46px; height: 46px; font-size: 15px; }

  /* --- chips y píldoras --- */
  .chip {
    display: inline-block; font-size: 11px; font-weight: 800; letter-spacing: 0.08em;
    padding: 4px 9px; border-radius: 7px; white-space: nowrap;
    border: 1px solid var(--linea-fuerte); color: var(--tinta-media); background: rgba(5,7,10,.8);
  }
  .chip.acento { color: var(--acento); border-color: rgba(255,38,56,.45); }
  .chip.ok { color: var(--ok); border-color: rgba(25,230,140,.45); }
  .chip.aviso { color: var(--aviso); border-color: rgba(255,176,0,.45); }
  .pastilla {
    appearance: none; font: inherit; cursor: pointer;
    font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
    padding: 8px 14px; border-radius: 999px;
    border: 1px solid var(--linea-media); color: var(--tinta-suave); background: transparent;
  }
  .pastilla:hover { color: var(--tinta); border-color: var(--linea-fuerte); }
  .pastilla[aria-pressed="true"] {
    color: var(--acento); border-color: var(--acento); background: rgba(255,38,56,.08);
  }
  .filtros { display: flex; flex-wrap: wrap; gap: 8px; }

  /* --- números --- */
  .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .num { text-align: right; }
  .pos { color: var(--ok); }
  .neg { color: var(--aviso); }
  .apagado { color: var(--tinta-apagada); }

  /* --- barra 1X2 --- */
  .barra1x2 { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--linea); }
  .barra1x2 i { display: block; height: 100%; }
  .barra1x2 .bl { background: var(--acento); }
  .barra1x2 .be { background: #4C5566; }
  .barra1x2 .bv { background: #2FA8C7; }
  .leyenda1x2 { display: flex; gap: 14px; font-size: 11px; color: var(--tinta-apagada); margin-top: 7px; }
  .leyenda1x2 b { font-weight: 700; }
  .punto { width: 8px; height: 8px; border-radius: 999px; display: inline-block; margin-right: 5px; }

  /* --- tablas --- */
  .tabla { border: 1px solid var(--linea-media); border-radius: var(--r-card); overflow: hidden; background: var(--tarjeta); }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--tinta-apagada); text-align: left;
    padding: 11px 14px; background: var(--tarjeta-interior);
    border-bottom: 1px solid var(--linea-media); white-space: nowrap;
  }
  thead th.num { text-align: right; }
  thead th button {
    appearance: none; background: none; border: 0; font: inherit; color: inherit; cursor: pointer;
    padding: 0; letter-spacing: inherit;
  }
  thead th button:hover { color: var(--tinta); }
  thead th[aria-sort] button { color: var(--tinta); }
  tbody td { padding: 11px 14px; border-bottom: 1px solid var(--linea); font-size: 13px; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr.clicable { cursor: pointer; }
  tbody tr.clicable:hover { background: rgba(255,255,255,.028); }
  tbody tr.total td { background: var(--tarjeta-interior); font-weight: 700; }
  .equipo-celda { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .equipo-celda span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tabla-scroll { overflow-x: auto; }

  /* --- tarjeta de partido --- */
  .partido {
    appearance: none; text-align: left; font: inherit; color: inherit; cursor: pointer; width: 100%;
    background: var(--tarjeta); border: 1px solid var(--linea-media);
    border-radius: var(--r-card); padding: 0; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .partido:hover { border-color: var(--linea-fuerte); }
  .partido-cab {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 12px 16px; border-bottom: 1px solid var(--linea);
    background: var(--tarjeta-interior);
  }
  .partido-cuerpo { padding: 16px; display: grid; gap: 14px; }
  .enfrentamiento { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); align-items: center; gap: 12px; }
  .lado { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .lado.der { justify-content: flex-end; }
  .lado b { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vs { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; color: var(--tinta-apagada); }
  .marcador-real { font-family: var(--mono); font-size: 17px; font-weight: 700; }

  /* --- estados vacíos --- */
  .vacio {
    border: 1px dashed var(--linea-fuerte); border-radius: var(--r-card);
    padding: 34px 24px; text-align: center; background: rgba(255,255,255,.015);
  }
  .vacio-titulo { font-size: 15px; font-weight: 700; }
  .vacio-texto { color: var(--tinta-suave); font-size: 13px; margin-top: 8px; }

  /* --- matriz de marcadores --- */
  .marcador-fila { display: grid; grid-template-columns: 54px minmax(0,1fr) 62px; align-items: center; gap: 12px; margin-bottom: 8px; }
  .marcador-fila:last-child { margin-bottom: 0; }
  .marcador-barra { height: 8px; border-radius: 999px; background: var(--linea); overflow: hidden; }
  .marcador-barra i { display: block; height: 100%; background: var(--acento); }

  /* --- forma --- */
  .forma { display: flex; gap: 5px; }
  .forma i {
    width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center;
    font-family: var(--mono); font-size: 11px; font-weight: 700; font-style: normal;
    border: 1px solid var(--linea-fuerte); color: var(--tinta-media);
  }
  .forma i.g { color: var(--ok); border-color: rgba(25,230,140,.45); background: rgba(25,230,140,.1); }
  .forma i.p { color: var(--aviso); border-color: rgba(255,176,0,.45); background: rgba(255,176,0,.1); }

  /* --- changelog --- */
  .cambio { display: grid; grid-template-columns: 108px 96px minmax(0,1fr); gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--linea); }
  .cambio:last-child { border-bottom: 0; }
  .cambio-titulo { font-weight: 700; }
  .cambio-texto { color: var(--tinta-suave); margin-top: 3px; }

  /* --- lista de método/límites --- */
  ul.puntos { margin: 0; padding-left: 18px; display: grid; gap: 9px; }
  ul.puntos li { color: var(--tinta-suave); }

  footer.pie {
    display: flex; align-items: center; justify-content: space-between; gap: 20px;
    height: 56px; padding: 0 26px; border-top: 1px solid var(--linea);
    font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
    color: var(--tinta-apagada); text-transform: uppercase;
    background: var(--fondo);
  }

  @media print {
    .rail, nav.principal { display: none; }
    .app { grid-template-columns: 1fr; min-width: 0; }
    .vista[hidden] { display: block !important; }
  }
`;
}
