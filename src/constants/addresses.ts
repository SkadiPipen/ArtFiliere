export type AddressOption = {
  code: string;
  name: string;
};

const BASE_URL = 'https://psgc.gitlab.io/api';

// Helper to fetch and normalize PSGC items
async function fetchPsgc(endpoint: string): Promise<AddressOption[]> {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data
      .map((item: any) => ({
        code: item.code,
        name: item.name,
      }))
      .sort((a: AddressOption, b: AddressOption) => a.name.localeCompare(b.name));
  } catch (err) {
    console.warn(`[PSGC Error] Failed fetching ${endpoint}:`, err);
    return [];
  }
}

export async function getRegions(): Promise<AddressOption[]> {
  const regions = await fetchPsgc('/regions/');
  if (regions.length > 0) return regions;

  // Fallback
  return [
    { code: '070000000', name: 'Region VII (Central Visayas)' },
    { code: '130000000', name: 'National Capital Region (NCR)' },
    { code: '080000000', name: 'Region VIII (Eastern Visayas)' },
  ];
}

export async function getProvincesByRegion(regionCode: string): Promise<AddressOption[]> {
  if (!regionCode) return [];
  // NCR has no provinces, only cities/districts directly
  if (regionCode === '130000000' || regionCode === 'NCR') {
    return [{ code: 'NCR_DISTRICTS', name: 'Metro Manila' }];
  }
  return fetchPsgc(`/regions/${regionCode}/provinces/`);
}

export async function getCitiesByProvince(provinceCode: string, regionCode?: string): Promise<AddressOption[]> {
  if (!provinceCode) return [];
  if (provinceCode === 'NCR_DISTRICTS' || regionCode === '130000000') {
    return fetchPsgc('/regions/130000000/cities-municipalities/');
  }
  return fetchPsgc(`/provinces/${provinceCode}/cities-municipalities/`);
}

export async function getBarangaysByCity(cityCode: string): Promise<AddressOption[]> {
  if (!cityCode) return [];
  return fetchPsgc(`/cities-municipalities/${cityCode}/barangays/`);
}

// Checks if the address qualifies for ArtFiliere physical delivery (Cebu area only).

export function isEligibleForDelivery(provinceName: string, cityName?: string): boolean {
  if (!provinceName) return false;
  const p = provinceName.toLowerCase();
  const c = (cityName || '').toLowerCase();
  return p.includes('cebu') || c.includes('cebu') || c.includes('mandaue') || c.includes('lapu-lapu');
}