export type LicenseType = 'personal' | 'commercial';
export type ExclusivityType = 'non-exclusive' | 'exclusive' | 'sole';

export interface Artwork {
  royalty_enabled?: boolean;
  id: string | number;
  title: string;
  artist_name?: string;
  art_type: 'digital' | 'physical';
  physical_format?: 'original' | 'print' | 'limited_edition';
  base_price: number;
  image_base64?: string;
  image_url?: string;
  license_types?: LicenseType[];
  exclusivity_types?: ExclusivityType[];
}
