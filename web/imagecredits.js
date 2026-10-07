/* Photo provenance stays with the displayed/cached bytes. External metadata is
 * optional and never inserted as HTML or used to guess missing licence facts. */
export function metadataText(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi,
    (_, decimal, hex, named) => {
      if (decimal || hex) {
        const code = parseInt(decimal || hex, hex ? 16 : 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
      }
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[named.toLowerCase()];
    }).replace(/\s+/g, ' ').trim();
}

export function wikimediaCredit(source) {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/wikipedia\/(commons|en)\/(?:thumb\/)?[\da-f]\/[\da-f]{2}\/([^/]+)/i);
    if (!match) return null;
    const file = decodeURIComponent(match[2]);
    const site = match[1] === 'commons' ? 'https://commons.wikimedia.org' : 'https://en.wikipedia.org';
    return { source: url.href, file, source_url: site + '/wiki/File:' + encodeURIComponent(file),
      author: '', license: '', license_url: '', status: 'file-page' };
  } catch { return null; }
}

export async function wikiImageCredit(source, { fetcher = fetch, signal } = {}) {
  const credit = wikimediaCredit(source);
  if (!credit) return null;
  try {
    const query = new URLSearchParams({ action: 'query', format: 'json', origin: '*', prop: 'imageinfo',
      iiprop: 'url|extmetadata', titles: 'File:' + credit.file });
    const response = await fetcher('https://en.wikipedia.org/w/api.php?' + query, { signal });
    if (!response.ok) return credit;
    const result = await response.json();
    const page = Object.values(result.query?.pages || {}).find((item) => item.imageinfo?.length);
    const info = page?.imageinfo?.[0];
    if (!info) return credit;
    const metadata = info.extmetadata || {};
    credit.author = metadataText(metadata.Artist?.value);
    credit.license = metadataText(metadata.LicenseShortName?.value);
    const licenseUrl = metadataText(metadata.LicenseUrl?.value);
    if (/^https:\/\//i.test(licenseUrl)) credit.license_url = licenseUrl;
    // Keep the exact file derived from the downloaded URL as the authority;
    // a metadata response never substitutes a different object's photograph.
    credit.status = credit.author && credit.license ? 'metadata' : 'file-page';
  } catch { /* network/metadata failure does not turn a photo into a failure */ }
  return credit;
}

export function renderImageCredit(element, credit) {
  if (!element?.isConnected) return;
  element.hidden = false;
  element.replaceChildren();
  const summary = document.createElement('span');
  summary.textContent = credit?.author ? 'Photo: ' + credit.author : 'Photo attribution unavailable';
  if (credit?.license) summary.textContent += ' · ' + credit.license;
  element.append(summary);
  if (credit?.source_url) {
    let url;
    try { url = new URL(credit.source_url); } catch { return; }
    if (url.protocol !== 'https:' || !['commons.wikimedia.org', 'en.wikipedia.org'].includes(url.hostname)) return;
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank'; link.rel = 'noopener';
    link.textContent = 'Image file, author and license ↗';
    element.append(document.createTextNode(' · '), link);
  }
}
