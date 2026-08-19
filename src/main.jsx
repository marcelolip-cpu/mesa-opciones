import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registro del service worker para el modo sin conexión.
// Requiere HTTPS (Vercel/Netlify lo dan incluido); en localhost sin HTTPS
// los navegadores igual lo permiten para desarrollo.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("No se pudo registrar el service worker:", err);
    });
  });
}
