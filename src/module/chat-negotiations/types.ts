export type LicenseType = 'personal' | 'commercial';
export type ExclusivityType = 'non-exclusive' | 'exclusive' | 'sole';

export interface Artwork {
  id: string | number;
  title: string;
  artist_name?: string;
  art_type: 'digital' | 'physical';
  base_price: number;
  image_base64?: string;
  image_url?: string;
  license_types?: LicenseType[];
  exclusivity_types?: ExclusivityType[];
}
