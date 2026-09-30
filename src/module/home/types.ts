export interface ArtItem {
  id: string;
  artist: string;
  price: string;
  type: string;
  artType?: 'digital' | 'physical';
  image: string;
  time?: string;
  artistId?: string;
  artistName?: string;
  is_sold?: boolean;
}

export interface ArtistItem {
  id: string;
  name: string;
  rate: string;
  rating: number;
  avatar: string;
}

export const CATEGORIES = ['All', 'Digital', 'Physical', 'Paintings', 'Sketches', 'Trending'];

export const HERO_DATA = [
  { id: 'h1', badge: 'POPULAR', title: 'SUNSET VIBES', img: 'https://picsum.photos/seed/h1/800/400' },
  { id: 'h2', badge: 'TOP ARTIST', title: 'ARTIST_KURO', img: 'https://picsum.photos/seed/h2/800/400' },
  { id: 'h3', badge: 'AUCTION', title: 'GOLDEN ERA', img: 'https://picsum.photos/seed/h3/800/400' },
  { id: 'h4', badge: 'SYSTEM', title: 'UPDATE 2.0', img: 'https://picsum.photos/seed/h4/800/400' },
];

export const LATEST_DATA: ArtItem[] = Array.from({ length: 10 }).map((_, i) => ({
  id: `l${i}`,
  artist: `Artwork ${i + 1}`,
  price: '1,500.00',
  type: i % 2 === 0 ? 'Digital' : 'Physical',
  image: `https://picsum.photos/seed/l${i}/300/400`,
}));

export const ARTIST_DATA: ArtistItem[] = Array.from({ length: 5 }).map((_, i) => ({
  id: `c${i}`,
  name: `Artist_${i + 1}`,
  rate: '230.00',
  rating: 5,
  avatar: `https://i.pravatar.cc/150?u=${i}`,
}));

export const AUCTION_DATA: ArtItem[] = [
  { id: 'a1', artist: 'Kuro_04', price: '5,000.00', type: 'Physical', image: 'https://picsum.photos/seed/a1/300/400', time: '02:14:30' },
  { id: 'a2', artist: 'Zenith', price: '7,200.00', type: 'Digital', image: 'https://picsum.photos/seed/a2/300/400', time: '05:45:10' },
];

export const FOR_YOU_DATA: ArtItem[] = Array.from({ length: 10 }).map((_, i) => ({
  id: `f${i}`,
  artist: `Rec ${i + 1}`,
  price: '1,500.00',
  type: i % 3 === 0 ? 'Paintings' : 'Physical',
  image: `https://picsum.photos/seed/f${i}/300/300`,
}));
