/* ================================================================== */
/*  MOTOR DE CÁLCULO                                                   */
/*  Sin React, sin JSX. Estrategias, niveles, contenido pedagógico,    */
/*  payoff al vencimiento, Black-Scholes y formateo numérico.          */
/*  Se separa de la UI para poder testearlo de forma aislada.          */
/* ================================================================== */

/* ================================================================== */
/*  DATOS COMPARTIDOS                                                  */
/* ================================================================== */

const mkLeg = (kind, dir, strike, prima, qty = 1) => ({
  id: Math.random().toString(36).slice(2, 9), kind, dir, strike, prima, qty,
});
const redondear = (x) => Math.round(x * 2) / 2;

const ESTRATEGIAS = {
  csp: {
    nombre: "Put vendida (CSP)", sesgo: "alcista", vol: "alta", riesgo: "definido",
    corto: "Cobrás prima y te comprometés a comprar en el strike.",
    explico: "Vendés el derecho a que alguien te venda las acciones a un precio fijo. Te pagan por esperar. Si el precio no baja de ese strike, te quedás la prima entera.",
    cuando: "Querés el papel, pero más barato. La prima te paga por poner el límite.",
    legs: (s) => [mkLeg("put", -1, redondear(s * 0.94), 1.2)],
  },
  cc: {
    nombre: "Call cubierta", sesgo: "lateral", vol: "alta", riesgo: "definido",
    corto: "Acciones en cartera + call vendida. Prima a cambio de un techo.",
    explico: "Ya tenés las acciones. Vendés el derecho a que te las compren más caras. Cobrás prima; a cambio, si sube mucho, te las llevan.",
    cuando: "Tenés el papel y no esperás una suba explosiva en el corto plazo.",
    legs: (s) => [mkLeg("stock", 1, s, 0), mkLeg("call", -1, redondear(s * 1.06), 1.1)],
  },
  longCall: {
    nombre: "Call comprada", sesgo: "alcista", vol: "baja", riesgo: "definido",
    corto: "Apuesta alcista. Lo máximo que perdés es la prima.",
    explico: "Pagás por el derecho a comprar barato más adelante. Si sube fuerte, ganás mucho con poco capital.",
    cuando: "Esperás un movimiento fuerte y la volatilidad está barata.",
    legs: (s) => [mkLeg("call", 1, redondear(s * 1.02), 1.85)],
  },
  longPut: {
    nombre: "Put comprada", sesgo: "bajista", vol: "baja", riesgo: "definido",
    corto: "Seguro contra caídas, o apuesta bajista.",
    explico: "Pagás por el derecho a vender caro más adelante. Funciona como un seguro.",
    cuando: "Querés proteger una cartera o apostar a una caída con riesgo acotado.",
    legs: (s) => [mkLeg("put", 1, redondear(s * 0.98), 1.75)],
  },
  collar: {
    nombre: "Collar", sesgo: "lateral", vol: "baja", riesgo: "definido",
    corto: "Acciones + put comprada + call vendida. Piso y techo.",
    explico: "La prima de la call vendida paga la put que te protege. Encajonás el resultado.",
    cuando: "Tenés una posición con ganancia y querés protegerla sin venderla.",
    legs: (s) => [mkLeg("stock", 1, s, 0), mkLeg("put", 1, redondear(s * 0.92), 1.0), mkLeg("call", -1, redondear(s * 1.08), 0.95)],
  },
  bullPut: {
    nombre: "Bull put spread", sesgo: "alcista", vol: "alta", riesgo: "definido",
    corto: "Put vendida arriba + put comprada abajo. Riesgo acotado.",
    explico: "Igual que un CSP pero con la pérdida tapada por la put que comprás.",
    cuando: "Sos alcista pero no querés inmovilizar el capital de un CSP entero.",
    legs: (s) => [mkLeg("put", -1, redondear(s * 0.96), 1.35), mkLeg("put", 1, redondear(s * 0.9), 0.55)],
  },
  bearCall: {
    nombre: "Bear call spread", sesgo: "bajista", vol: "alta", riesgo: "definido",
    corto: "Call vendida abajo + call comprada arriba. Crédito bajista.",
    explico: "El espejo del bull put. Cobrás prima apostando a que el precio no supera cierto nivel.",
    cuando: "Esperás que el precio no rompa una resistencia clara.",
    legs: (s) => [mkLeg("call", -1, redondear(s * 1.04), 1.3), mkLeg("call", 1, redondear(s * 1.1), 0.5)],
  },
  ironCondor: {
    nombre: "Iron condor", sesgo: "lateral", vol: "alta", riesgo: "definido",
    corto: "Dos spreads de crédito. Gana si el precio se queda quieto.",
    explico: "Vendés un rango. Mientras el precio termine adentro de las alas, cobrás.",
    cuando: "Volatilidad alta que esperás que se desinfle, sin dirección clara.",
    legs: (s) => [mkLeg("put", 1, redondear(s * 0.86), 0.4), mkLeg("put", -1, redondear(s * 0.93), 0.95), mkLeg("call", -1, redondear(s * 1.07), 0.9), mkLeg("call", 1, redondear(s * 1.14), 0.35)],
  },
  straddle: {
    nombre: "Straddle comprado", sesgo: "lateral", vol: "baja", riesgo: "definido",
    corto: "Call + put al mismo strike. Gana con movimiento fuerte.",
    explico: "No te importa el lado, te importa la magnitud. Pagás dos primas.",
    cuando: "Viene un evento binario y la volatilidad todavía está barata.",
    legs: (s) => [mkLeg("call", 1, redondear(s), 1.7), mkLeg("put", 1, redondear(s), 1.6)],
  },
  strangle: {
    nombre: "Strangle vendido", sesgo: "lateral", vol: "alta", riesgo: "abierto",
    corto: "Put y call vendidas fuera del dinero. Riesgo abierto.",
    explico: "Cobrás dos primas apostando a un rango amplio. Sin alas compradas, la pérdida no tiene techo.",
    cuando: "Volatilidad muy alta y tolerancia real al riesgo abierto.",
    legs: (s) => [mkLeg("put", -1, redondear(s * 0.9), 0.85), mkLeg("call", -1, redondear(s * 1.1), 0.8)],
  },
};

const NIVELES = {
  principiante: {
    etq: "Principiante", lema: "Cuatro estructuras base, explicadas sin jerga.",
    estrategias: ["csp", "cc", "longCall", "longPut"],
    metricas: ["prima", "breakeven", "maxGanancia", "maxPerdida"],
    perdidaHasta: 0.7, editarContratos: false, editarPatas: false,
    escenarios: true, gestion: false, glosario: true,
    curvaHoy: false, griegas: "no",
    secciones: ["aprender", "diagrama", "estrategias"],
  },
  medio: {
    etq: "Intermedio", lema: "Estructuras de crédito con riesgo definido y métricas de retorno.",
    estrategias: ["csp", "cc", "collar", "bullPut", "bearCall", "longCall", "longPut"],
    metricas: ["prima", "breakeven", "maxGanancia", "maxPerdida", "capital", "retorno"],
    perdidaHasta: 0, editarContratos: true, editarPatas: false,
    escenarios: true, gestion: true, glosario: false,
    curvaHoy: true, griegas: "basicas",
    secciones: ["aprender", "diagrama", "estrategias", "checklist", "bitacora"],
  },
  avanzado: {
    etq: "Avanzado", lema: "Armado libre de patas. Todo visible, nada redondeado.",
    estrategias: Object.keys(ESTRATEGIAS),
    metricas: ["prima", "breakeven", "maxGanancia", "maxPerdida", "capital", "retorno"],
    perdidaHasta: 0, editarContratos: true, editarPatas: true,
    escenarios: false, gestion: true, glosario: false,
    curvaHoy: true, griegas: "todas",
    secciones: ["aprender", "diagrama", "estrategias", "checklist", "bitacora"],
  },
};

const SECCIONES = {
  aprender: { etq: "Aprender", num: "01", desc: "Conceptos, ordenados por lo que necesitás ahora" },
  diagrama: { etq: "Diagrama", num: "02", desc: "Armá una estructura y mirá el resultado" },
  estrategias: { etq: "Estrategias", num: "03", desc: "Qué usar según lo que esperás del mercado" },
  checklist: { etq: "Antes de entrar", num: "04", desc: "El plan de salida, escrito antes de la orden" },
  bitacora: { etq: "Bitácora", num: "05", desc: "Lo que operaste y cómo salió" },
};

const LECCIONES = {
  principiante: [
    ["Un contrato son 100 acciones", "Toda prima que veas en la pantalla se multiplica por 100. Una prima de 1,20 significa 120 dólares. Es el error de cálculo más común al empezar."],
    ["Comprar da derechos, vender da obligaciones", "El que compra elige si ejerce. El que vende tiene que cumplir si lo ejercen. Por eso el vendedor cobra: le pagan por asumir la obligación."],
    ["El strike es el precio pactado", "Es el precio al que se compra o se vende si el contrato se ejerce. No cambia nunca durante la vida del contrato."],
    ["El tiempo juega a favor del vendedor", "Una opción vale menos cada día que pasa. Si la vendiste, esa pérdida de valor es tu ganancia."],
    ["Asignación no es un desastre", "Que te asignen un CSP significa que comprás las acciones al strike, que era el precio que querías. El problema no es la asignación, es haberla vendido sobre algo que no querías tener."],
  ],
  medio: [
    ["Volatilidad implícita y su percentil", "La IV te dice cuánta prima hay en la calle. El percentil (IVR) te dice si esa IV está cara o barata contra su propio año. Vendé prima con IVR alto, comprá con IVR bajo."],
    ["Delta como probabilidad aproximada", "Un delta de 0,30 equivale, en grandes números, a un 30% de chances de terminar dentro del dinero. Sirve para elegir strike sin adivinar."],
    ["Cerrar al 50% no es dejar plata", "Recomprar a la mitad de la prima libera capital y elimina el riesgo de cola. En términos de retorno por día de exposición, casi siempre gana."],
    ["Riesgo definido versus riesgo abierto", "Comprar el ala convierte una pérdida infinita en una pérdida conocida. Cobrás menos prima; a cambio, sabés dormir."],
    ["Rolar es una decisión, no un reflejo", "Rolar solo tiene sentido si cobrás crédito neto y la tesis sigue en pie. Rolar por no aceptar una pérdida es transformar un problema chico en uno grande."],
  ],
  avanzado: [
    ["Las griegas como sistema, no como números sueltos", "Delta es dirección, gamma es aceleración, theta es tiempo, vega es volatilidad. Una cartera se gestiona por la suma de las cuatro, no contrato por contrato."],
    ["Riesgo de asignación anticipada", "Casi siempre aparece por dividendo en calls in-the-money la víspera del ex-dividendo, o en puts muy adentro cuando el valor extrínseco se agota."],
    ["Skew y su lectura", "Las puts suelen valer más que las calls equidistantes. Ese sesgo te dice dónde está el miedo y cuál lado de la estructura conviene vender."],
    ["Exposición agregada por subyacente", "Cinco estructuras sobre el mismo sector no son cinco posiciones: son una sola, apalancada. El límite se pone sobre la correlación, no sobre el ticker."],
    ["Retorno sobre capital y sobre tiempo", "Una estructura al 3% en 30 días le gana a una al 5% en 90. Comparar siempre en la misma unidad: retorno por día de capital comprometido."],
  ],
};

/* ================================================================== */
/*  CÁLCULO                                                            */
/* ================================================================== */

function payoffLeg(l, S) {
  let v;
  if (l.kind === "stock") v = l.dir * (S - l.strike);
  else if (l.kind === "call") v = l.dir * (Math.max(S - l.strike, 0) - l.prima);
  else v = l.dir * (Math.max(l.strike - S, 0) - l.prima);
  return v * l.qty * 100;
}
const payoffTotal = (legs, S) => legs.reduce((a, l) => a + payoffLeg(l, S), 0);
const primaNeta = (legs) => legs.filter((l) => l.kind !== "stock").reduce((a, l) => a - l.dir * l.prima * l.qty * 100, 0);
const pendienteDerecha = (legs) => legs.reduce((a, l) => (l.kind === "put" ? a : a + l.dir * l.qty), 0);

/* ------- Black-Scholes: valor antes del vencimiento y griegas ------- */

const TASA = 0.04; // tasa libre de riesgo anual

const npdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

// Aproximación de Abramowitz-Stegun para la normal acumulada
function ncdf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const signo = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * z);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + signo * y);
}

// T en años, sigma en decimal (0,45 = 45%)
function bs(tipo, S, K, T, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0) {
    const intr = tipo === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return { precio: intr, delta: tipo === "call" ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0 };
  }
  const d1 = (Math.log(S / K) + (TASA + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const desc = Math.exp(-TASA * T);
  const gamma = npdf(d1) / (S * sigma * Math.sqrt(T));
  const vega = (S * Math.sqrt(T) * npdf(d1)) / 100; // por punto de volatilidad
  if (tipo === "call") {
    const thetaAnual = -(S * npdf(d1) * sigma) / (2 * Math.sqrt(T)) - TASA * K * desc * ncdf(d2);
    return { precio: S * ncdf(d1) - K * desc * ncdf(d2), delta: ncdf(d1), gamma, vega, theta: thetaAnual / 365 };
  }
  const thetaAnual = -(S * npdf(d1) * sigma) / (2 * Math.sqrt(T)) + TASA * K * desc * ncdf(-d2);
  return { precio: K * desc * ncdf(-d2) - S * ncdf(-d1), delta: ncdf(d1) - 1, gamma, vega, theta: thetaAnual / 365 };
}

// Resultado de la posición HOY (o a X días del vencimiento), no al vencimiento
function valorActual(legs, S, dias, iv) {
  const T = Math.max(dias, 0) / 365;
  const sigma = iv / 100;
  return legs.reduce((acc, l) => {
    if (l.kind === "stock") return acc + l.dir * (S - l.strike) * l.qty * 100;
    const { precio } = bs(l.kind, S, l.strike, T, sigma);
    return acc + l.dir * (precio - l.prima) * l.qty * 100;
  }, 0);
}

function griegasTotales(legs, S, dias, iv) {
  const T = Math.max(dias, 0) / 365;
  const sigma = iv / 100;
  return legs.reduce((acc, l) => {
    const m = l.dir * l.qty * 100;
    if (l.kind === "stock") return { ...acc, delta: acc.delta + m };
    const g = bs(l.kind, S, l.strike, T, sigma);
    return {
      delta: acc.delta + m * g.delta,
      gamma: acc.gamma + m * g.gamma,
      theta: acc.theta + m * g.theta,
      vega: acc.vega + m * g.vega,
    };
  }, { delta: 0, gamma: 0, theta: 0, vega: 0 });
}

function analizar(legs, spot, dte, nivel) {
  const cfg = NIVELES[nivel];
  const strikes = legs.map((l) => l.strike);
  const lo = Math.min(spot, ...strikes), hi = Math.max(spot, ...strikes);
  const span = Math.max(hi - lo, spot * 0.25);
  const pMin = Math.max(0, lo - span * 0.9), pMax = hi + span * 0.9;

  const N = 1200, puntos = [];
  for (let i = 0; i <= N; i++) {
    const S = pMin + ((pMax - pMin) * i) / N;
    puntos.push({ S, v: payoffTotal(legs, S) });
  }
  const bes = [];
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1], b = puntos[i];
    if (a.v === 0) bes.push(a.S);
    else if (a.v * b.v < 0) bes.push(a.S + (b.S - a.S) * (Math.abs(a.v) / (Math.abs(a.v) + Math.abs(b.v))));
  }
  const vals = puntos.map((p) => p.v);
  const perdidaTotal = Math.min(payoffTotal(legs, 0), ...vals);
  const pisoRef = spot * cfg.perdidaHasta;
  const perdidaMostrada = cfg.perdidaHasta > 0
    ? Math.min(...puntos.filter((p) => p.S >= pisoRef).map((p) => p.v), payoffTotal(legs, pisoRef))
    : perdidaTotal;
  const gananciaIlimitada = pendienteDerecha(legs) > 0.0001;
  const maxGanancia = gananciaIlimitada ? Infinity : Math.max(...vals);
  const credito = primaNeta(legs);
  const capital = Math.abs(perdidaTotal) + Math.max(credito, 0);
  const retorno = gananciaIlimitada || capital <= 0 ? null : maxGanancia / capital;
  const anualizado = retorno == null || !dte ? null : retorno * (365 / dte);
  return { puntos, pMin, pMax, bes, maxGanancia, perdidaTotal, perdidaMostrada, pisoRef, credito, capital, retorno, anualizado, gananciaIlimitada };
}

const usd = (n) => (n < 0 ? "\u2212" : "") + "$" + Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const usd2 = (n) => (n < 0 ? "\u2212" : "") + "$" + Math.abs(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => (n * 100).toFixed(1).replace(".", ",") + "%";

export {
  mkLeg, redondear,
  ESTRATEGIAS, NIVELES, SECCIONES, LECCIONES,
  payoffLeg, payoffTotal, primaNeta, pendienteDerecha,
  bs, valorActual, griegasTotales, analizar,
  usd, usd2, pct,
};
