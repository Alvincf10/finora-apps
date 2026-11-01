"use client";

import { useEffect, useState } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";
import { I18nProvider } from "@/components/i18n-provider";
import { Toaster } from "@/components/ui/sonner";
import { api } from "@/lib/client-api";

function ClientToaster() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return (
    <Toaster
      richColors
      position="top-center"
      offset={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
    />
  );
}

function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari Add to Home Screen
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

    // Skip in plain browser during `next dev` so HMR stays predictable.
    // Always register in production, or when already launched as home-screen PWA.
    if (process.env.NODE_ENV !== "production" && !isStandalone) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* non-fatal */
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <SWRConfig
        value={{
          fetcher: (path: string) => api(path),
          revalidateOnFocus: false,
          dedupingInterval: 8_000,
          keepPreviousData: true,
          errorRetryCount: 2,
        }}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <I18nProvider>
            {children}
            <ClientToaster />
            <ServiceWorkerRegister />
          </I18nProvider>
        </ThemeProvider>
      </SWRConfig>
    </SessionProvider>
  );
}
