'use client';

import AuthGate from './AuthGate';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
