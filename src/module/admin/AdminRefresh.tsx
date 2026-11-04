import { createContext, useContext, useEffect, useRef } from 'react';

type Refresh = () => void | Promise<unknown>;
export const AdminRefreshContext = createContext<((refresh: Refresh) => () => void) | null>(null);

// Register the current screen's loaders without resetting forms or expanded cards.
export function useAdminRefresh(refresh: Refresh) {
  const register = useContext(AdminRefreshContext);
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => register?.(() => latest.current()), [register]);
  return !!register;
}
