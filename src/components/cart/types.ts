export interface CartItem {
  id: string;
  artistName: string;
  title: string;
  price: string;
  type: string;
  image: string;
  quantity: number;
}

export type FilterType = 'All' | 'Direct Sell' | 'Auction' | 'Commission';