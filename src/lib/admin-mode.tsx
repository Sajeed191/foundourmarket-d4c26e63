import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "fom_admin_mode";

type Ctx = {
  /** Whether the global admin edit overlay is active. */
  adminMode: boolean;
  toggle: () => void;
  setAdminMode: (v: boolean) => void;
};

const AdminModeContext = createContext<Ctx | null>(null);

/**
 * Global "Admin Mode" switch. When active (and the user is staff), product
 * cards and product pages reveal inline quick-edit controls site-wide. The
 * flag is a pure UX surface — every mutation is still validated server-side,
 * so a tampered localStorage value grants no access.
 */
export function AdminModeProvider({ children }: { children: ReactNode }) {
  const [adminMode, setAdminModeState] = useState(false);

  useEffect(() => {
    try {
      setAdminModeState(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const setAdminMode = useCallback((v: boolean) => {
    setAdminModeState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => setAdminMode(!adminMode), [adminMode, setAdminMode]);

  return (
    <AdminModeContext.Provider value={{ adminMode, toggle, setAdminMode }}>
      {children}
    </AdminModeContext.Provider>
  );
}

export function useAdminMode() {
  const ctx = useContext(AdminModeContext);
  if (!ctx) throw new Error("useAdminMode must be used inside AdminModeProvider");
  return ctx;
}
