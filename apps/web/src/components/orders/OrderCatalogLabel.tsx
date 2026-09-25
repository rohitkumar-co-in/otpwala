import { useEffect, useState } from 'react';
import { getCountries, getServices } from '../../lib/api';

type CatalogEntry = { code?: string; name?: string; iso?: string; iconUrl?: string; flagUrl?: string };
type CatalogData = { services: CatalogEntry[]; countries: CatalogEntry[] };

let catalogPromise: Promise<CatalogData> | null = null;

function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = Promise.all([getServices(), getCountries()])
      .then(([services, countries]) => ({ services, countries }))
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

function normalize(value: unknown) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export default function OrderCatalogLabel({
  kind,
  name,
  code,
}: {
  kind: 'service' | 'country';
  name?: string | null;
  code?: string | number | null;
}) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);

  useEffect(() => {
    let active = true;
    loadCatalog().then((data) => {
      if (active) setCatalog(data);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const entries = kind === 'service' ? catalog?.services : catalog?.countries;
  const normalizedName = normalize(name);
  const normalizedCode = normalize(code);
  const entry = entries?.find((item) => kind === 'service' && normalizedCode && normalize(item.code) === normalizedCode)
    || entries?.find((item) => normalizedName && normalize(item.name) === normalizedName);
  const iconUrl = kind === 'service' ? entry?.iconUrl : entry?.flagUrl;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, maxWidth: '100%' }}>
      {iconUrl && (
        <img
          src={iconUrl}
          alt=""
          aria-hidden="true"
          width={22}
          height={22}
          loading="lazy"
          style={{ width: 22, height: 22, flex: '0 0 22px', objectFit: 'contain', borderRadius: '50%' }}
        />
      )}
      <span style={{ minWidth: 0 }}>{name || (kind === 'service' ? 'Unknown service' : 'Unknown country')}</span>
    </span>
  );
}
