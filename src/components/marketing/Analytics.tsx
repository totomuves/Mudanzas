"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { isStaffPath, tracking } from "@/lib/marketing/config";
import { trackPageView } from "@/lib/marketing/track";
import { hasConsent, subscribeConsent } from "@/lib/marketing/consent";

/**
 * Carga Google Analytics / Google Ads, Meta Pixel y TikTok Pixel solo si sus
 * IDs están en las variables de entorno y el visitante aceptó las cookies
 * (ver CookieBanner). No mide las secciones del equipo (admin, vendedor, reparto).
 */
export function Analytics() {
  const pathname = usePathname();
  const first = useRef(true);
  const { gaId, googleAdsId, metaPixelId, tiktokPixelId } = tracking;
  const googleId = gaId || googleAdsId;
  const staff = isStaffPath(pathname);
  const allowed = useSyncExternalStore(subscribeConsent, hasConsent, () => false);

  // Cambios de página dentro de la app (la primera la cuentan los scripts al cargar)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!staff) trackPageView();
  }, [pathname, staff]);

  if (staff || !allowed) return null;

  return (
    <>
      {googleId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${googleId}`} strategy="afterInteractive" />
          <Script id="mk-google" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;` +
              // Consent Mode v2: todo parte negado y se habilita porque el visitante aceptó
              `gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});` +
              `gtag('consent','update',{ad_storage:'granted',analytics_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});` +
              `gtag('js',new Date());` +
              (gaId ? `gtag('config','${gaId}');` : "") +
              (googleAdsId ? `gtag('config','${googleAdsId}');` : "")}
          </Script>
        </>
      )}
      {metaPixelId && (
        <Script id="mk-meta" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/es_LA/fbevents.js');fbq('consent','grant');fbq('init','${metaPixelId}');fbq('track','PageView');`}
        </Script>
      )}
      {tiktokPixelId && (
        <Script id="mk-tiktok" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript";n.async=!0;n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};ttq.load('${tiktokPixelId}');ttq.page();}(window,document,'ttq');`}
        </Script>
      )}
    </>
  );
}
