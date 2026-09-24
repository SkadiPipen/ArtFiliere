import { CartItem } from '@/module/cart/types';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { onAuthStateChanged } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

interface CartContextType {
  cartItems: CartItem[];
  loading: boolean;
  error: string;
  refreshCart: () => Promise<void>;
  addToCart: (item: Omit<CartItem, 'id' | 'quantity'>) => Promise<void>;
  removeFromCart: (id: string) => Promise<void>;
  updateQuantity: (id: string, newQty: number) => Promise<void>;
}
const CartContext = createContext<CartContextType | undefined>(undefined);
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const sequence = useRef(0);
  const request = async (path = '', method = 'GET', body?: object) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Please log in to use your cart.');
    const epoch = generation.current;
    const order = ++sequence.current;
    const response = await fetch(`${API_URL}/api/cart/${path}`, {
      method, headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`Cart API returned HTTP ${response.status}. Check that Django is running with the cart migration applied.`); }
    if (!response.ok) throw new Error(data.error || data.detail || 'Unable to update cart.');
    if (generation.current === epoch && auth.currentUser?.uid === user.uid && order === sequence.current) {
      setCartItems(data.items); setError('');
    }
  };
  const refreshCart = async () => {
    if (!auth.currentUser) return;
    try { await request(); } catch (e: any) { setError(e.message); }
  };
  useEffect(() => onAuthStateChanged(auth, async user => {
    const epoch = ++generation.current;
    setCartItems([]); setError(''); setLoading(!!user);
    if (user) {
      try { await request(); } catch (e: any) { if (epoch === generation.current) setError(e.message); }
      finally { if (epoch === generation.current) setLoading(false); }
    }
  }), []);
  const addToCart = async (item: Omit<CartItem, 'id' | 'quantity'>) => {
    if (!/^[1-9]\d*$/.test(item.artworkId)) throw new Error('Only published artworks can be saved to your cart.');
    await request('', 'POST', { listing_id: Number(item.artworkId), quantity: 1 });
  };
  const removeFromCart = (id: string) => request(`items/${id}/`, 'DELETE');
  const updateQuantity = (id: string, qty: number) => qty < 1 ? removeFromCart(id) : request(`items/${id}/`, 'PATCH', { quantity: qty });
  return <CartContext.Provider value={{ cartItems, loading, error, refreshCart, addToCart, removeFromCart, updateQuantity }}>{children}</CartContext.Provider>;
}
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}