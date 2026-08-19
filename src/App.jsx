import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  mkLeg, redondear,
  ESTRATEGIAS, NIVELES, SECCIONES, LECCIONES,
  payoffTotal, valorActual, griegasTotales, analizar,
  usd, usd2, pct,
} from "./motor.js";
import { leer, escribir, CLAVE_BITACORA, CLAVE_PREFS } from "./almacenamiento.js";

/* ================================================================== */
/*  PANTALLA: DIAGRAMA                                                 */
/* ================================================================== */

function Diagrama({ nivel, estado, setEstado, onGuardar }) {
  const cfg = NIVELES[nivel];
  const { ticker, spot, dte, estrategia, legs } = estado;
  const iv = estado.iv ?? 55;
  const [hover, setHover] = useState(null);
  const [restantes, setRestantes] = useState(dte);
  const svgRef = useRef(null);

  useEffect(() => { setRestantes(dte); }, [dte]);
  const dias = Math.min(restantes, dte);

  const up = (p) => setEstado({ ...estado, ...p });
  const cambiarEstrategia = (k) => up({ estrategia: k, legs: ESTRATEGIAS[k].legs(spot) });
  const cambiarSpot = (v) => { const s = Math.max(0.5, v || 0.5); up({ spot: s, legs: ESTRATEGIAS[estrategia].legs(s) }); };
  const editarLeg = (id, c, v) => up({ legs: legs.map((l) => (l.id === id ? { ...l, [c]: v } : l)) });
  const invertirLeg = (id) => up({ legs: legs.map((l) => (l.id === id ? { ...l, dir: -l.dir } : l)) });
  const borrarLeg = (id) => legs.length > 1 && up({ legs: legs.filter((l) => l.id !== id) });
  const agregarLeg = (k) => up({ legs: [...legs, mkLeg(k, k === "stock" ? 1 : -1, redondear(spot), k === "stock" ? 0 : 1)] });

  const a = useMemo(() => analizar(legs, spot, dte, nivel), [legs, spot, dte, nivel]);

  const W = 780, H = 420, padL = 62, padR = 26, padT = 26, padB = 48;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = a.puntos.map((p) => p.v);
  let vMax = Math.max(...vals, 0), vMin = Math.min(...vals, 0);
  const vPad = Math.max((vMax - vMin) * 0.16, 40);
  vMax += vPad; vMin -= vPad;
  const sx = (p) => padL + ((p - a.pMin) / (a.pMax - a.pMin)) * plotW;
  const sy = (v) => padT + ((vMax - v) / (vMax - vMin)) * plotH;
  const yCero = sy(0);
  const curva = a.puntos.map((p) => `${sx(p.S).toFixed(1)},${sy(p.v).toFixed(1)}`).join(" ");

  // Curva de valor actual (antes del vencimiento) y griegas de la posición
  const curvaHoy = cfg.curvaHoy
    ? a.puntos.map((p) => `${sx(p.S).toFixed(1)},${sy(valorActual(legs, p.S, dias, iv)).toFixed(1)}`).join(" ")
    : null;
  const g = useMemo(() => griegasTotales(legs, spot, dias, iv), [legs, spot, dias, iv]);
  const valorHoyEnSpot = valorActual(legs, spot, dias, iv);
  const areaPath = `M ${sx(a.pMin).toFixed(1)},${yCero.toFixed(1)} ` +
    a.puntos.map((p) => `L ${sx(p.S).toFixed(1)},${sy(p.v).toFixed(1)}`).join(" ") +
    ` L ${sx(a.pMax).toFixed(1)},${yCero.toFixed(1)} Z`;
  const ticksX = Array.from({ length: 7 }, (_, i) => a.pMin + ((a.pMax - a.pMin) * i) / 6);
  const ticksY = (() => {
    const raw = (vMax - vMin) / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
    const step = Math.ceil(raw / mag) * mag || 1;
    const out = [];
    for (let v = Math.ceil(vMin / step) * step; v <= vMax; v += step) out.push(v);
    return out;
  })();
  const mover = (cx) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((cx - r.left) / r.width) * W;
    if (x < padL || x > W - padR) return setHover(null);
    const S = a.pMin + ((x - padL) / plotW) * (a.pMax - a.pMin);
    setHover({ S, v: payoffTotal(legs, S) });
  };
  const etiquetaLeg = (l) => l.kind === "stock"
    ? (l.dir > 0 ? "Acciones compradas" : "Acciones vendidas")
    : `${l.kind === "call" ? "Call" : "Put"} ${l.dir > 0 ? "comprada" : "vendida"}`;
  const escenarios = [
    { etq: `Si ${ticker} baja 20%`, S: spot * 0.8 },
    { etq: `Si ${ticker} queda igual`, S: spot },
    { etq: `Si ${ticker} sube 20%`, S: spot * 1.2 },
  ].map((e) => ({ ...e, v: payoffTotal(legs, e.S) }));
  const esCredito = a.credito > 0;
  const vis = (k) => cfg.metricas.includes(k);

  return (
    <div className="grilla">
      <div>
        <section className="bloque">
          <div className="bloqueTit">Datos de la operación</div>
          <div className="bloqueCuerpo">
            <label className="campo">
              <span className="etq">Estrategia</span>
              <select value={estrategia} onChange={(e) => cambiarEstrategia(e.target.value)}>
                {cfg.estrategias.map((k) => <option key={k} value={k}>{ESTRATEGIAS[k].nombre}</option>)}
              </select>
            </label>
            <div className="fila3">
              <label className="campo"><span className="etq">Subyacente</span>
                <input value={ticker} onChange={(e) => up({ ticker: e.target.value.toUpperCase() })} /></label>
              <label className="campo"><span className="etq">Precio</span>
                <input type="number" step="0.5" value={spot} onChange={(e) => cambiarSpot(parseFloat(e.target.value))} /></label>
              <label className="campo"><span className="etq">Días</span>
                <input type="number" step="1" min="1" value={dte} onChange={(e) => up({ dte: Math.max(1, parseInt(e.target.value) || 1) })} /></label>
            </div>
            {cfg.curvaHoy && (
              <label className="campo">
                <span className="etq">Volatilidad implícita — {iv}%</span>
                <input type="range" min="10" max="150" step="1" value={iv}
                  onChange={(e) => up({ iv: parseInt(e.target.value) })} />
              </label>
            )}
            <p className="nota">{nivel === "principiante" ? ESTRATEGIAS[estrategia].explico : ESTRATEGIAS[estrategia].corto}</p>
          </div>
        </section>

        <section className="bloque">
          <div className="bloqueTit"><span>Patas de la estructura</span>{cfg.editarPatas && <span style={{ opacity: .6 }}>{legs.length}</span>}</div>
          <div className="bloqueCuerpo">
            {legs.map((l) => (
              <div className="leg" key={l.id}>
                <div className="legTit">
                  <span>{etiquetaLeg(l)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {cfg.editarPatas
                      ? <button className="legTag" onClick={() => invertirLeg(l.id)} style={{ background: l.dir > 0 ? "var(--tinta)" : "var(--perdida)" }}>{l.dir > 0 ? "LARGA" : "CORTA"}</button>
                      : <span className="legTag" style={{ background: l.dir > 0 ? "var(--tinta)" : "var(--perdida)" }}>{l.dir > 0 ? "LARGA" : "CORTA"}</span>}
                    {cfg.editarPatas && legs.length > 1 && <button className="quitar" onClick={() => borrarLeg(l.id)} aria-label="Quitar pata">×</button>}
                  </span>
                </div>
                {l.kind === "stock" ? (
                  <div className={cfg.editarContratos ? "fila2" : ""}>
                    <label className="campo"><span className="etq">Precio de compra</span>
                      <input type="number" step="0.5" value={l.strike} onChange={(e) => editarLeg(l.id, "strike", parseFloat(e.target.value) || 0)} /></label>
                    {cfg.editarContratos && <label className="campo"><span className="etq">Lotes de 100</span>
                      <input type="number" step="1" min="1" value={l.qty} onChange={(e) => editarLeg(l.id, "qty", Math.max(1, parseInt(e.target.value) || 1))} /></label>}
                  </div>
                ) : (
                  <div className={cfg.editarContratos ? "fila3" : "fila2"}>
                    <label className="campo"><span className="etq">Strike</span>
                      <input type="number" step="0.5" value={l.strike} onChange={(e) => editarLeg(l.id, "strike", parseFloat(e.target.value) || 0)} /></label>
                    <label className="campo"><span className="etq">Prima</span>
                      <input type="number" step="0.05" min="0" value={l.prima} onChange={(e) => editarLeg(l.id, "prima", Math.max(0, parseFloat(e.target.value) || 0))} /></label>
                    {cfg.editarContratos && <label className="campo"><span className="etq">Contratos</span>
                      <input type="number" step="1" min="1" value={l.qty} onChange={(e) => editarLeg(l.id, "qty", Math.max(1, parseInt(e.target.value) || 1))} /></label>}
                  </div>
                )}
              </div>
            ))}
            {cfg.editarPatas && (
              <div className="agregar">
                <button className="agregarBtn" onClick={() => agregarLeg("call")}>+ Call</button>
                <button className="agregarBtn" onClick={() => agregarLeg("put")}>+ Put</button>
                <button className="agregarBtn" onClick={() => agregarLeg("stock")}>+ Acciones</button>
              </div>
            )}
          </div>
        </section>
      </div>

      <div>
        <div className="lienzo">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
            onMouseMove={(e) => mover(e.clientX)} onMouseLeave={() => setHover(null)}
            onTouchMove={(e) => mover(e.touches[0].clientX)} onTouchEnd={() => setHover(null)}
            role="img" aria-label={`Resultado de ${ESTRATEGIAS[estrategia].nombre} sobre ${ticker}`}>
            <defs>
              <pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="7" stroke="var(--perdida)" strokeWidth="1.6" opacity=".55" />
              </pattern>
              <clipPath id="arriba"><rect x={padL} y={padT} width={plotW} height={Math.max(yCero - padT, 0)} /></clipPath>
              <clipPath id="abajo"><rect x={padL} y={yCero} width={plotW} height={Math.max(padT + plotH - yCero, 0)} /></clipPath>
            </defs>
            {ticksY.map((v, i) => (
              <g key={i}>
                <line x1={padL} y1={sy(v)} x2={W - padR} y2={sy(v)} stroke="var(--linea)" />
                <text className="ejeTxt" x={padL - 9} y={sy(v) + 3.5} textAnchor="end">{v === 0 ? "0" : usd(v)}</text>
              </g>
            ))}
            {ticksX.map((p, i) => <line key={i} x1={sx(p)} y1={padT} x2={sx(p)} y2={padT + plotH} stroke="var(--linea)" />)}
            <path d={areaPath} fill="var(--ganancia)" opacity=".16" clipPath="url(#arriba)" />
            <path d={areaPath} fill="url(#hatch)" clipPath="url(#abajo)" />
            <line x1={padL} y1={yCero} x2={W - padR} y2={yCero} stroke="var(--tinta)" strokeWidth="1.5" />
            <line x1={sx(spot)} y1={padT} x2={sx(spot)} y2={padT + plotH} stroke="var(--tinta)" strokeWidth="1.2" strokeDasharray="1 4" />
            <text className="marcaTxt" x={sx(spot)} y={padT - 9} textAnchor="middle" fill="var(--tinta)">HOY {spot}</text>
            {a.bes.map((b, i) => (
              <g key={i}>
                <line x1={sx(b)} y1={padT} x2={sx(b)} y2={padT + plotH} stroke="var(--marca)" strokeWidth="1.4" strokeDasharray="7 4" />
                <rect x={sx(b) - 26} y={padT + plotH + 6} width="52" height="15" fill="var(--marca)" />
                <text className="marcaTxt" x={sx(b)} y={padT + plotH + 17} textAnchor="middle" fill="var(--papel2)">{b.toFixed(2)}</text>
              </g>
            ))}
            {legs.filter((l) => l.kind !== "stock").map((l) => (
              <g key={l.id}>
                <line x1={sx(l.strike)} y1={padT + plotH} x2={sx(l.strike)} y2={padT + plotH + 5} stroke="var(--tinta)" strokeWidth="2" />
                <text className="marcaTxt" x={sx(l.strike)} y={padT + plotH + 34} textAnchor="middle" fill="var(--tinta60)">
                  {l.kind === "call" ? "C" : "P"}{l.strike}
                </text>
              </g>
            ))}
            <polyline points={curva} fill="none" stroke="var(--tinta)" strokeWidth="2.6" strokeLinejoin="round" />
            {curvaHoy && (
              <polyline points={curvaHoy} fill="none" stroke="var(--marca)" strokeWidth="2.2"
                strokeDasharray="6 4" strokeLinejoin="round" />
            )}
            {hover && (
              <g>
                <line x1={sx(hover.S)} y1={padT} x2={sx(hover.S)} y2={padT + plotH} stroke="var(--tinta)" />
                <circle cx={sx(hover.S)} cy={sy(hover.v)} r="4.5" fill="var(--papel2)" stroke="var(--tinta)" strokeWidth="2.2" />
                <g transform={`translate(${Math.min(Math.max(sx(hover.S) - 62, padL), W - padR - 124)}, ${padT + 6})`}>
                  <rect width="124" height="40" fill="var(--tinta)" />
                  <text className="marcaTxt" x="9" y="16" fill="var(--papel2)">{ticker} {hover.S.toFixed(2)}</text>
                  <text className="marcaTxt" x="9" y="31" fill={hover.v >= 0 ? "#6FD4C0" : "#F0A08C"}>{usd2(hover.v)}</text>
                </g>
              </g>
            )}
          </svg>
          <div className="leyenda">
            <span><i className="swatch" style={{ background: "var(--ganancia)", opacity: .35 }} />Zona de ganancia</span>
            <span><i className="swatch" style={{ background: "var(--perdida)", opacity: .5 }} />Zona de pérdida</span>
            <span><i className="swatch" style={{ background: "var(--marca)" }} />Punto de equilibrio</span>
            {cfg.curvaHoy && <span><i className="swatchLinea" />Valor a {dias} días</span>}
          </div>
          {cfg.curvaHoy && (
            <div className="tiempo">
              <label className="tiempoEtq" htmlFor="rest">Días hasta el vencimiento</label>
              <input id="rest" type="range" min="0" max={dte} step="1" value={dias}
                onChange={(e) => setRestantes(parseInt(e.target.value))} />
              <output className="tiempoVal">{dias === 0 ? "Vencido" : `${dias} d`}</output>
            </div>
          )}
        </div>

        {cfg.escenarios && (
          <section className="bloque" style={{ marginTop: 18 }}>
            <div className="bloqueTit">Qué pasa si…</div>
            <div className="esc">
              {escenarios.map((e) => (
                <div className="escCol" key={e.etq}>
                  <div className="escEtq">{e.etq}<br /><span className="escSub">${e.S.toFixed(2)}</span></div>
                  <div className="escVal" style={{ color: e.v >= 0 ? "var(--ganancia)" : "var(--perdida)" }}>{usd(e.v)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="bloque" style={{ marginTop: 18 }}>
          <div className="bloqueTit">Números de la estructura</div>
          <div className="metricas">
            {vis("prima") && <Met etq={esCredito ? "Prima cobrada" : "Prima pagada"} val={usd2(Math.abs(a.credito))}
              color={esCredito ? "var(--ganancia)" : "var(--perdida)"} pie={esCredito ? "entra a tu cuenta hoy" : "sale de tu cuenta hoy"} />}
            {vis("breakeven") && <Met etq="Punto de equilibrio" val={a.bes.length ? a.bes.map((b) => b.toFixed(2)).join(" / ") : "—"} pie={`precio de ${ticker} al vencimiento`} />}
            {vis("maxGanancia") && <Met etq="Ganancia máxima" val={a.gananciaIlimitada ? "Sin techo" : usd(a.maxGanancia)}
              color="var(--ganancia)" pie={a.gananciaIlimitada ? "crece si sigue subiendo" : "en el mejor escenario"} />}
            {vis("maxPerdida") && <Met etq="Pérdida máxima" val={usd(a.perdidaMostrada)} color="var(--perdida)"
              pie={cfg.perdidaHasta > 0 ? `si ${ticker} cae a $${a.pisoRef.toFixed(2)}` : `si ${ticker} va a cero`} />}
            {vis("capital") && <Met etq="Capital comprometido" val={usd(a.capital)} pie="colateral o costo de la posición" />}
            {vis("retorno") && <Met etq="Retorno máximo" val={a.retorno == null ? "—" : pct(a.retorno)}
              pie={a.anualizado == null ? "no acotado" : `${pct(a.anualizado)} anualizado a ${dte} días`} />}
          </div>
        </section>

        {cfg.griegas !== "no" && (
          <section className="bloque" style={{ marginTop: 18 }}>
            <div className="bloqueTit">
              <span>Cómo se mueve la posición</span>
              <span style={{ opacity: .6 }}>a {dias} días · IV {iv}%</span>
            </div>
            <div className="griegas">
              <div className="gri">
                <div className="metEtq">Resultado hoy</div>
                <div className="metVal" style={{ color: valorHoyEnSpot >= 0 ? "var(--ganancia)" : "var(--perdida)" }}>
                  {usd2(valorHoyEnSpot)}
                </div>
                <div className="metPie">si cerrás ahora a {spot}</div>
              </div>
              <div className="gri">
                <div className="metEtq">Delta</div>
                <div className="metVal">{g.delta >= 0 ? "+" : "\u2212"}{Math.abs(g.delta).toFixed(0)}</div>
                <div className="metPie">gana {usd2(Math.abs(g.delta))} por cada dólar que {g.delta >= 0 ? "sube" : "baja"}</div>
              </div>
              <div className="gri">
                <div className="metEtq">Theta</div>
                <div className="metVal" style={{ color: g.theta >= 0 ? "var(--ganancia)" : "var(--perdida)" }}>
                  {g.theta >= 0 ? "+" : "\u2212"}{usd2(Math.abs(g.theta)).replace("$", "$")}
                </div>
                <div className="metPie">{g.theta >= 0 ? "el tiempo te suma" : "el tiempo te resta"} por día</div>
              </div>
              {cfg.griegas === "todas" && (
                <>
                  <div className="gri">
                    <div className="metEtq">Vega</div>
                    <div className="metVal" style={{ color: g.vega >= 0 ? "var(--ganancia)" : "var(--perdida)" }}>
                      {g.vega >= 0 ? "+" : "\u2212"}{usd2(Math.abs(g.vega))}
                    </div>
                    <div className="metPie">por cada punto de volatilidad</div>
                  </div>
                  <div className="gri">
                    <div className="metEtq">Gamma</div>
                    <div className="metVal">{g.gamma >= 0 ? "+" : "\u2212"}{Math.abs(g.gamma).toFixed(1)}</div>
                    <div className="metPie">cuánto cambia el delta por dólar</div>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {cfg.gestion && esCredito && (
          <section className="bloque" style={{ marginTop: 18 }}>
            <div className="bloqueTit">Plan de salida</div>
            <div className="gest">
              <div className="gestCol"><div className="metEtq">Tomar ganancia</div>
                <div className="metVal" style={{ color: "var(--ganancia)" }}>{usd2(a.credito * .5)}</div>
                <div className="metPie">recomprar al 50% de la prima</div></div>
              <div className="gestCol"><div className="metEtq">Cortar pérdida</div>
                <div className="metVal" style={{ color: "var(--perdida)" }}>{usd2(-a.credito * 2)}</div>
                <div className="metPie">salir al 200% de la prima</div></div>
              <div className="gestCol"><div className="metEtq">Llevar al checklist</div>
                <button className="accion" onClick={onGuardar}>Preparar la orden</button>
                <div className="metPie">completás el plan y queda en bitácora</div></div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const Met = ({ etq, val, pie, color }) => (
  <div className="met">
    <div className="metEtq">{etq}</div>
    <div className="metVal" style={color ? { color } : undefined}>{val}</div>
    <div className="metPie">{pie}</div>
  </div>
);

/* ================================================================== */
/*  PANTALLA: APRENDER                                                 */
/* ================================================================== */

function Aprender({ nivel }) {
  const [abierto, setAbierto] = useState(0);
  const lecciones = LECCIONES[nivel];
  return (
    <div className="columnaAncha">
      {lecciones.map(([t, d], i) => (
        <article key={t} className="leccion">
          <button className="leccionTit" onClick={() => setAbierto(abierto === i ? -1 : i)} aria-expanded={abierto === i}>
            <span className="leccionNum">{String(i + 1).padStart(2, "0")}</span>
            <span>{t}</span>
            <span className="leccionMas">{abierto === i ? "−" : "+"}</span>
          </button>
          {abierto === i && <p className="leccionCuerpo">{d}</p>}
        </article>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  PANTALLA: ESTRATEGIAS                                              */
/* ================================================================== */

function Estrategias({ nivel, onElegir }) {
  const cfg = NIVELES[nivel];
  const filas = [
    ["alcista", "Espero que suba"],
    ["lateral", "Espero que se quede"],
    ["bajista", "Espero que baje"],
  ];
  const cols = [["alta", "Volatilidad alta"], ["baja", "Volatilidad baja"]];
  return (
    <div className="columnaAncha">
      <p className="intro">
        Elegí por lo que esperás del mercado, no por el nombre de la estructura.
        La columna importa tanto como la fila: la misma expectativa se opera distinto según cuánta prima haya en la calle.
      </p>
      <div className="matriz">
        <div className="mHead" />
        {cols.map(([k, e]) => <div className="mHead" key={k}>{e}</div>)}
        {filas.map(([fk, fe]) => (
          <React.Fragment key={fk}>
            <div className="mFila">{fe}</div>
            {cols.map(([ck]) => {
              const items = cfg.estrategias.filter((k) => ESTRATEGIAS[k].sesgo === fk && ESTRATEGIAS[k].vol === ck);
              return (
                <div className="mCelda" key={ck}>
                  {items.length === 0 && <span className="mVacia">—</span>}
                  {items.map((k) => (
                    <button key={k} className="mChip" onClick={() => onElegir(k)}>
                      {ESTRATEGIAS[k].nombre}
                      {ESTRATEGIAS[k].riesgo === "abierto" && <i className="alerta" title="Riesgo abierto" />}
                    </button>
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="fichas">
        {cfg.estrategias.map((k) => (
          <article className="ficha" key={k}>
            <h3>{ESTRATEGIAS[k].nombre}</h3>
            <p className="fichaCuando">{ESTRATEGIAS[k].cuando}</p>
            <button className="accion" onClick={() => onElegir(k)}>Ver el diagrama</button>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  PANTALLA: CHECKLIST                                                */
/* ================================================================== */

const VACIO = { ticker: "", estructura: "", tesis: "", catalizador: "", siBaja: "", siSube: "", capital: "" };

function Checklist({ estado, onGuardar }) {
  const [f, setF] = useState({ ...VACIO, ticker: estado.ticker, estructura: ESTRATEGIAS[estado.estrategia].nombre });
  const campos = [
    ["ticker", "Subyacente", "SNDU", false],
    ["estructura", "Estructura", "Put vendida 47", false],
    ["tesis", "Por qué entrás", "Soporte en 45 y quiero el papel a ese precio", true],
    ["catalizador", "Catalizador verificado", "Contrato con Microsoft confirmado el 12/07", true],
    ["siBaja", "Qué hacés si va en contra", "Acepto asignación y vendo calls sobre el papel", true],
    ["siSube", "Qué hacés si va a favor", "Recompro al 50% y roteo a la semana siguiente", true],
    ["capital", "Capital comprometido", "4.800", false],
  ];
  const completo = Object.values(f).every((v) => v.trim().length > 0);
  return (
    <div className="columnaMedia">
      <p className="intro">
        Ninguna orden entra sin plan de salida escrito. Si no podés completar los dos escenarios,
        todavía no entendés la operación lo suficiente como para ponerle plata.
      </p>
      <section className="bloque">
        <div className="bloqueTit">Plan de la operación</div>
        <div className="bloqueCuerpo">
          {campos.map(([k, etq, ph, largo]) => (
            <label className="campo" key={k}>
              <span className="etq">{etq}</span>
              {largo
                ? <textarea rows="2" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                : <input placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
            </label>
          ))}
        </div>
      </section>
      <div className="pie">
        <span className="pieEstado">{completo ? "Plan completo. Ya podés operar." : "Faltan campos. Completá todo antes de entrar."}</span>
        <button className="accion grande" disabled={!completo} onClick={() => { onGuardar(f); setF({ ...VACIO }); }}>
          Guardar en bitácora
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  PANTALLA: BITÁCORA                                                 */
/* ================================================================== */

function Bitacora({ ops, setOps, cargado, onBorrarTodo }) {
  const [confirmando, setConfirmando] = useState(false);
  const cerrar = (id, resultado) => setOps(ops.map((o) => (o.id === id ? { ...o, resultado } : o)));
  const abiertas = ops.filter((o) => !o.resultado).length;
  const ganadas = ops.filter((o) => o.resultado === "ganada").length;
  const cerradas = ops.filter((o) => o.resultado).length;

  if (!cargado) return (
    <div className="columnaMedia">
      <div className="vacio"><p>Buscando tus operaciones…</p></div>
    </div>
  );

  if (ops.length === 0) return (
    <div className="columnaMedia">
      <div className="vacio">
        <p>Todavía no hay operaciones registradas.</p>
        <p className="vacioSub">Completá un plan en <strong>Antes de entrar</strong> y va a aparecer acá.</p>
      </div>
    </div>
  );

  return (
    <div className="columnaAncha">
      <div className="resumen">
        <div><span className="metEtq">Abiertas</span><div className="metVal">{abiertas}</div></div>
        <div><span className="metEtq">Cerradas</span><div className="metVal">{cerradas}</div></div>
        <div><span className="metEtq">Aciertos</span><div className="metVal">{cerradas ? Math.round((ganadas / cerradas) * 100) + "%" : "—"}</div></div>
      </div>
      {ops.map((o) => (
        <article className="op" key={o.id}>
          <div className="opCab">
            <div><strong>{o.ticker}</strong> <span className="opEstr">{o.estructura}</span></div>
            <div className="opAcc">
              {o.resultado
                ? <span className="opTag" style={{ background: o.resultado === "ganada" ? "var(--ganancia)" : "var(--perdida)" }}>{o.resultado.toUpperCase()}</span>
                : <>
                  <button className="accion chico" onClick={() => cerrar(o.id, "ganada")}>Cerró bien</button>
                  <button className="accion chico" onClick={() => cerrar(o.id, "perdida")}>Cerró mal</button>
                </>}
            </div>
          </div>
          <dl className="opDatos">
            <div><dt>Tesis</dt><dd>{o.tesis}</dd></div>
            <div><dt>Catalizador</dt><dd>{o.catalizador}</dd></div>
            <div><dt>Si va en contra</dt><dd>{o.siBaja}</dd></div>
            <div><dt>Si va a favor</dt><dd>{o.siSube}</dd></div>
          </dl>
        </article>
      ))}

      <div className="borrarZona">
        {confirmando ? (
          <>
            <span className="pieEstado">Se borran las {ops.length} operaciones. No se puede deshacer.</span>
            <span>
              <button className="accion chico" onClick={() => setConfirmando(false)}>Mejor no</button>
              <button className="accion chico peligro" onClick={() => { onBorrarTodo(); setConfirmando(false); }}>Sí, borrar</button>
            </span>
          </>
        ) : (
          <button className="accion chico fantasma" onClick={() => setConfirmando(true)}>Borrar la bitácora</button>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  SHELL                                                              */
/* ================================================================== */

export default function App() {
  const [nivel, setNivel] = useState("medio");
  const [seccion, setSeccion] = useState("diagrama");
  const [ops, setOps] = useState([]);
  const [estado, setEstado] = useState({
    ticker: "SNDU", spot: 50, dte: 30, iv: 55, estrategia: "csp", legs: ESTRATEGIAS.csp.legs(50),
  });
  const [cargado, setCargado] = useState(false);
  const [guardado, setGuardado] = useState("listo"); // listo | guardando | error

  /* --- carga inicial --- */
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [bit, prefs] = await Promise.all([leer(CLAVE_BITACORA), leer(CLAVE_PREFS)]);
      if (!vivo) return;
      if (Array.isArray(bit)) setOps(bit);
      if (prefs?.nivel && NIVELES[prefs.nivel]) setNivel(prefs.nivel);
      if (prefs?.estado?.legs?.length && ESTRATEGIAS[prefs.estado.estrategia]) setEstado(prefs.estado);
      setCargado(true);
    })();
    return () => { vivo = false; };
  }, []);

  /* --- guardado de la bitácora --- */
  useEffect(() => {
    if (!cargado) return;
    setGuardado("guardando");
    const t = setTimeout(async () => {
      try { await escribir(CLAVE_BITACORA, ops); setGuardado("listo"); }
      catch { setGuardado("error"); }
    }, 400);
    return () => clearTimeout(t);
  }, [ops, cargado]);

  /* --- guardado de preferencias y último diagrama --- */
  useEffect(() => {
    if (!cargado) return;
    const t = setTimeout(() => {
      escribir(CLAVE_PREFS, { nivel, estado }).catch(() => setGuardado("error"));
    }, 600);
    return () => clearTimeout(t);
  }, [nivel, estado, cargado]);

  const borrarBitacora = async () => {
    setOps([]);
    try { await escribir(CLAVE_BITACORA, []); } catch { setGuardado("error"); }
  };

  const cfg = NIVELES[nivel];
  const visibles = cfg.secciones;

  const cambiarNivel = (n) => {
    setNivel(n);
    if (!NIVELES[n].secciones.includes(seccion)) setSeccion("diagrama");
    if (!NIVELES[n].estrategias.includes(estado.estrategia)) {
      const p = NIVELES[n].estrategias[0];
      setEstado((e) => ({ ...e, estrategia: p, legs: ESTRATEGIAS[p].legs(e.spot) }));
    }
  };

  const elegirEstrategia = (k) => {
    setEstado((e) => ({ ...e, estrategia: k, legs: ESTRATEGIAS[k].legs(e.spot) }));
    setSeccion("diagrama");
  };

  const guardarOp = (f) => { setOps((o) => [{ ...f, id: Date.now(), resultado: null }, ...o]); setSeccion("bitacora"); };

  return (
    <div className="app">
      <style>{CSS}</style>

      <nav className="nav">
        <div className="marca">
          <div className="marcaNom">Mesa</div>
          <div className="marcaSub">Opciones · taller</div>
        </div>
        <ul className="navLista">
          {visibles.map((k) => (
            <li key={k}>
              <button className="navBtn" aria-current={seccion === k} onClick={() => setSeccion(k)}>
                <span className="navNum">{SECCIONES[k].num}</span>
                <span className="navEtq">{SECCIONES[k].etq}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="navPie">
          <span className="etq">Tu nivel</span>
          <div className="niveles">
            {Object.entries(NIVELES).map(([k, v]) => (
              <button key={k} className="nivelBtn" aria-pressed={nivel === k} onClick={() => cambiarNivel(k)}>{v.etq}</button>
            ))}
          </div>
          <p className="navLema">{cfg.lema}</p>
          <div className={`sync sync-${guardado}`}>
            <i className="syncPunto" />
            {!cargado ? "Cargando" : guardado === "guardando" ? "Guardando" : guardado === "error" ? "No se guardó" : "Todo guardado"}
          </div>
        </div>
      </nav>

      <main className="main">
        <header className="cabecera">
          <div>
            <h1 className="titulo">{SECCIONES[seccion].etq}</h1>
            <div className="subtitulo">{SECCIONES[seccion].desc}</div>
          </div>
          <div className="sello">{SECCIONES[seccion].num} / {String(visibles.length).padStart(2, "0")}</div>
        </header>

        {seccion === "aprender" && <Aprender nivel={nivel} />}
        {seccion === "diagrama" && <Diagrama nivel={nivel} estado={estado} setEstado={setEstado} onGuardar={() => setSeccion("checklist")} />}
        {seccion === "estrategias" && <Estrategias nivel={nivel} onElegir={elegirEstrategia} />}
        {seccion === "checklist" && <Checklist estado={estado} onGuardar={guardarOp} />}
        {seccion === "bitacora" && <Bitacora ops={ops} setOps={setOps} cargado={cargado} onBorrarTodo={borrarBitacora} />}

        <p className="aviso">
          Herramienta de estudio. Los diagramas muestran el resultado al vencimiento, sin valor temporal previo,
          comisiones, dividendos ni asignación anticipada. No es una recomendación de inversión.
        </p>
      </main>

      <nav className="tabs">
        {visibles.map((k) => (
          <button key={k} className="tabBtn" aria-current={seccion === k} onClick={() => setSeccion(k)}>
            <span className="tabNum">{SECCIONES[k].num}</span>{SECCIONES[k].etq}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ================================================================== */
/*  ESTILOS                                                            */
/* ================================================================== */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500&display=swap');

.app{
  --papel:#E4E8EC; --papel2:#F2F5F7; --tinta:#16202B;
  --tinta60:#16202B99; --tinta35:#16202B59; --linea:#16202B26;
  --ganancia:#0E7C6B; --perdida:#B0402C; --marca:#C08416;
  background:var(--papel); color:var(--tinta);
  font-family:'IBM Plex Sans',system-ui,sans-serif;
  display:grid; grid-template-columns:212px minmax(0,1fr);
  min-height:100vh; box-sizing:border-box;
}
.app *{box-sizing:border-box;}

/* ---- navegación lateral ---- */
.nav{
  background:var(--tinta); color:var(--papel2);
  display:flex; flex-direction:column; padding:22px 0 18px;
  position:sticky; top:0; height:100vh;
}
.marca{padding:0 18px 20px; border-bottom:1px solid #F2F5F71F;}
.marcaNom{font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:700;
  font-size:23px; letter-spacing:.16em; text-transform:uppercase;}
.marcaSub{font-family:'IBM Plex Mono',monospace; font-size:9px;
  letter-spacing:.18em; text-transform:uppercase; opacity:.55; margin-top:5px;}
.navLista{list-style:none; margin:14px 0 0; padding:0; flex:1;}
.navBtn{
  width:100%; display:flex; align-items:baseline; gap:10px;
  background:none; border:none; border-left:3px solid transparent;
  padding:11px 18px; color:#F2F5F7A6; cursor:pointer; text-align:left;
  font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600;
  font-size:14px; letter-spacing:.06em; text-transform:uppercase;
}
.navBtn:hover{color:var(--papel2); background:#F2F5F70D;}
.navBtn[aria-current="true"]{color:var(--papel2); border-left-color:var(--marca); background:#F2F5F714;}
.navBtn:focus-visible{outline:2px solid var(--marca); outline-offset:-2px;}
.navNum{font-family:'IBM Plex Mono',monospace; font-size:9.5px; opacity:.5;}
.navPie{padding:16px 18px 0; border-top:1px solid #F2F5F71F;}
.navPie .etq{color:#F2F5F78C;}
.niveles{display:flex; flex-direction:column; gap:1px; margin-top:8px; background:#F2F5F726;}
.nivelBtn{
  font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.14em;
  text-transform:uppercase; padding:8px 10px; text-align:left;
  background:var(--tinta); border:none; color:#F2F5F78C; cursor:pointer;
}
.nivelBtn:hover{color:var(--papel2);}
.nivelBtn[aria-pressed="true"]{background:var(--marca); color:var(--tinta); font-weight:600;}
.nivelBtn:focus-visible{outline:2px solid var(--marca); outline-offset:-2px;}
.navLema{font-size:11px; line-height:1.5; color:#F2F5F773; margin:12px 0 0;}

/* ---- barra inferior (móvil) ---- */
.tabs{display:none;}

/* ---- contenido ---- */
.main{padding:26px 26px 34px; min-width:0;}
.cabecera{display:flex; align-items:flex-end; justify-content:space-between;
  gap:18px; border-bottom:1.5px solid var(--tinta); padding-bottom:13px; margin-bottom:22px;}
.titulo{font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:700; font-size:29px;
  line-height:1; letter-spacing:.055em; text-transform:uppercase; margin:0;}
.subtitulo{font-family:'IBM Plex Mono',monospace; font-size:10.5px;
  letter-spacing:.12em; text-transform:uppercase; color:var(--tinta60); margin-top:7px;}
.sello{font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.14em; color:var(--tinta35);}

.grilla{display:grid; grid-template-columns:290px minmax(0,1fr); gap:22px; align-items:start;}
.columnaAncha{max-width:900px;}
.columnaMedia{max-width:600px;}
.intro{font-size:14px; line-height:1.6; color:var(--tinta60); max-width:62ch; margin:0 0 22px;
  border-left:2px solid var(--marca); padding-left:12px;}

/* ---- bloques ---- */
.bloque{background:var(--papel2); border:1.5px solid var(--tinta);}
.bloque + .bloque{margin-top:18px;}
.bloqueTit{font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.16em;
  text-transform:uppercase; padding:8px 12px; background:var(--tinta); color:var(--papel2);
  display:flex; justify-content:space-between; align-items:center;}
.bloqueCuerpo{padding:13px 12px;}

.campo{display:block; margin-bottom:12px;}
.campo:last-child{margin-bottom:0;}
.etq{display:block; font-family:'IBM Plex Mono',monospace; font-size:9.5px;
  letter-spacing:.13em; text-transform:uppercase; color:var(--tinta60); margin-bottom:5px;}
input,select,textarea{width:100%; background:transparent; border:none;
  border-bottom:1.5px solid var(--tinta35); font-family:'IBM Plex Mono',monospace;
  font-size:14px; color:var(--tinta); padding:4px 2px; border-radius:0;
  -webkit-appearance:none; appearance:none; resize:vertical;}
textarea{font-family:'IBM Plex Sans',sans-serif; font-size:13.5px; line-height:1.5;}
input::placeholder,textarea::placeholder{color:var(--tinta35);}
input:focus,select:focus,textarea:focus{outline:none; border-bottom-color:var(--marca);}
input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--marca); outline-offset:3px;}
.fila2{display:grid; grid-template-columns:1fr 1fr; gap:12px;}
.fila3{display:grid; grid-template-columns:1fr 1fr 1fr; gap:9px;}
.nota{font-size:12.5px; line-height:1.55; color:var(--tinta60);
  border-left:2px solid var(--marca); padding-left:9px; margin-top:13px;}

.leg{border-top:1px dashed var(--tinta35); padding-top:11px; margin-top:11px;}
.leg:first-child{border-top:none; padding-top:0; margin-top:0;}
.legTit{display:flex; justify-content:space-between; align-items:center; gap:8px;
  font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600; font-size:13px;
  letter-spacing:.04em; text-transform:uppercase; margin-bottom:8px;}
.legTag{font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.1em;
  padding:3px 6px; color:var(--papel2); border:none;}
button.legTag{cursor:pointer;}
.quitar{background:none; border:none; color:var(--tinta35); cursor:pointer; font-size:15px; padding:0 2px;}
.quitar:hover{color:var(--perdida);}
.agregar{display:flex; gap:7px; margin-top:14px; padding-top:12px; border-top:1px solid var(--linea);}
.agregarBtn{flex:1; font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.1em;
  text-transform:uppercase; padding:7px 4px; background:transparent;
  border:1px solid var(--tinta35); color:var(--tinta60); cursor:pointer;}
.agregarBtn:hover{border-color:var(--tinta); color:var(--tinta);}

/* ---- gráfico ---- */
.lienzo{border:1.5px solid var(--tinta); background:var(--papel2);}
svg{display:block; width:100%; height:auto; touch-action:none;}
.ejeTxt{font-family:'IBM Plex Mono',monospace; font-size:10px; fill:var(--tinta60);}
.marcaTxt{font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.06em;}
.leyenda{display:flex; gap:20px; flex-wrap:wrap; padding:10px 14px; border-top:1px solid var(--linea);
  font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.08em;
  text-transform:uppercase; color:var(--tinta60);}
.swatch{display:inline-block; width:11px; height:11px; margin-right:6px; vertical-align:-1px;}

/* ---- métricas ---- */
.metricas{display:grid; grid-template-columns:1fr 1fr;}
.met{padding:11px 12px; border-top:1px solid var(--linea); border-right:1px solid var(--linea);}
.met:nth-child(2n){border-right:none;}
.met:nth-child(1),.met:nth-child(2){border-top:none;}
.metEtq{font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.11em;
  text-transform:uppercase; color:var(--tinta60);}
.metVal{font-family:'IBM Plex Mono',monospace; font-weight:500; font-size:19px; margin-top:4px;}
.metPie{font-family:'IBM Plex Mono',monospace; font-size:9.5px; color:var(--tinta35); margin-top:2px;}
.esc{display:grid; grid-template-columns:1fr 1fr 1fr;}
.escCol{padding:12px; border-right:1px solid var(--linea); text-align:center;}
.escCol:last-child{border-right:none;}
.escEtq{font-size:11px; color:var(--tinta60); line-height:1.4; min-height:31px;}
.escSub{font-family:'IBM Plex Mono',monospace; font-size:10px; color:var(--tinta35);}
.escVal{font-family:'IBM Plex Mono',monospace; font-size:18px; font-weight:500; margin-top:6px;}
.gest{display:flex;}
.gestCol{flex:1; padding:12px; border-right:1px solid var(--linea);}
.gestCol:last-child{border-right:none;}

/* ---- botones ---- */
.accion{font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.12em;
  text-transform:uppercase; padding:8px 12px; margin-top:6px;
  background:var(--tinta); border:none; color:var(--papel2); cursor:pointer;}
.accion:hover{background:var(--marca); color:var(--tinta);}
.accion:disabled{background:var(--tinta35); cursor:not-allowed;}
.accion:focus-visible{outline:2px solid var(--marca); outline-offset:2px;}
.accion.grande{padding:12px 22px; font-size:11px;}
.accion.chico{padding:5px 9px; font-size:9px; margin:0 0 0 6px;}

/* ---- aprender ---- */
.leccion{background:var(--papel2); border:1.5px solid var(--tinta); margin-bottom:-1.5px;}
.leccionTit{width:100%; display:flex; align-items:center; gap:14px; background:none;
  border:none; padding:15px 16px; cursor:pointer; text-align:left; color:var(--tinta);
  font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600; font-size:16px;
  letter-spacing:.03em;}
.leccionTit:hover{background:#16202B0A;}
.leccionTit:focus-visible{outline:2px solid var(--marca); outline-offset:-2px;}
.leccionNum{font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--marca); font-weight:600;}
.leccionMas{margin-left:auto; font-family:'IBM Plex Mono',monospace; font-size:18px; color:var(--tinta35);}
.leccionCuerpo{margin:0; padding:0 16px 18px 46px; font-size:14px; line-height:1.65;
  color:var(--tinta60); max-width:70ch;}

/* ---- estrategias ---- */
.matriz{display:grid; grid-template-columns:150px 1fr 1fr; border:1.5px solid var(--tinta);
  background:var(--tinta); gap:1px; margin-bottom:26px;}
.mHead{background:var(--tinta); color:var(--papel2); padding:9px 12px;
  font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.13em; text-transform:uppercase;}
.mFila{background:var(--papel2); padding:14px 12px; font-family:'IBM Plex Sans Condensed',sans-serif;
  font-weight:600; font-size:13.5px; letter-spacing:.04em; text-transform:uppercase;}
.mCelda{background:var(--papel2); padding:11px 12px; display:flex; flex-wrap:wrap; gap:6px; align-items:flex-start;}
.mChip{font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.05em;
  padding:6px 9px; background:transparent; border:1px solid var(--tinta35);
  color:var(--tinta); cursor:pointer; display:inline-flex; align-items:center; gap:6px;}
.mChip:hover{background:var(--tinta); color:var(--papel2);}
.mChip:focus-visible{outline:2px solid var(--marca); outline-offset:2px;}
.alerta{width:6px; height:6px; background:var(--perdida); display:inline-block;}
.mVacia{color:var(--tinta35); font-family:'IBM Plex Mono',monospace; font-size:12px;}
.fichas{display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:14px;}
.ficha{background:var(--papel2); border:1.5px solid var(--tinta); padding:14px;}
.ficha h3{font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600; font-size:15px;
  letter-spacing:.04em; text-transform:uppercase; margin:0 0 7px;}
.fichaCuando{font-size:13px; line-height:1.55; color:var(--tinta60); margin:0 0 6px;}

/* ---- checklist / bitácora ---- */
.pie{display:flex; align-items:center; justify-content:space-between; gap:16px;
  margin-top:18px; flex-wrap:wrap;}
.pieEstado{font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.08em;
  text-transform:uppercase; color:var(--tinta60);}
.vacio{background:var(--papel2); border:1.5px dashed var(--tinta35); padding:38px 22px; text-align:center;}
.vacio p{margin:0; font-family:'IBM Plex Sans Condensed',sans-serif; font-weight:600;
  font-size:16px; letter-spacing:.04em;}
.vacioSub{margin-top:8px !important; font-family:'IBM Plex Sans',sans-serif !important;
  font-weight:400 !important; font-size:13.5px !important; color:var(--tinta60);}
.resumen{display:flex; gap:1px; background:var(--tinta); border:1.5px solid var(--tinta); margin-bottom:18px;}
.resumen > div{flex:1; background:var(--papel2); padding:12px 14px;}
.op{background:var(--papel2); border:1.5px solid var(--tinta); margin-bottom:14px;}
.opCab{display:flex; justify-content:space-between; align-items:center; gap:12px;
  padding:11px 14px; border-bottom:1px solid var(--linea); flex-wrap:wrap;}
.opCab strong{font-family:'IBM Plex Mono',monospace; font-size:15px; letter-spacing:.06em;}
.opEstr{font-size:12.5px; color:var(--tinta60); margin-left:6px;}
.opTag{font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.1em;
  padding:4px 8px; color:var(--papel2);}
.opDatos{display:grid; grid-template-columns:1fr 1fr; gap:0; margin:0;}
.opDatos > div{padding:10px 14px; border-right:1px solid var(--linea); border-top:1px solid var(--linea);}
.opDatos > div:nth-child(2n){border-right:none;}
.opDatos > div:nth-child(1),.opDatos > div:nth-child(2){border-top:none;}
.opDatos dt{font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.11em;
  text-transform:uppercase; color:var(--tinta60);}
.opDatos dd{margin:4px 0 0; font-size:13px; line-height:1.5;}

.sync{display:flex; align-items:center; gap:7px; margin-top:14px;
  font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.12em;
  text-transform:uppercase; color:#F2F5F773;}
.syncPunto{width:6px; height:6px; border-radius:50%; background:#F2F5F759; flex:none;}
.sync-listo .syncPunto{background:var(--ganancia);}
.sync-guardando .syncPunto{background:var(--marca);}
.sync-error{color:#F0A08C;}
.sync-error .syncPunto{background:var(--perdida);}

input[type=range]{-webkit-appearance:none; appearance:none; background:transparent;
  border:none; padding:0; height:20px; cursor:pointer;}
input[type=range]::-webkit-slider-runnable-track{height:2px; background:var(--tinta35);}
input[type=range]::-moz-range-track{height:2px; background:var(--tinta35);}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none; width:14px; height:14px;
  background:var(--marca); margin-top:-6px; border:1.5px solid var(--tinta);}
input[type=range]::-moz-range-thumb{width:14px; height:14px; background:var(--marca);
  border:1.5px solid var(--tinta); border-radius:0;}
input[type=range]:focus-visible{outline:2px solid var(--marca); outline-offset:4px;}

.swatchLinea{display:inline-block; width:14px; height:0; margin-right:6px; vertical-align:3px;
  border-top:2px dashed var(--marca);}
.tiempo{display:flex; align-items:center; gap:14px; padding:10px 14px; border-top:1px solid var(--linea);}
.tiempoEtq{font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.11em;
  text-transform:uppercase; color:var(--tinta60); white-space:nowrap;}
.tiempo input{flex:1;}
.tiempoVal{font-family:'IBM Plex Mono',monospace; font-size:13px; font-weight:500;
  min-width:62px; text-align:right;}

.griegas{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));}
.gri{padding:11px 12px; border-right:1px solid var(--linea); border-top:1px solid var(--linea);}
.gri:first-child{border-top:none;}
.gri:last-child{border-right:none;}

.borrarZona{display:flex; align-items:center; justify-content:space-between; gap:14px;
  flex-wrap:wrap; margin-top:22px; padding-top:16px; border-top:1px solid var(--linea);}
.accion.fantasma{background:transparent; border:1px solid var(--tinta35); color:var(--tinta60);}
.accion.fantasma:hover{border-color:var(--perdida); background:transparent; color:var(--perdida);}
.accion.peligro{background:var(--perdida);}
.accion.peligro:hover{background:var(--perdida); color:var(--papel2); opacity:.85;}

.aviso{margin-top:26px; font-family:'IBM Plex Mono',monospace; font-size:10px;
  line-height:1.7; letter-spacing:.05em; color:var(--tinta35);
  border-top:1px solid var(--linea); padding-top:12px; max-width:80ch;}

/* ---- responsive ---- */
@media (max-width:1000px){
  .grilla{grid-template-columns:1fr;}
}
@media (max-width:820px){
  .app{grid-template-columns:1fr; padding-bottom:60px;}
  .nav{position:static; height:auto; flex-direction:row; align-items:center;
    justify-content:space-between; padding:14px 16px; gap:14px; flex-wrap:wrap;}
  .marca{padding:0; border:none;}
  .navLista{display:none;}
  .navPie{padding:0; border:none; display:flex; align-items:center; gap:10px;}
  .navPie .etq{display:none;}
  .navLema{display:none;}
  .niveles{flex-direction:row; margin:0;}
  .tabs{display:flex; position:fixed; bottom:0; left:0; right:0; z-index:20;
    background:var(--tinta); border-top:1px solid #F2F5F726;}
  .tabBtn{flex:1; background:none; border:none; border-top:3px solid transparent;
    padding:9px 2px 10px; color:#F2F5F78C; cursor:pointer;
    font-family:'IBM Plex Mono',monospace; font-size:8.5px; letter-spacing:.06em;
    text-transform:uppercase; display:flex; flex-direction:column; align-items:center; gap:3px;}
  .tabBtn[aria-current="true"]{color:var(--papel2); border-top-color:var(--marca);}
  .tabNum{font-size:9px; opacity:.5;}
  .main{padding:20px 16px 30px;}
  .titulo{font-size:23px;}
  .matriz{grid-template-columns:1fr; }
  .mHead:first-child{display:none;}
  .opDatos{grid-template-columns:1fr;}
  .opDatos > div{border-right:none; border-top:1px solid var(--linea);}
  .opDatos > div:nth-child(2){border-top:1px solid var(--linea);}
}
@media (prefers-reduced-motion:reduce){*{transition:none !important; animation:none !important;}}
`;
