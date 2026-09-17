/* ══════════════════════════════════════════════════════════════
   VeraTrack DEMO — Centro de Control (mapa en vivo)

   Nota de rendimiento: esta pantalla está pensada para estar horas
   encendida en la pantalla táctil del stand. Por eso NADA se
   reconstruye entero en cada tick: la lista, la ficha y los
   marcadores se crean una vez y después solo se les cambian los
   valores que de verdad han cambiado.
   ══════════════════════════════════════════════════════════════ */

(function () {
  const VT = window.VT;
  const BAND = VT.TEMP;             // banda obligatoria 8–12 °C (data.js)
  const $ = s => document.querySelector(s);

  /* ── Mapa base (OSM estándar, como VeraTrack) ── */
  const map = L.map('map', {
    zoomControl: true, attributionControl: true,
    maxBounds: [[27, -20], [52, 12]], maxBoundsViscosity: 0.8,
    minZoom: 5, maxZoom: 18,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 19,
    updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 4,
  }).addTo(map);
  map.fitBounds([[36.0, -9.5], [43.7, 3.3]]);
  map.zoomControl.setPosition('bottomleft');

  /* ── Cluster de vehículos parados (misma configuración que VeraTrack) ── */
  const clusterGroup = L.markerClusterGroup({
    // Ni spiderfy ni fitBounds de serie: el zoom al pulsar lo hacemos a mano
    // (ver 'clusterclick'). Como siempre se acerca por encima de
    // disableClusteringAtZoom, el grupo se deshace solo y no hacen falta patas.
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false,
    maxClusterRadius: function (zoom) {
      if (zoom < 7) return 24;
      if (zoom < 10) return 18;
      if (zoom < 13) return 12;
      return 8;
    },
    disableClusteringAtZoom: 14,
    spiderfyDistanceMultiplier: 1.15,
    removeOutsideVisibleBounds: true,
    animateAddingMarkers: false,
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      const anyAlert = cluster.getAllChildMarkers().some(m => m.options && m.options.hasAlert);
      return L.divIcon({
        html: `<div class="cluster-wrap"><div class="cluster-badge">${count}</div>${anyAlert ? '<div class="cluster-alert">!</div>' : ''}</div>`,
        className: 'leaflet-cluster-icon',
        iconSize: [32, 32],
      });
    },
  }).addTo(map);

  /* Al pulsar una agrupación: acercarse siempre, con vuelo.
     El fitBounds de serie no se mueve cuando los vehículos del grupo están
     casi en el mismo punto (una plataforma), y en la pantalla táctil parecía
     que el toque no hacía nada. Aquí se garantiza un mínimo de +2 niveles. */
  clusterGroup.on('clusterclick', e => {
    const b = e.layer.getBounds();
    const fit = map.getBoundsZoom(b, false, L.point(120, 120));
    const z = Math.min(map.getMaxZoom(), Math.max(map.getZoom() + 2, fit));
    map.flyTo(b.getCenter(), z, { duration: 0.8 });
    markInteraction();
  });

  /* ── Icono de vehículo ──
     El mismo furgón de perfil que usa VeraTrack (ico/furgon_verde|rojo.png,
     recortado y reducido a assets/img/van-*.png). La imagen se pone como
     background en CSS, no como <img>: así el estado (verde/rojo/alerta) se
     cambia solo con clases y el HTML del icono nunca se reescribe — importante
     porque Leaflet vuelve a crear el elemento al entrar/salir de un cluster.
     Al ser de perfil no se rota: se voltea si el vehículo va hacia el oeste. */
  const VAN_W = 38, VAN_H = 20;

  function truckHTML(v) {
    const flip = v.heading > 180 ? ' style="transform:scaleX(-1)"' : '';
    return `
      <div class="ring"></div>
      <div class="veh-face"${flip}><div class="veh-img"></div></div>
      <div class="veh-badge">!</div>`;
  }

  function statusClass(v) {
    if (v.tempAlert) return 'alert';
    if (v.state !== 'ruta' || v.speed < 3) return 'stopped';
    return 'moving';
  }

  const markers = {};      // id → L.marker
  const markerIn = {};     // id → 'map' | 'cluster'
  const speedHist = {};    // id → [] velocidades

  function vehicleMoving(v) { return v.state === 'ruta'; }

  function createMarkers() {
    VT.sim.vehicles.forEach(v => {
      const icon = L.divIcon({
        className: 'veh-marker ' + statusClass(v),
        html: truckHTML(v),
        // el ancla va en las ruedas, no en el centro: la caja es justo el furgón
        iconSize: [VAN_W, VAN_H], iconAnchor: [VAN_W / 2, VAN_H],
      });
      const m = L.marker([v.lat, v.lng], { icon, keyboard: false, hasAlert: !!v.tempAlert });
      m.on('click', () => selectVehicle(v.id, { pan: false }));
      m.on('dblclick', e => {
        // que el doble clic no lo cace también el zoom de serie del mapa
        L.DomEvent.stop(e.originalEvent || e);
        zoomToVehicle(v.id);
      });
      if (vehicleMoving(v)) {
        m.addTo(map); markerIn[v.id] = 'map';
      } else {
        clusterGroup.addLayer(m); markerIn[v.id] = 'cluster';
      }
      markers[v.id] = m;
      speedHist[v.id] = [];
    });
  }

  /* Vuelo en curso: mientras dura, animate() no recentra el mapa aunque haya
     un vehículo en seguimiento — un setView a mitad de vuelo lo aborta. */
  let flying = false;
  function flyMap(latlng, zoom, duration) {
    flying = true;
    map.once('moveend', () => { flying = false; });
    map.flyTo(latlng, zoom, { duration });
  }

  /* ── Interpolación de movimiento (suave entre ticks de 5 s) ── */
  let lastTickAt = performance.now();
  const lerpState = {};    // id → {aLat,aLng,bLat,bLng}

  function snapshotLerp() {
    lastTickAt = performance.now();
    VT.sim.vehicles.forEach(v => {
      lerpState[v.id] = { aLat: v.prevLat, aLng: v.prevLng, bLat: v.lat, bLng: v.lng };
    });
  }

  let rafLast = 0;
  function animate(now) {
    requestAnimationFrame(animate);
    if (now - rafLast < 66) return;          // ~15 fps, suficiente y ligero
    rafLast = now;

    const vs = VT.sim.vehicles;
    const t = Math.min(1, (now - lastTickAt) / (VT.TICK_S * 1000));
    // límites de pantalla con un margen: no vale la pena reposicionar lo que no se ve
    const b = map.getBounds().pad(0.2);
    const bN = b.getNorth(), bS = b.getSouth(), bE = b.getEast(), bW = b.getWest();
    let followLatLng = null;

    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      const s = lerpState[v.id];
      if (!s || (s.aLat === s.bLat && s.aLng === s.bLng)) continue;   // parado
      const lat = s.aLat + (s.bLat - s.aLat) * t;
      const lng = s.aLng + (s.bLng - s.aLng) * t;
      if (v.id === followId) followLatLng = [lat, lng];
      if (markerIn[v.id] !== 'map') continue;                         // dentro de un cluster
      if (lat < bS || lat > bN || lng < bW || lng > bE) continue;     // fuera de pantalla
      markers[v.id].setLatLng([lat, lng]);
    }

    if (followLatLng && !flying) {
      // recentrar solo si el camión se ha desplazado al menos un píxel:
      // a zoom bajo avanza menos de eso por fotograma y setView es caro.
      const p = map.latLngToContainerPoint(followLatLng);
      const size = map.getSize();
      if (Math.abs(p.x - size.x / 2) >= 1 || Math.abs(p.y - size.y / 2) >= 1) {
        map.setView(followLatLng, map.getZoom(), { animate: false });
      }
    }
  }
  requestAnimationFrame(animate);

  /* ══════════════════════════════════════════════════════════════
     Lista lateral — se construye una vez y se reordena/actualiza
     ══════════════════════════════════════════════════════════════ */
  let filter = 'all';
  let searchTxt = '';
  let selectedId = null;
  let followId = null;

  const cards = {};        // id → {root, speed, speedNum, stopped, temp, last}
  const listEl = $('#vlist');
  const countEl = $('#listCount');

  function matchesFilter(v) {
    if (filter === 'moving' && !(v.state === 'ruta' && v.speed > 3)) return false;
    if (filter === 'stopped' && v.state === 'ruta' && v.speed > 3) return false;
    if (filter === 'frigo' && !v.isFrigo) return false;
    if (filter === 'alert' && !v.tempAlert) return false;
    if (searchTxt) {
      const hay = `${v.plate} ${v.driver} ${v.cargo} ${v.corridorName}`.toLowerCase();
      if (!hay.includes(searchTxt)) return false;
    }
    return true;
  }

  /* Orden ESTABLE: alertas ▸ en ruta ▸ en muelle ▸ descanso ▸ taller ▸ matrícula.
     Antes se ordenaba por velocidad, que cambia cada tick: la lista se
     reordenaba entera cada 5 s y era imposible acertar a pulsar una tarjeta. */
  const STATE_RANK = { ruta: 0, carga: 1, descarga: 1, descanso: 2, taller: 3 };
  function byOrder(a, b) {
    return (b.tempAlert - a.tempAlert)
      || ((STATE_RANK[a.state] || 0) - (STATE_RANK[b.state] || 0))
      || (a.plate < b.plate ? -1 : a.plate > b.plate ? 1 : 0);
  }

  function buildCards() {
    const frag = document.createDocumentFragment();
    VT.sim.vehicles.forEach(v => {
      const glyph = v.isFrigo ? '❄' : (v.type === 'cisterna' ? '◍' : '▤');
      const root = document.createElement('div');
      root.className = 'vcard';
      root.dataset.id = v.id;
      root.innerHTML =
        `<div class="vicon" style="color:${v.isFrigo ? 'var(--cold)' : 'var(--olive-600)'}">${glyph}</div>` +
        `<div class="vmain"><div class="vplate"></div><div class="vsub"></div></div>` +
        `<div class="vdata">` +
          `<div class="vspeed"><span class="n"></span><small> km/h</small></div>` +
          `<div class="vstopped"></div>` +
          (v.isFrigo ? `<div class="vtemp"></div>` : '') +
        `</div>`;
      root.querySelector('.vplate').textContent = v.plate;
      root.querySelector('.vsub').textContent = `${v.driver} · ${v.cargo}`;
      cards[v.id] = {
        root,
        speed: root.querySelector('.vspeed'),
        speedNum: root.querySelector('.vspeed .n'),
        stopped: root.querySelector('.vstopped'),
        temp: root.querySelector('.vtemp'),
        last: {},
      };
      frag.appendChild(root);
    });
    listEl.appendChild(frag);
  }

  const STOP_TXT = { taller: 'TALLER', descanso: 'DESCANSO' };

  function updateCard(v) {
    const c = cards[v.id], L = c.last;
    const moving = v.state === 'ruta' && v.speed > 3;

    if (L.moving !== moving) {
      c.speed.hidden = !moving;
      c.stopped.hidden = moving;
      L.moving = moving;
    }
    if (moving) {
      const s = String(Math.round(v.speed));
      if (L.speed !== s) { c.speedNum.textContent = s; L.speed = s; }
    } else {
      const s = STOP_TXT[v.state] || 'PARADO';
      if (L.stop !== s) { c.stopped.textContent = s; L.stop = s; }
    }
    if (c.temp) {
      const s = v.temp.toFixed(1) + ' °C';
      if (L.temp !== s) { c.temp.textContent = s; L.temp = s; }
      if (L.hot !== v.tempAlert) { c.temp.classList.toggle('hot', !!v.tempAlert); L.hot = v.tempAlert; }
    }
    const sel = v.id === selectedId;
    if (L.sel !== sel) { c.root.classList.toggle('selected', sel); L.sel = sel; }
    const al = !!v.tempAlert;
    if (L.al !== al) { c.root.classList.toggle('alerting', al); L.al = al; }
  }

  function renderList() {
    const vs = VT.sim.vehicles.filter(matchesFilter).sort(byOrder);
    countEl.textContent = `${vs.length} de ${VT.sim.vehicles.length}`;

    // Reconciliación por clave: mueve los nodos que cambian de sitio,
    // inserta los que vuelven a pasar el filtro y saca los que no.
    let ref = listEl.firstChild;
    for (let i = 0; i < vs.length; i++) {
      const el = cards[vs[i].id].root;
      if (el === ref) ref = ref.nextSibling;
      else listEl.insertBefore(el, ref);
      updateCard(vs[i]);
    }
    while (ref) { const next = ref.nextSibling; listEl.removeChild(ref); ref = next; }
  }

  // Un único listener para las 50 tarjetas (antes se enganchaban 50 en cada tick)
  listEl.addEventListener('click', e => {
    const card = e.target.closest('.vcard');
    if (card) selectVehicle(card.dataset.id, { pan: true });
  });

  /* ── Selección + rastro ── */
  let trail = null;

  function selectVehicle(id, { pan }) {
    const v = VT.sim.vehicles.find(x => x.id === id);
    if (!v) return;
    selectedId = id;
    if (pan) {
      if (markerIn[id] === 'cluster') {
        // desagrupar hasta mostrar el vehículo (zoom + spiderfy si hace falta)
        try { clusterGroup.zoomToShowLayer(markers[id]); }
        catch (e) { flyMap([v.lat, v.lng], 12, 1.1); }
      } else {
        flyMap([v.lat, v.lng], Math.max(map.getZoom(), 9), 1.1);
      }
    }
    renderList();
    renderDetail(v);
    $('#vehDetail').classList.add('open');
    drawTrail(v);
    markInteraction();
  }

  /* Doble clic sobre un camión: zoom de calle encima de él.
     A ese zoom un vehículo en ruta cruza la pantalla en un par de minutos,
     así que el doble clic activa también el seguimiento y el camión se
     queda centrado (el botón de la ficha lo desactiva). */
  const CLOSE_ZOOM = 16;

  function zoomToVehicle(id) {
    const v = VT.sim.vehicles.find(x => x.id === id);
    if (!v) return;
    followId = vehicleMoving(v) ? id : null;
    selectVehicle(id, { pan: false });
    flyMap([v.lat, v.lng], Math.min(map.getMaxZoom(), CLOSE_ZOOM), 1.2);
  }

  function drawTrail(v) {
    const pts = v.history.length > 1 ? v.history : [[v.lat, v.lng]];
    if (trail) { trail.setLatLngs(pts); return; }
    trail = L.polyline(pts, {
      color: '#6A6B27', weight: 3, opacity: 0.75, dashArray: '1 7', lineCap: 'round',
    }).addTo(map);
  }

  function closeDetail() {
    selectedId = null; followId = null;
    $('#vehDetail').classList.remove('open');
    if (trail) { trail.remove(); trail = null; }
    renderList();
  }

  /* ══════════════════════════════════════════════════════════════
     Ficha de detalle — plantilla una vez por vehículo, luego valores
     ══════════════════════════════════════════════════════════════ */
  function destParts(v) {
    const parts = v.corridorName.split('(')[0].split('–').map(s => s.trim());
    return v.dir === 1 ? { from: parts[0], to: parts[1] } : { from: parts[1], to: parts[0] };
  }

  let detailId = null;     // vehículo cuya plantilla está montada
  let D = null;            // referencias a los nodos que cambian

  function renderDetail(v) {
    if (detailId !== v.id) buildDetail(v);
    updateDetail(v);
  }

  function buildDetail(v) {
    const el = $('#vehDetail');
    const tempCell = v.isFrigo ? `
      <div class="vd-cell">
        <div class="l">Temperatura carga</div>
        <div class="v cold" id="vdTemp"><span id="vdTempV"></span> <small id="vdTempSp"></small></div>
      </div>` : `
      <div class="vd-cell">
        <div class="l">Tipo de carga</div>
        <div class="v" style="font-size:15px" id="vdCargo"></div>
      </div>`;

    el.innerHTML = `
      <div class="vd-head">
        <div>
          <div class="vd-plate"><span id="vdPlate"></span> <span class="vd-flag" id="vdCountry"></span></div>
          <div style="font-size:13px;color:var(--text-3);margin-top:2px" id="vdModel"></div>
        </div>
        <span class="vd-state" id="vdState"></span>
        <button class="vd-close" id="vdClose">✕</button>
      </div>
      <div class="vd-body">
        <div class="vd-grid">
          <div class="vd-cell">
            <div class="l">Velocidad</div>
            <div class="v"><span id="vdSpeed"></span> <small>km/h</small></div>
          </div>
          ${tempCell}
          <div class="vd-cell">
            <div class="l">Chófer</div>
            <div class="v" style="font-size:15px" id="vdDriver"></div>
          </div>
          <div class="vd-cell">
            <div class="l">Ruta</div>
            <div class="v" style="font-size:14px" id="vdRoute"></div>
          </div>
          <div class="vd-cell">
            <div class="l">ETA destino</div>
            <div class="v"><span id="vdEta"></span> <small id="vdRest"></small></div>
          </div>
          <div class="vd-cell">
            <div class="l">Combustible</div>
            <div class="v"><span id="vdFuel"></span> <small>%</small></div>
          </div>
          <div class="vd-cell wide">
            <div class="l" id="vdSparkLbl"></div>
            <canvas class="vd-spark" id="vdSpark" width="680" height="112"></canvas>
          </div>
          <div class="vd-cell wide" style="display:flex;justify-content:space-between;padding:12px 16px">
            <span style="font-size:12.5px;color:var(--text-3)">Odómetro <b style="color:var(--text-2)" id="vdOdo"></b></span>
            <span style="font-size:12.5px;color:var(--text-3)">Hoy <b style="color:var(--text-2)" id="vdToday"></b></span>
          </div>
        </div>
        <div class="vd-actions">
          <button class="btn primary" id="vdFollow"></button>
        </div>
      </div>`;

    D = {
      state: el.querySelector('#vdState'),
      speed: el.querySelector('#vdSpeed'),
      temp: el.querySelector('#vdTemp'),
      tempV: el.querySelector('#vdTempV'),
      route: el.querySelector('#vdRoute'),
      eta: el.querySelector('#vdEta'),
      rest: el.querySelector('#vdRest'),
      fuel: el.querySelector('#vdFuel'),
      today: el.querySelector('#vdToday'),
      spark: el.querySelector('#vdSpark'),
      follow: el.querySelector('#vdFollow'),
      last: {},
    };

    // Partes que no cambian mientras la ficha siga siendo de este vehículo
    el.querySelector('#vdPlate').textContent = v.plate;
    el.querySelector('#vdCountry').textContent = v.country;
    el.querySelector('#vdModel').textContent = `${v.model} · ${v.typeLabel}`;
    el.querySelector('#vdDriver').textContent = v.driver;
    el.querySelector('#vdOdo').textContent = `${v.odo.toLocaleString('es-ES')} km`;
    el.querySelector('#vdSparkLbl').textContent =
      v.isFrigo ? 'Temperatura · última hora' : 'Velocidad · últimos minutos';
    if (v.isFrigo) el.querySelector('#vdTempSp').textContent = `rango ${BAND.label}`;
    else el.querySelector('#vdCargo').textContent = v.cargo;

    el.querySelector('#vdClose').addEventListener('click', closeDetail);
    D.follow.addEventListener('click', () => {
      const cur = VT.sim.vehicles.find(x => x.id === detailId);
      if (!cur) return;
      followId = followId === cur.id ? null : cur.id;
      if (followId) flyMap([cur.lat, cur.lng], Math.max(map.getZoom(), 11), 1);
      updateDetail(cur);
      markInteraction();
    });

    detailId = v.id;
  }

  const setTxt = (el, txt, store, key) => {
    if (store[key] !== txt) { el.textContent = txt; store[key] = txt; }
  };

  function updateDetail(v) {
    const L = D.last;
    const moving = v.state === 'ruta' && v.speed > 3;

    const stateCls = v.tempAlert ? 'alert' : (moving ? 'ok' : 'stop');
    if (L.stateCls !== stateCls) { D.state.className = 'vd-state ' + stateCls; L.stateCls = stateCls; }
    setTxt(D.state, v.tempAlert ? '⚠ ALERTA TEMPERATURA' : v.stateLabel, L, 'stateTxt');

    setTxt(D.speed, String(Math.round(v.speed)), L, 'speed');

    if (D.temp) {
      setTxt(D.tempV, `${v.temp.toFixed(1)} °C`, L, 'temp');
      if (L.hot !== v.tempAlert) {
        D.temp.className = 'v ' + (v.tempAlert ? 'hot' : 'cold');
        L.hot = v.tempAlert;
      }
    }

    const d = destParts(v);
    setTxt(D.route, `${d.from} → ${d.to}`, L, 'route');

    const remaining = v.state === 'ruta' ? (v.dir === 1 ? v.route.total - v.km : v.km) : 0;
    const etaMin = moving ? Math.round(remaining / Math.max(40, v.speed) * 60) : 0;
    setTxt(D.eta, moving
      ? new Date(Date.now() + etaMin * 60000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '—', L, 'eta');
    setTxt(D.rest, moving ? Math.round(remaining) + ' km' : '', L, 'rest');

    setTxt(D.fuel, String(v.fuel), L, 'fuel');
    setTxt(D.today, `${Math.round(v.todayKm)} km`, L, 'today');

    const following = followId === v.id;
    if (L.following !== following) {
      D.follow.className = 'btn primary' + (following ? ' following' : '');
      D.follow.textContent = following ? '◉ Dejar de seguir' : '◎ Seguir vehículo';
      L.following = following;
    }

    drawSpark(D.spark, v.isFrigo ? v.tempHist : speedHist[v.id],
      v.isFrigo ? { warnAbove: BAND.max, warnBelow: BAND.min } : {});
  }

  function drawSpark(canvas, data, opts = {}) {
    if (!canvas || !data || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, P = 8;
    ctx.clearRect(0, 0, W, H);
    const min = Math.min(...data), max = Math.max(...data);
    const span = (max - min) || 1;
    const x = i => P + (W - 2 * P) * i / (data.length - 1);
    const y = val => H - P - (H - 2 * P) * (val - min) / span;

    // umbrales de alarma (banda 8–12 °C): se dibujan los que caen en la escala
    const umbral = val => {
      if (val == null || val <= min || val >= max) return;
      ctx.strokeStyle = 'rgba(176,52,44,.55)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(P, y(val)); ctx.lineTo(W - P, y(val)); ctx.stroke();
      ctx.setLineDash([]);
    };
    umbral(opts.warnAbove); umbral(opts.warnBelow);
    // área
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(132,134,53,.28)'); grad.addColorStop(1, 'rgba(132,134,53,0)');
    ctx.beginPath(); ctx.moveTo(x(0), H - P);
    data.forEach((v2, i) => ctx.lineTo(x(i), y(v2)));
    ctx.lineTo(x(data.length - 1), H - P); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    // línea
    ctx.beginPath();
    data.forEach((v2, i) => i ? ctx.lineTo(x(i), y(v2)) : ctx.moveTo(x(i), y(v2)));
    ctx.strokeStyle = '#848635'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    // último punto
    ctx.beginPath(); ctx.arc(x(data.length - 1), y(data[data.length - 1]), 5, 0, 7);
    ctx.fillStyle = '#6A6B27'; ctx.fill();
  }

  /* ── Feed de eventos ── */
  const feedEl = $('#eventFeed');
  function pushEvents(events) {
    for (let i = 0; i < events.length && i < 3; i++) {
      const e = events[i];
      const div = document.createElement('div');
      div.className = 'event ' + e.type;
      div.innerHTML = `<span class="dot"></span><span></span>
        <span class="etime">${e.time.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>`;
      div.children[1].textContent = e.msg;
      feedEl.prepend(div);
      setTimeout(() => {
        div.style.transition = 'opacity .6s, transform .6s';
        div.style.opacity = '0'; div.style.transform = 'translateX(40px)';
        setTimeout(() => div.remove(), 650);
      }, e.type === 'alert' ? 14000 : 8000);
    }
    while (feedEl.children.length > 4) feedEl.lastChild.remove();
  }

  /* ── Tick: refrescar todo ── */
  const kEls = {
    moving: $('#kMoving'), stopped: $('#kStopped'), frigo: $('#kFrigo'),
    alerts: $('#kAlerts'), speed: $('#kSpeed'),
  };
  const kLast = {};
  let clusterDirty = false;

  function onTick(vehicles, newEvents) {
    snapshotLerp();

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const h = speedHist[v.id];
      h.push(Math.round(v.speed));
      if (h.length > 60) h.shift();

      const m = markers[v.id];
      if (!m) continue;

      // mover el marcador entre el mapa (en ruta) y el cluster (parado)
      const want = vehicleMoving(v) ? 'map' : 'cluster';
      if (markerIn[v.id] !== want) {
        if (markerIn[v.id] === 'cluster') clusterGroup.removeLayer(m);
        else map.removeLayer(m);
        m.setLatLng([v.lat, v.lng]);
        if (want === 'map') m.addTo(map);
        else clusterGroup.addLayer(m);
        markerIn[v.id] = want;
        clusterDirty = true;
      }

      const alert = !!v.tempAlert;
      if (m.options.hasAlert !== alert) {
        m.options.hasAlert = alert;
        if (want === 'cluster') clusterDirty = true;   // el globo "!" del cluster
      }

      const sel = selectedId === v.id;
      const st = statusClass(v);

      // mantener la clase en las opciones del icono: si Leaflet vuelve a crear
      // el elemento (al entrar/salir de un cluster) nace ya con el aspecto bueno
      const wantCls = st + (sel ? ' sel' : '');
      if (m.__cls !== wantCls) {
        m.options.icon.options.className = 'veh-marker ' + wantCls;
        m.__cls = wantCls;
      }

      const el = m.getElement();
      if (el) {
        // OJO: nunca asignar el className completo aquí, Leaflet guarda las suyas
        if (el.__st !== st) {
          if (el.__st) el.classList.remove(el.__st);
          else el.classList.remove('moving', 'stopped', 'alert');
          el.classList.add(st);
          el.__st = st;
        }
        if (el.__sel !== sel) { el.classList.toggle('sel', sel); el.__sel = sel; }
        const face = el.__face || (el.__face = el.querySelector('.veh-face'));
        // el furgón es de perfil mirando a la derecha: hacia el oeste se voltea
        const tr = (v.heading > 180 ? 'scaleX(-1)' : '') + (sel ? ' scale(1.25)' : '');
        // si no ha cambiado no se escribe: así no se relanza la transición
        // y el marcador no se vuelve a rasterizar
        if (face && el.__tr !== tr) { face.style.transform = tr; el.__tr = tr; }
      }

      const z = alert ? 1000 : (sel ? 800 : 0);
      if (m.__z !== z) { m.setZIndexOffset(z); m.__z = z; }
    }

    if (clusterDirty) { clusterGroup.refreshClusters(); clusterDirty = false; }

    // KPIs
    const k = VT.sim.kpis();
    setTxt(kEls.moving, String(k.moving), kLast, 'moving');
    setTxt(kEls.stopped, String(k.stopped), kLast, 'stopped');
    setTxt(kEls.frigo, String(k.frigo), kLast, 'frigo');
    setTxt(kEls.alerts, String(k.alerts), kLast, 'alerts');
    setTxt(kEls.speed, String(Math.round(k.avgSpeed)), kLast, 'speed');

    renderList();
    if (selectedId) {
      const v = vehicles.find(x => x.id === selectedId);
      if (v) { renderDetail(v); drawTrail(v); }
    }
    pushEvents(newEvents);
  }

  /* ── Filtros y búsqueda ── */
  $('#chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.f;
    renderList();
    markInteraction();
  });
  $('#search').addEventListener('input', e => {
    searchTxt = e.target.value.trim().toLowerCase();
    renderList();
    markInteraction();
  });

  /* ── Replegar panel ── */
  $('#panelToggle').addEventListener('click', () => {
    $('#sidePanel').classList.remove('hidden');
    $('#panelToggle').classList.remove('show');
  });
  $('#sidePanel').querySelector('.panel-title h2').addEventListener('dblclick', () => {
    $('#sidePanel').classList.add('hidden');
    $('#panelToggle').classList.add('show');
  });

  /* ── Modo presentación (atrae miradas si nadie toca la pantalla) ── */
  let lastInteraction = Date.now();
  let presentTimer = null;
  function markInteraction() { lastInteraction = Date.now(); stopPresentation(); }
  ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(ev =>
    window.addEventListener(ev, markInteraction, { passive: true }));

  function stopPresentation() {
    if (presentTimer) { clearInterval(presentTimer); presentTimer = null; }
  }
  function presentStep() {
    const vs = VT.sim.vehicles.filter(v => v.state === 'ruta' && v.speed > 10);
    if (!vs.length) return;
    const withAlert = vs.filter(v => v.tempAlert);
    const pool = withAlert.length ? withAlert : vs;
    const v = pool[Math.floor(Math.random() * pool.length)];
    selectedId = v.id;
    map.flyTo([v.lat, v.lng], 9 + Math.floor(Math.random() * 3), { duration: 2.4 });
    renderList();
    renderDetail(v);
    $('#vehDetail').classList.add('open');
    drawTrail(v);
    lastInteraction = Date.now();   // que no se reinicie a sí mismo
  }
  setInterval(() => {
    if (presentTimer || Date.now() - lastInteraction < 90000) return;
    presentStep();
    presentTimer = setInterval(presentStep, 18000);
  }, 5000);

  /* ── Arranque ── */
  (async function boot() {
    const bar = $('#loaderBar');
    await VT.sim.init((done, total) => { bar.style.width = Math.round(done / total * 100) + '%'; });
    createMarkers();
    buildCards();
    snapshotLerp();
    VT.sim.onTick(onTick);
    VT.sim.start();
    renderList();
    $('#loader').classList.add('done');
    setTimeout(() => $('#loader').remove(), 800);
  })();
})();
