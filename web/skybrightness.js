/* Provider-aware local sky-brightness loader for the web shell.
 *
 * EOG and NASA use the same compact binary wire format but different physics.
 * The manifest therefore selects an explicit core model and every result keeps
 * its sidecar provenance. Optional providers fall back to EOG only when their
 * own pack cannot be loaded; they are never decoded through EOG's calibration.
 */

import {
  decodeSkyBrightnessPack, estimateSkyBrightnessFromGrid,
  SKY_BRIGHTNESS_DEFAULT_PROVIDER, SKY_BRIGHTNESS_PROVIDER_EOG,
  SKY_BRIGHTNESS_PROVIDER_BLACK_MARBLE,
} from './core.js?v=42';

const MANIFEST_URL = 'skybrightness.providers.json';
const EOG_ENTRY = Object.freeze({
  id: SKY_BRIGHTNESS_PROVIDER_EOG, label: 'EOG / VIIRS',
  coreProvider: SKY_BRIGHTNESS_PROVIDER_EOG, model: 'eog-zenith-v1',
  modelVersion: '1.0.0', packUrl: 'skybrightness.eog.bin',
  metadataUrl: 'skybrightness.eog.bin.json', enabled: true,
  sourceYear: '2025', sourceSDS: 'average_masked', resolutionArcsec: 15,
  effectiveResolutionM: null,
});
let _manifestPromise = null;
const _packPromises = new Map();

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
function safeUrl(value, fallback) {
  const text = String(value || fallback || '');
  return !text || /^(?:javascript|data|blob):/i.test(text) ? null : text;
}
function normalizeEntry(raw) {
  if (!plainObject(raw)) return null;
  const id = String(raw.id || '').trim().toLowerCase();
  const coreProvider = String(raw.coreProvider || id).trim().toLowerCase();
  if (!id || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(id) ||
      ![SKY_BRIGHTNESS_PROVIDER_EOG,
        SKY_BRIGHTNESS_PROVIDER_BLACK_MARBLE].includes(coreProvider)) return null;
  const model = String(raw.model || (coreProvider === 'eog'
    ? 'eog-zenith-v1' : 'blackmarble-zenith-v1'));
  if (!['eog-zenith-v1', 'blackmarble-zenith-v1'].includes(model)) return null;
  return {
    id, label: String(raw.label || id).slice(0, 80), coreProvider, model,
    modelVersion: String(raw.modelVersion || '1.0.0').slice(0, 32),
    sourceYear: raw.sourceYear == null ? null : String(raw.sourceYear).slice(0, 16),
    sourceSDS: String(raw.sourceSDS || '').slice(0, 80),
    resolutionArcsec: raw.resolutionArcsec == null ? null : Number(raw.resolutionArcsec),
    effectiveResolutionM: raw.effectiveResolutionM == null ? null : Number(raw.effectiveResolutionM),
    packUrl: safeUrl(raw.packUrl, `${id}.bin`),
    metadataUrl: safeUrl(raw.metadataUrl, `${id}.bin.json`),
    enabled: raw.enabled !== false,
    notes: String(raw.notes || '').slice(0, 240),
  };
}
function normalizeManifest(raw) {
  const entries = plainObject(raw) && Array.isArray(raw.providers)
    ? raw.providers.map(normalizeEntry).filter(Boolean) : [];
  const eog = entries.find((entry) => entry.coreProvider === 'eog') || EOG_ENTRY;
  const byId = new Map([[eog.id, eog]]);
  for (const entry of entries) {
    if (entry.id !== eog.id && entry.enabled) byId.set(entry.id, entry);
  }
  const requested = String(plainObject(raw) ? raw.defaultProvider || '' : '')
    .toLowerCase();
  return {
    format: 'nightseam-skybrightness-providers', formatVersion: 1,
    defaultProvider: byId.has(requested) ? requested : eog.id,
    providers: [...byId.values()],
  };
}
export async function loadSkyBrightnessProviderManifest(url = MANIFEST_URL) {
  if (_manifestPromise && url === MANIFEST_URL) return _manifestPromise;
  const request = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`provider manifest ${res.status}`);
    return res.json();
  }).then(normalizeManifest).catch(() => normalizeManifest(null));
  if (url === MANIFEST_URL) _manifestPromise = request;
  return request;
}
export async function listSkyBrightnessProviders() {
  const manifest = await loadSkyBrightnessProviderManifest();
  return manifest.providers.map((entry) => ({ ...entry }));
}
function metadataFallback(entry) {
  return { format: 'nightseam-skybrightness', formatVersion: 1,
    model: entry.model, modelVersion: entry.modelVersion,
    provider: entry.id, source: entry.label };
}
async function loadProviderPack(entry, urlOverride = null) {
  const packUrl = safeUrl(urlOverride, entry.packUrl);
  if (!packUrl) return null;
  // The in-memory cache must not reuse a pack when its declared model/source
  // identity changes but the asset URL stays stable.
  const key = [entry.id, entry.model, entry.modelVersion, entry.sourceYear,
    entry.sourceSDS, entry.resolutionArcsec, entry.effectiveResolutionM,
    packUrl, entry.metadataUrl].join('|');
  if (_packPromises.has(key)) return _packPromises.get(key);
  const promise = fetch(packUrl).then((res) => {
    if (!res.ok) throw new Error(`sky-brightness pack ${res.status}`);
    return res.arrayBuffer();
  }).then((buffer) => decodeSkyBrightnessPack(buffer)).then(async (grid) => {
    let metadata = metadataFallback(entry);
    if (entry.metadataUrl) {
      try {
        const res = await fetch(entry.metadataUrl);
        if (res.ok) metadata = { ...metadata, ...(await res.json()) };
      } catch { /* manifest metadata remains the safe fallback */ }
    }
    if (metadata.model !== entry.model ||
        String(metadata.modelVersion || entry.modelVersion) !== entry.modelVersion ||
        (entry.sourceYear != null && metadata.sourceYear != null &&
         String(metadata.sourceYear) !== String(entry.sourceYear)) ||
        (entry.sourceSDS && metadata.sourceSDS && metadata.sourceSDS !== entry.sourceSDS) ||
        (entry.resolutionArcsec != null && metadata.nativeResolutionArcsec != null &&
         Number(metadata.nativeResolutionArcsec) !== Number(entry.resolutionArcsec))) {
      throw new Error('provider metadata identity mismatch');
    }
    return { grid, metadata };
  }).catch(() => null);
  _packPromises.set(key, promise);
  return promise;
}
function decorate(result, entry, metadata, requestedProvider, fallbackReason) {
  return { ...result, provider: entry.id, providerLabel: entry.label,
    requestedProvider, fallbackReason: fallbackReason || null,
    source: metadata.source || entry.label, sourceYear: metadata.sourceYear ?? null,
    sourceSDS: metadata.sourceSDS || null,
    effectiveResolutionM: metadata.effectiveResolutionM ?? null,
    sourceQuality: metadata.qualityPolicy || null, metadata };
}
export async function estimateSiteZenithSkyBrightness(lat, lon, options = {}) {
  const manifest = await loadSkyBrightnessProviderManifest();
  const requested = String(options.provider || manifest.defaultProvider || 'eog')
    .toLowerCase();
  const selected = manifest.providers.find((entry) => entry.id === requested) ||
    manifest.providers.find((entry) => entry.id === manifest.defaultProvider) || EOG_ENTRY;
  let loaded = await loadProviderPack(selected,
    selected.id === 'eog' ? options.url || null : null);
  let entry = selected;
  let fallbackReason = null;
  if (!loaded && selected.id !== SKY_BRIGHTNESS_PROVIDER_EOG) {
    entry = manifest.providers.find((candidate) => candidate.id === 'eog') || EOG_ENTRY;
    loaded = await loadProviderPack(entry);
    fallbackReason = 'selected-provider-unavailable';
  }
  if (!loaded) return null;
  const result = estimateSkyBrightnessFromGrid(
    loaded.grid, lat, lon, entry.coreProvider, options);
  if (result.model !== entry.model && result.available) {
    return decorate({ ...result, available: false,
      reason: 'provider-model-mismatch', zenithMpsas: null, quality: 'unknown' },
      entry, loaded.metadata, requested, 'provider-model-mismatch');
  }
  return decorate(result, entry, loaded.metadata, requested, fallbackReason);
}
export function resetSkyBrightnessPack() {
  _manifestPromise = null;
  _packPromises.clear();
}
