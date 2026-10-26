import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  hasHydrated: boolean;

  login: (user: AuthUser, accessToken: string) => void;

  logout: () => void;

  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      hasHydrated: false,

      login: (user, accessToken) => {
        set({
          user,
          accessToken,
        });
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
        });
      },

      setHasHydrated: (value) => {
        set({
          hasHydrated: value,
        });
      },
    }),
    {
      name: 'auth-storage',

      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
