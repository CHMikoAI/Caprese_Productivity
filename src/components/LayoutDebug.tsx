"use client";

import { useEffect, useState } from "react";

/**
 * TEMPORARY diagnostic overlay. Prints the height values and safe-area insets
 * iOS actually reports inside the installed PWA — the numbers I can't see from
 * my side — so the bottom-bar dead space can be fixed from real data, not a
 * guess. Remove once the layout is settled.
 */
export default function LayoutDebug() {
  const [info, setInfo] = useState("measuring…");

  useEffect(() => {
    const probe = (val: string) => {
      const el = document.createElement("div");
      el.style.cssText = `position:absolute;left:-9999px;top:0;width:1px;height:${val};`;
      document.body.appendChild(el);
      const h = Math.round(el.getBoundingClientRect().height);
      el.remove();
      return h;
    };

    const read = () => {
      const nav = document.querySelector('nav[aria-label="Primary"]');
      const r = nav?.getBoundingClientRect();
      const nv = navigator as Navigator & { standalone?: boolean };
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        nv.standalone === true;
      const lines = [
        `standalone: ${standalone}`,
        `screen.h:   ${window.screen.height}`,
        `innerH:     ${window.innerHeight}`,
        `docClientH: ${document.documentElement.clientHeight}`,
        `visualVP.h: ${Math.round(window.visualViewport?.height ?? 0)}`,
        `100vh:      ${probe("100vh")}`,
        `100dvh:     ${probe("100dvh")}`,
        `100svh:     ${probe("100svh")}`,
        `100lvh:     ${probe("100lvh")}`,
        `fillAvail:  ${probe("-webkit-fill-available")}`,
        `safeBottom: ${probe("env(safe-area-inset-bottom)")}`,
        `safeTop:    ${probe("env(safe-area-inset-top)")}`,
        `navTop:     ${r ? Math.round(r.top) : "?"}`,
        `navBottom:  ${r ? Math.round(r.bottom) : "?"}`,
        `belowNav:   ${r ? Math.round(window.innerHeight - r.bottom) : "?"}`,
      ];
      setInfo(lines.join("\n"));
    };

    read();
    const t = window.setTimeout(read, 600);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <pre
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top)",
        left: 0,
        zIndex: 99999,
        margin: 0,
        padding: "6px 8px",
        background: "rgba(230,57,70,0.97)",
        color: "#fff",
        font: "12px/1.35 ui-monospace, monospace",
        whiteSpace: "pre",
        pointerEvents: "none",
        borderBottomRightRadius: 8,
      }}
    >
      {info}
    </pre>
  );
}
