'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

interface ClientOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

function subscribe() {
  return () => {};
}

function getServerSnapshot() {
  return false;
}

function getClientSnapshot() {
  return true;
}

export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  if (!mounted) {
    return fallback;
  }

  return children;
}
