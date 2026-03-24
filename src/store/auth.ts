import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TenantInfo {
  id: string;
  name: string;
  industry: string;
  size: string;
  location: string;
}

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  tenantInfo: TenantInfo | null;
  isAdmin: boolean;
  mfaEnabled: boolean;

  // Actions
  setUserId: (id: string) => void;
  setTenantId: (id: string) => void;
  setTenantInfo: (info: TenantInfo) => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setMfaEnabled: (enabled: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      tenantId: null,
      tenantInfo: null,
      isAdmin: false,
      mfaEnabled: false,

      setUserId: (id) =>
        set({ userId: id }),

      setTenantId: (id) =>
        set({ tenantId: id }),

      setTenantInfo: (info) =>
        set({ tenantInfo: info }),

      setIsAdmin: (isAdmin) =>
        set({ isAdmin }),

      setMfaEnabled: (enabled) =>
        set({ mfaEnabled: enabled }),

      logout: () =>
        set({
          userId: null,
          tenantId: null,
          tenantInfo: null,
          isAdmin: false,
          mfaEnabled: false,
        }),
    }),
    {
      name: "auth-store",
      version: 1,
    }
  )
);
