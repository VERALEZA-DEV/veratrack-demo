/* ══════════════════════════════════════════════════════════════
   VeraTrack DEMO — Motor de simulación
   · Rutas reales por carretera (OSRM público, caché localStorage)
   · Movimiento interpolado, velocidad viva, temperaturas e incidencias
   ══════════════════════════════════════════════════════════════ */

(function () {
  const VT = window.VT;
  const BAND = VT.TEMP;             // banda obligatoria 8–12 °C (data.js)
  const TICK_S = 5;                 // los vehículos actualizan posición cada 5 s
  const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
  const CACHE_PREF = 'vt_demo_route_v2_';

  /* ────────────────────────────────────────────────
     Rutas: OSRM (geometría real de autovía) o respaldo
     ──────────────────────────────────────────────── */
  function buildRoute(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + VT.geo.distKm(pts[i - 1], pts[i]));
    }
    return { pts, cum, total: cum[cum.length - 1] };
  }

  async function fetchOSRM(corridor) {
    const key = CACHE_PREF + corridor.id;
    try {
      const cached = localStorage.getItem(key);
      if (cached) return buildRoute(JSON.parse(cached));
    } catch (e) { /* storage lleno o bloqueado: seguimos */ }

    const coords = corridor.pts.map(p => `${p[1].toFixed(4)},${p[0].toFixed(4)}`).join(';');
    const url = `${OSRM}${coords}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error('OSRM ' + res.status);
    const json = await res.json();
    if (!json.routes || !json.routes[0]) throw new Error('OSRM sin ruta');
    // GeoJSON es [lng,lat] → invertimos; simplificamos a ~1 de cada 2 puntos
    const raw = json.routes[0].geometry.coordinates;
    const pts = [];
    for (let i = 0; i < raw.length; i += 2) pts.push([+raw[i][1].toFixed(5), +raw[i][0].toFixed(5)]);
    pts.push([+raw[raw.length - 1][1].toFixed(5), +raw[raw.length - 1][0].toFixed(5)]);
    try { localStorage.setItem(key, JSON.stringify(pts)); } catch (e) { /* sin caché */ }
    return buildRoute(pts);
  }

  async function loadRoutes(onProgress) {
    const routes = {};
    let done = 0;
    // Peticiones en tandas de 4 para no saturar el servidor público
    const queue = VT.CORRIDORS.slice();
    async function worker() {
      while (queue.length) {
        const c = queue.shift();
        try {
          routes[c.id] = await fetchOSRM(c);
        } catch (e) {
          routes[c.id] = buildRoute(c.pts);   // respaldo: waypoints directos
        }
        done++;
        if (onProgress) onProgress(done, VT.CORRIDORS.length);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    return routes;
  }

  function pointAt(route, km) {
    const { pts, cum, total } = route;
    const k = Math.max(0, Math.min(km, total));
    // búsqueda binaria del segmento
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= k) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1e-9;
    const f = (k - cum[lo]) / seg;
    const lat = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f;
    const lng = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f;
    return { lat, lng, heading: VT.geo.bearing(pts[lo], pts[hi]) };
  }

  /* ────────────────────────────────────────────────
     Estado de simulación por vehículo
     ──────────────────────────────────────────────── */
  const STATE_LABEL = {
    ruta: 'En ruta', descanso: 'Descanso reglamentario', carga: 'Cargando',
    descarga: 'Descargando', taller: 'En taller',
  };

  function initVehicles(fleet, routes) {
    return fleet.map(v => {
      const route = routes[v.corridor];
      const sim = {
        ...v,
        route,
        km: v.prog * route.total,
        speed: v.state === 'ruta' ? v.baseSpeed : 0,
        targetSpeed: v.baseSpeed,
        slowTicks: 0,
        pauseTicks: 0,
        temp: v.isFrigo ? v.setpoint + (Math.random() * 1.2 - 0.6) : null,
        tempAlert: false,
        incident: null,          // {peak, phase}
        stateLabel: STATE_LABEL[v.state],
        lat: 0, lng: 0, heading: 0,
        prevLat: 0, prevLng: 0,
        history: [],             // rastro de posiciones [lat,lng]
        tempHist: [],            // últimas lecturas de temperatura
      };
      if (sim.state === 'ruta') {
        Object.assign(sim, pointAt(route, sim.km));
      } else {
        sim.lat = v.stopPoint.lat + (Math.random() - 0.5) * 0.0012;
        sim.lng = v.stopPoint.lng + (Math.random() - 0.5) * 0.0012;
        sim.heading = Math.floor(Math.random() * 360);
        sim.stateLabel = STATE_LABEL[v.state] + ' · ' + v.stopPoint.name;
      }
      sim.prevLat = sim.lat; sim.prevLng = sim.lng;
      if (sim.isFrigo) {
        for (let i = 0; i < 40; i++) {
          sim.tempHist.push(+(sim.setpoint + Math.sin(i / 5) * 0.5 + (Math.random() - 0.5) * 0.5).toFixed(1));
        }
      }
      return sim;
    });
  }

  /* ────────────────────────────────────────────────
     Tick (cada 5 s)
     ──────────────────────────────────────────────── */
  function tickVehicle(v, events) {
    v.prevLat = v.lat; v.prevLng = v.lng;

    if (v.state === 'ruta') {
      // velocidad viva: acercarse al objetivo con ruido
      if (v.slowTicks > 0) {
        v.slowTicks--;
        if (v.slowTicks === 0) { v.targetSpeed = v.baseSpeed; }
      } else if (Math.random() < 0.015) {
        // retención puntual
        v.targetSpeed = 25 + Math.random() * 30;
        v.slowTicks = 4 + Math.floor(Math.random() * 8);
        events.push({ type: 'info', msg: `${v.plate} · retención puntual, reduce a ${Math.round(v.targetSpeed)} km/h` });
      } else if (Math.random() < 0.3) {
        v.targetSpeed = v.baseSpeed + (Math.random() * 8 - 4);
      }
      v.speed += (v.targetSpeed - v.speed) * 0.4 + (Math.random() - 0.5) * 1.6;
      v.speed = Math.max(0, Math.min(94, v.speed));

      v.km += v.dir * v.speed * (TICK_S / 3600);
      v.todayKm += v.speed * (TICK_S / 3600);

      // fin de trayecto → pausa de descarga y vuelta
      if (v.km >= v.route.total || v.km <= 0) {
        v.km = Math.max(0, Math.min(v.km, v.route.total));
        v.state = 'descarga';
        v.stateLabel = 'Descargando · fin de trayecto';
        v.speed = 0;
        v.pauseTicks = 12 + Math.floor(Math.random() * 24);  // 1–3 min
        events.push({ type: 'ok', msg: `${v.plate} ha llegado a destino (${v.corridorName.split('(')[0].trim()})` });
      }
      const p = pointAt(v.route, v.km);
      v.lat = p.lat; v.lng = p.lng;
      if (v.speed > 3) v.heading = v.dir === 1 ? p.heading : (p.heading + 180) % 360;

      v.history.push([v.lat, v.lng]);
      if (v.history.length > 40) v.history.shift();

    } else if (v.pauseTicks > 0) {
      // parada temporal (descarga en destino) → reanudar en sentido inverso
      v.pauseTicks--;
      if (v.pauseTicks === 0) {
        v.dir *= -1;
        v.state = 'ruta';
        v.stateLabel = STATE_LABEL.ruta;
        v.targetSpeed = v.baseSpeed;
        events.push({ type: 'info', msg: `${v.plate} reanuda la marcha` });
      }
    }
    // vehículos parados "de plantilla" (descanso/carga/taller) permanecen quietos

    // temperatura frigorífica
    if (v.isFrigo) {
      const sp = v.setpoint;
      if (v.incident) {
        const d = v.incident.dir;                    // +1 se calienta · -1 se sobreenfría
        if (v.incident.phase === 'up') {
          v.temp += d * (0.35 + Math.random() * 0.3);
          if (d * (v.temp - v.incident.peak) >= 0) v.incident.phase = 'hold', v.incident.holdTicks = 8 + Math.floor(Math.random() * 10);
        } else if (v.incident.phase === 'hold') {
          v.temp += (Math.random() - 0.5) * 0.3;
          if (--v.incident.holdTicks <= 0) v.incident.phase = 'down';
        } else {
          v.temp -= d * (0.5 + Math.random() * 0.3);
          if (d * (v.temp - sp) <= 0.5) {
            v.incident = null;
            events.push({ type: 'ok', msg: `${v.plate} · temperatura restablecida (${v.temp.toFixed(1)} °C)` });
          }
        }
      } else {
        // sin avería el equipo de frío mantiene la carga dentro de banda
        v.temp += (sp - v.temp) * 0.25 + (Math.random() - 0.5) * 0.5;
        v.temp = Math.min(BAND.max - 0.3, Math.max(BAND.min + 0.3, v.temp));
      }
      const wasAlert = v.tempAlert;
      v.tempAlert = v.temp > BAND.max || v.temp < BAND.min;   // fuera de 8–12 °C → alarma
      if (v.tempAlert && !wasAlert) {
        const arriba = v.temp > BAND.max;
        events.push({
          type: 'alert',
          msg: `⚠ ${v.plate} · ${v.cargo}: ${v.temp.toFixed(1)} °C — ${arriba ? 'por encima' : 'por debajo'} del rango ${BAND.label}`,
        });
      }
      v.tempHist.push(+v.temp.toFixed(1));
      if (v.tempHist.length > 60) v.tempHist.shift();
    }

    // combustible baja lentamente
    if (v.speed > 5 && Math.random() < 0.1) v.fuel = Math.max(4, v.fuel - 1);
  }

  function maybeStartIncident(vehicles, events) {
    const active = vehicles.filter(v => v.incident).length;
    if (active >= 2 || Math.random() > 0.06) return;
    const candidates = vehicles.filter(v => v.isFrigo && !v.incident && v.state === 'ruta');
    if (!candidates.length) return;
    const v = candidates[Math.floor(Math.random() * candidates.length)];
    // 3 de cada 4 son subidas (avería del equipo); el resto, sobreenfriamiento
    v.incident = Math.random() < 0.75
      ? { dir:  1, phase: 'up', peak: BAND.max + 1.5 + Math.random() * 3.5 }
      : { dir: -1, phase: 'up', peak: BAND.min - 1.2 - Math.random() * 2.5 };
  }

  /* ────────────────────────────────────────────────
     API pública
     ──────────────────────────────────────────────── */
  VT.sim = {
    vehicles: [], events: [], ready: false,
    _timer: null, _listeners: [],

    async init(onProgress) {
      const routes = await loadRoutes(onProgress);
      this.vehicles = initVehicles(VT.buildFleet(), routes);
      this.ready = true;
      return this;
    },

    start() {
      if (this._timer) return;
      const doTick = () => {
        const newEvents = [];
        maybeStartIncident(this.vehicles, newEvents);
        this.vehicles.forEach(v => tickVehicle(v, newEvents));
        const now = new Date();
        newEvents.forEach(e => { e.time = now; this.events.unshift(e); });
        if (this.events.length > 80) this.events.length = 80;
        this._listeners.forEach(fn => fn(this.vehicles, newEvents));
      };
      doTick();
      this._timer = setInterval(doTick, TICK_S * 1000);
    },

    onTick(fn) { this._listeners.push(fn); },

    kpis() {
      const vs = this.vehicles;
      const moving = vs.filter(v => v.state === 'ruta' && v.speed > 3);
      const alerts = vs.filter(v => v.tempAlert);
      return {
        total: vs.length,
        moving: moving.length,
        stopped: vs.length - moving.length,
        frigo: vs.filter(v => v.isFrigo).length,
        alerts: alerts.length,
        avgSpeed: moving.length ? moving.reduce((s, v) => s + v.speed, 0) / moving.length : 0,
        kmToday: vs.reduce((s, v) => s + v.todayKm, 0),
      };
    },
  };

  VT.TICK_S = TICK_S;
  VT.STATE_LABEL = STATE_LABEL;
})();
