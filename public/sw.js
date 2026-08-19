// Service worker de Mesa · Taller de opciones
// Estrategia: cache-first para el shell de la app, con actualización en
// segundo plano. Sin backend, sin datos remotos que cachear: la bitácora
// vive en localStorage, no acá.

const VERSION = "mesa-v1";
const RAIZ = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icono-192.png",
  "/icono-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(RAIZ))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(
        claves
          .filter((clave) => clave !== VERSION)
          .map((clave) => caches.delete(clave))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  // Solo GET; el resto (si algún día hay red) pasa directo.
  if (evento.request.method !== "GET") return;

  evento.respondWith(
    caches.match(evento.request).then((enCache) => {
      const redFetch = fetch(evento.request)
        .then((respuesta) => {
          // Actualiza el cache en segundo plano con la versión fresca.
          if (respuesta && respuesta.status === 200) {
            const copia = respuesta.clone();
            caches.open(VERSION).then((cache) => cache.put(evento.request, copia));
          }
          return respuesta;
        })
        .catch(() => enCache); // sin red: lo que haya en cache, si hay

      // Si está en cache, responde al toque y deja que la red actualice atrás.
      // Si no está, espera la red (y cae al catch si tampoco hay red).
      return enCache || redFetch;
    })
  );
});
