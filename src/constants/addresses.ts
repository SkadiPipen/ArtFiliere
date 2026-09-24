// TODO: This is static placeholder data so the Address step is usable during
// development. Replace with a call to the PSGC API (https://psgc.gitlab.io/api/)
// or a Django endpoint that mirrors it once the backend supports address lookup.

export type AddressOption = {
  code: string;
  name: string;
};

export const REGIONS: AddressOption[] = [
  { code: "R08", name: "Eastern Visayas" },
  { code: "R07", name: "Central Visayas" },
  { code: "NCR", name: "National Capital Region" },
];

export const PROVINCES_BY_REGION: Record<string, AddressOption[]> = {
  R08: [
    { code: "P0801", name: "Northern Samar" },
    { code: "P0802", name: "Leyte" },
  ],
  R07: [
    { code: "P0701", name: "Cebu" },
    { code: "P0702", name: "Bohol" },
  ],
  NCR: [{ code: "PNCR", name: "Metro Manila" }],
};

export const CITIES_BY_PROVINCE: Record<string, AddressOption[]> = {
  P0801: [
    { code: "C080101", name: "Catarman" },
    { code: "C080102", name: "Bobon" },
  ],
  P0802: [
    { code: "C080201", name: "Tacloban City" },
    { code: "C080202", name: "Ormoc City" },
  ],
  P0701: [
    { code: "C070101", name: "Cebu City" },
    { code: "C070102", name: "Mandaue City" },
  ],
  P0702: [{ code: "C070201", name: "Tagbilaran City" }],
  PNCR: [
    { code: "C0NCR01", name: "Quezon City" },
    { code: "C0NCR02", name: "Manila" },
  ],
};

export const BARANGAYS_BY_CITY: Record<string, AddressOption[]> = {
  C080101: [
    { code: "B01", name: "Aguada" },
    { code: "B02", name: "Bagong Lipunan" },
    { code: "B03", name: "Poblacion" },
  ],
};

// Any city not listed above falls back to this placeholder list so the
// dropdown always has something selectable during development.
export const DEFAULT_BARANGAYS: AddressOption[] = [
  { code: "BDEF01", name: "Barangay 1" },
  { code: "BDEF02", name: "Barangay 2" },
];
