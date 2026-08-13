// Cliente REST mínimo para Supabase (PostgREST), sin el SDK oficial — mismo
// criterio que el resto de datos/: fetch nativo, cero dependencias nuevas.
// Usa la service_role key, que ignora RLS (esto corre en el backend/n8n,
// nunca en un navegador).

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env');
  }
  return { url, key };
}

function cabeceras(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

// seleccionar('fixtures', 'date=eq.2026-08-15&select=id,status')
export async function seleccionar(tabla, query = '') {
  const { url, key } = config();
  const res = await fetch(`${url}/rest/v1/${tabla}?${query}`, { headers: cabeceras(key) });
  if (!res.ok) {
    throw new Error(`Supabase select ${tabla}: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// upsert('api_usage', [{ date: '2026-08-12', requests_used: 5 }], { onConflict: 'date' })
export async function upsert(tabla, filas, { onConflict } = {}) {
  const { url, key } = config();
  const destino = new URL(`${url}/rest/v1/${tabla}`);
  if (onConflict) destino.searchParams.set('on_conflict', onConflict);

  const res = await fetch(destino, {
    method: 'POST',
    headers: { ...cabeceras(key), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(filas),
  });
  if (!res.ok) {
    throw new Error(`Supabase upsert ${tabla}: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}
