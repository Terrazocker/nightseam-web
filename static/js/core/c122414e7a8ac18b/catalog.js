/*
 * NightSeam core - catalog identity, type registry and search text (pure).
 *
 * Phase 2, concept 2. Type labels and colors are the WEB canonical palette
 * (owner decision, 0.6.17): the desktop shell adopts them too, so both apps
 * render one type vocabulary. The TYPE KEYS are the exact set the server seeds
 * and `app/catalog_data.py::TYPE_LABELS` validates against.
 */

export const TYPE_LABELS = {
  galaxy: 'Galaxy', open_cluster: 'Open cluster', globular: 'Globular cluster',
  nebula: 'Nebula', planetary: 'Planetary nebula', supernova_remnant: 'Supernova remnant',
  asterism: 'Asterism', star_cloud: 'Star cloud',
};

export const TYPE_COLORS = {
  galaxy: '#ffd166',
  open_cluster: '#7cc4ff',
  globular: '#9be0ff',
  nebula: '#7bf1a8',
  planetary: '#8fe3d9',
  supernova_remnant: '#ff8fa3',
  asterism: '#c9b8ff',
  star_cloud: '#e0e6ff',
};

/** Custom targets are server-created records with the `u_` id prefix
 *  (`app/server.py` creates and deletes them only by that prefix). */
export function isCustomId(id) {
  return typeof id === 'string' && id.startsWith('u_');
}

/** Web search text: id, names, type, constellation, description and distance,
 *  lowercased and space-joined. The desktop searches the server's designation
 *  blob instead (`app/catalog_data.py`); the two models stay per-shell. */
export function searchBlob(o) {
  return [o.id, o.primary_name, o.messier, o.ngcic, o.other, o.otype,
          o.constellation, o.blurb, o.distance]
    .filter(Boolean).join(' ').toLowerCase();
}
