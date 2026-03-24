import { useState } from "react";
import AppCouleur from "./AppCouleur";
import CIELABExplorer from "./CIELABExplorer";

const APPS = [
  {
    id: "couleur",
    label: "Diagramme CIE xy",
    description: "Plan chromatique CIE 1931, illuminants, ellipses MacAdam",
  },
  {
    id: "cielab",
    label: "Explorateur CIELAB",
    description: "Plan a*b*, points L*, ΔE*₇₆, coordonnées C*/h°",
  },
];

export default function App() {
  const [active, setActive] = useState(null);

  if (active) return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setActive(null)}
        style={{
          position: "fixed", top: 12, left: 12, zIndex: 9999,
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 11, fontWeight: 700, padding: "5px 11px",
          border: "1px solid var(--color-border-secondary, #ddd)",
          borderRadius: 8, cursor: "pointer",
          background: "var(--color-background-primary, #fff)",
          color: "var(--color-text-secondary, #666)",
          boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
        }}
      >
        ← Menu
      </button>
      {active === "couleur" && <AppCouleur />}
      {active === "cielab" && <CIELABExplorer />}
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      background: "var(--color-background-primary, #fff)",
      fontFamily: "var(--font-sans, system-ui, sans-serif)",
      padding: "2rem",
      paddingTop: "3rem",
    }}>
      <h1 style={{
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: ".04em",
        color: "var(--color-text-primary, #111)",
        marginBottom: 8,
      }}>
        Outils couleur
      </h1>
      <p style={{
        fontSize: 13,
        color: "var(--color-text-secondary, #666)",
        marginBottom: 40,
      }}>
        Choisissez une application
      </p>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
        {APPS.map(app => (
          <button
            key={app.id}
            onClick={() => setActive(app.id)}
            style={{
              width: 220,
              padding: "28px 24px",
              border: "1px solid var(--color-border-secondary, #ddd)",
              borderRadius: 14,
              background: "var(--color-background-secondary, #f8f8f8)",
              cursor: "pointer",
              textAlign: "left",
              transition: "box-shadow .15s, border-color .15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = "0 4px 18px rgba(0,0,0,0.10)";
              e.currentTarget.style.borderColor = "var(--color-text-primary, #333)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.borderColor = "var(--color-border-secondary, #ddd)";
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary, #111)", marginBottom: 8 }}>
              {app.label}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary, #666)", lineHeight: 1.6 }}>
              {app.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
