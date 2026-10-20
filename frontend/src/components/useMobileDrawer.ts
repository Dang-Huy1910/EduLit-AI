'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * Open state of the phone navigation drawer. It closes on Escape, on navigation and when the
 * screen grows into the desktop layout, and the page behind it does not scroll while it is open.
 */
export function useMobileDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onLayoutChange = () => {
      if (desktop.matches) setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    desktop.addEventListener('change', onLayoutChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      desktop.removeEventListener('change', onLayoutChange);
    };
  }, [open]);

  return [open, setOpen] as const;
}
