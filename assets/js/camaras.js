/* ══════════════════════════════════════════════════════════════
   VeraTrack DEMO — Cámaras frigoríficas (panel SCADA)

   Igual que el centro de control: las tarjetas se montan una vez y
   después solo se les cambian los valores. Además de ahorrar trabajo,
   así las transiciones CSS del gauge sí se ven (antes el elemento se
   recreaba cada tick y la aguja saltaba de golpe).
   ══════════════════════════════════════════════════════════════ */

(function () {
  const VT = window.VT;
  const BAND = VT.TEMP;             // banda obligatoria 8–12 °C (data.js)
  const $ = s => document.querySelector(s);
  const TICK_MS = 5000;

  /* ── Estado vivo de cada cámara ── */
  const cams = VT.CHAMBERS.map((c, i) => {
    const hist = [];
    for (let k = 0; k < 48; k++) {
      hist.push(+(c.sp + Math.sin(k / 6 + i) * 0.6 + (Math.random() - 0.5) * 0.5).toFixed(1));
    }
    return {
      ...c,
      temp: hist[hist.length - 1],
      hum: c.hum + Math.round((Math.random() - 0.5) * 4),
      door: false, doorTicks: 0,
      compressor: Math.random() > 0.4,
      defrost: `0${3 + (i % 4)}:${15 + i * 4}`.slice(-5),
      incident: null,
      hist,
      status: 'ok',
    };
  });

  const log = [];
  let logVersion = 0;
  function addLog(type, msg) {
    log.unshift({ t: new Date(), type, msg });
    if (log.length > 14) log.length = 14;
    logVersion++;
  }
  addLog('ok', 'Sistema de monitorización iniciado · 10 cámaras en línea');
  addLog('info', 'Desescarche programado de Cámara 2 completado');

  /* Incidencia guionizada a los ~25 s para que siempre haya algo que enseñar */
  setTimeout(() => {
    const c = cams[5]; // Cámara 5 · Fruta y verdura
    if (!c.incident) {
      c.incident = { dir: 1, phase: 'up', peak: c.max + 3.5 };
      addLog('warn', `${c.name}: deriva de temperatura detectada — comprobar evaporador`);
    }
  }, 25000);

  function tick() {
    let alarmName = null;
    cams.forEach(c => {
      // puerta: apertura aleatoria (entra una carretilla)
      if (!c.door && Math.random() < 0.02) {
        c.door = true;
        c.doorTicks = 2 + Math.floor(Math.random() * 4);
        addLog('info', `${c.name}: apertura de puerta registrada`);
      }
      if (c.door && --c.doorTicks <= 0) c.door = false;

      // incidencia aleatoria (máx. 1 simultánea además de la guionizada)
      if (!c.incident && Math.random() < 0.004 && cams.filter(x => x.incident).length < 2) {
        const arriba = Math.random() < 0.75;   // 3 de cada 4 son subidas
        c.incident = arriba
          ? { dir:  1, phase: 'up', peak: c.max + 2.5 + Math.random() * 2 }
          : { dir: -1, phase: 'up', peak: c.min - 1.5 - Math.random() * 2 };
        addLog('warn', `${c.name}: ${arriba ? 'subida' : 'bajada'} de temperatura anómala`);
      }

      // evolución de temperatura
      if (c.incident) {
        const d = c.incident.dir;                    // +1 sube · -1 sobreenfría
        if (c.incident.phase === 'up') {
          c.temp += d * (0.25 + Math.random() * 0.2);
          if (d * (c.temp - c.incident.peak) >= 0) { c.incident.phase = 'hold'; c.incident.holdTicks = 6 + Math.floor(Math.random() * 8); }
        } else if (c.incident.phase === 'hold') {
          c.temp += (Math.random() - 0.5) * 0.25;
          if (--c.incident.holdTicks <= 0) {
            c.incident.phase = 'down';
            addLog('info', `${c.name}: equipo de frío ${d > 0 ? 'forzado al 100 %' : 'reajustado'} — recuperando consigna`);
          }
        } else {
          c.temp -= d * (0.35 + Math.random() * 0.25);
          if (d * (c.temp - c.sp) <= 0.4) {
            c.incident = null;
            addLog('ok', `${c.name}: temperatura restablecida (${c.temp.toFixed(1)} °C)`);
          }
        }
      } else {
        const doorPush = c.door ? 0.35 : 0;
        c.temp += (c.sp - c.temp) * 0.3 + (Math.random() - 0.5) * 0.35 + doorPush;
        // sin avería el equipo mantiene la cámara dentro de banda: la
        // alarma solo puede venir de una incidencia real, no del ruido
        c.temp = Math.min(BAND.max - 0.15, Math.max(BAND.min + 0.15, c.temp));
      }

      // compresor: histéresis simple
      if (c.temp > c.sp + 0.5) c.compressor = true;
      else if (c.temp < c.sp - 0.5) c.compressor = false;
      if (c.incident) c.compressor = true;

      c.hum = Math.max(55, Math.min(97, c.hum + (Math.random() - 0.5) * 1.4));

      c.hist.push(+c.temp.toFixed(1));
      if (c.hist.length > 48) c.hist.shift();

      // estado · fuera de 8–12 °C = ALARMA; a menos de 0,5 °C del límite = aviso
      const prev = c.status;
      const fuera = c.temp > c.max || c.temp < c.min;
      c.status = fuera ? 'alert'
        : (c.temp > c.max - BAND.near || c.temp < c.min + BAND.near) ? 'warn' : 'ok';
      if (c.status === 'alert' && prev !== 'alert') {
        const arriba = c.temp > c.max;
        addLog('alert', `🔴 ALARMA · ${c.name}: ${c.temp.toFixed(1)} °C (permitido ${BAND.label}, ${arriba ? 'máximo' : 'mínimo'} superado)`);
      }
      if (c.status === 'alert') alarmName = c;
    });

    // banner superior
    const banner = $('#alertBanner');
    if (alarmName) {
      banner.classList.add('show');
      const arriba = alarmName.temp > alarmName.max;
      $('#alertBannerTxt').textContent =
        `ALARMA ACTIVA — ${alarmName.name} a ${alarmName.temp.toFixed(1)} °C, ${arriba ? 'por encima' : 'por debajo'} del rango ${BAND.label}. Equipo de frío forzado, notificación enviada al responsable de planta.`;
    } else {
      banner.classList.remove('show');
    }

    update();
  }

  /* ══════════════ Render: montaje único + actualización ══════════════ */
  const R = 54, CIRC = 2 * Math.PI * R;
  const W = 340, H = 74, P = 6;
  const STATUS_TXT = { ok: 'CORRECTO', warn: 'AVISO', alert: 'ALARMA' };
  const COLOR = { ok: 'var(--cold)', warn: 'var(--warn)', alert: 'var(--err)' };

  const view = {};   // id → refs de los nodos que cambian

  function build() {
    $('#camGrid').innerHTML = cams.map(c => `
      <div class="cam-card ok" data-id="${c.id}">
        <div class="cam-head">
          <div>
            <div class="cam-name"></div>
            <div class="cam-zone"></div>
          </div>
          <span class="cam-state ok"></span>
        </div>
        <div class="cam-main">
          <div class="gauge">
            <svg width="128" height="128" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r="${R}" fill="none" stroke="var(--bg-3)" stroke-width="11"/>
              <circle class="arc" cx="64" cy="64" r="${R}" fill="none" stroke-width="11"
                stroke-linecap="round" stroke-dasharray="0 ${CIRC.toFixed(1)}"
                style="transition: stroke-dasharray 1.2s ease, stroke .6s"/>
            </svg>
            <div class="gv">
              <div class="gt"></div>
              <div class="gs"></div>
            </div>
          </div>
          <div class="cam-side">
            <div class="cam-row"><span class="k">Rango permitido</span><span class="v rango"></span></div>
            <div class="cam-row"><span class="k">Humedad</span><span class="v hum"></span></div>
            <div class="cam-row"><span class="k">Puerta</span><span class="v door"></span></div>
            <div class="cam-row"><span class="k">Desescarche</span><span class="v defrost"></span></div>
          </div>
        </div>
        <svg class="cam-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <line class="lmax" x1="${P}" x2="${W - P}" stroke="rgba(176,52,44,.5)" stroke-dasharray="5 5" stroke-width="1.5"/>
          <line class="lmin" x1="${P}" x2="${W - P}" stroke="rgba(31,127,166,.45)" stroke-dasharray="5 5" stroke-width="1.5"/>
          <path class="area" stroke="none"/>
          <path class="line" fill="none" stroke-width="2.5" stroke-linejoin="round"/>
          <circle class="last" r="4"/>
        </svg>
        <div class="cam-foot">
          <span class="comp"><span class="comp-dot"></span><span class="comptxt"></span></span>
          <span style="margin-left:auto">Sonda S1 · lectura hace 5 s</span>
        </div>
      </div>`).join('');

    cams.forEach(c => {
      const root = $(`.cam-card[data-id="${c.id}"]`);
      const q = s => root.querySelector(s);
      // partes fijas
      q('.cam-name').textContent = c.name;
      q('.cam-zone').textContent = `${c.zone} · ${c.vol.toLocaleString('es-ES')} m³`;
      q('.gs').textContent = `consigna ${c.sp} °C`;
      q('.rango').textContent = `${c.min} / ${c.max} °C`;
      q('.defrost').textContent = `${c.defrost} h`;

      view[c.id] = {
        root,
        state: q('.cam-state'), arc: q('.arc'), gt: q('.gt'),
        hum: q('.hum'), door: q('.door'),
        lmax: q('.lmax'), lmin: q('.lmin'),
        area: q('.area'), line: q('.line'), last: q('.last'),
        dot: q('.comp-dot'), comptxt: q('.comptxt'),
        prev: {},
      };
    });
  }

  const setTxt = (el, txt, store, key) => {
    if (store[key] !== txt) { el.textContent = txt; store[key] = txt; }
  };
  const setAttr = (el, name, val, store, key) => {
    if (store[key] !== val) { el.setAttribute(name, val); store[key] = val; }
  };

  function updateCard(c) {
    const v = view[c.id], p = v.prev;
    const color = COLOR[c.status];

    if (p.status !== c.status) {
      v.root.className = 'cam-card ' + c.status;
      v.state.className = 'cam-state ' + c.status;
      v.state.textContent = STATUS_TXT[c.status];
      v.gt.style.color = color;
      p.status = c.status;
    }

    // gauge (la transición CSS hace el resto)
    const lo = c.min - 5, hi = c.max + 5;
    const pct = Math.max(0.03, Math.min(0.97, (c.temp - lo) / (hi - lo)));
    setAttr(v.arc, 'stroke-dasharray', `${(pct * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`, p, 'dash');
    setAttr(v.arc, 'stroke', color, p, 'arcColor');
    setTxt(v.gt, `${c.temp.toFixed(1)}°`, p, 'gt');

    setTxt(v.hum, `${Math.round(c.hum)} %`, p, 'hum');
    setTxt(v.door, c.door ? 'ABIERTA' : 'Cerrada', p, 'door');
    if (p.doorCls !== c.door) { v.door.className = 'v door ' + (c.door ? 'warn' : 'ok'); p.doorCls = c.door; }

    // sparkline
    const data = c.hist;
    const min = Math.min(...data, c.min) - 1, max = Math.max(...data, c.max) + 1;
    const x = i => P + (W - 2 * P) * i / (data.length - 1);
    const y = val => H - P - (H - 2 * P) * (val - min) / (max - min);
    const line = data.map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join('');
    const lineColor = c.status === 'alert' ? '#B0342C' : '#1E7FA6';

    const yMax = y(c.max).toFixed(1), yMin = y(c.min).toFixed(1);
    if (p.yMax !== yMax) { v.lmax.setAttribute('y1', yMax); v.lmax.setAttribute('y2', yMax); p.yMax = yMax; }
    if (p.yMin !== yMin) { v.lmin.setAttribute('y1', yMin); v.lmin.setAttribute('y2', yMin); p.yMin = yMin; }

    setAttr(v.area, 'd', `${line}L${x(data.length - 1).toFixed(1)},${H - P}L${x(0).toFixed(1)},${H - P}Z`, p, 'area');
    setAttr(v.area, 'fill', lineColor + '22', p, 'areaFill');
    setAttr(v.line, 'd', line, p, 'line');
    setAttr(v.line, 'stroke', lineColor, p, 'lineColor');
    setAttr(v.last, 'cx', x(data.length - 1).toFixed(1), p, 'cx');
    setAttr(v.last, 'cy', y(data[data.length - 1]).toFixed(1), p, 'cy');
    setAttr(v.last, 'fill', lineColor, p, 'lastFill');

    if (p.comp !== c.compressor) {
      v.dot.classList.toggle('on', c.compressor);
      v.comptxt.textContent = 'Compresor ' + (c.compressor ? 'en marcha' : 'en reposo');
      p.comp = c.compressor;
    }
  }

  const kpiLast = {};
  let logShown = -1;

  function update() {
    cams.forEach(updateCard);

    setTxt($('#kOk'), String(cams.filter(c => c.status === 'ok').length), kpiLast, 'ok');
    setTxt($('#kWarn'), String(cams.filter(c => c.status === 'warn').length), kpiLast, 'warn');
    setTxt($('#kAlarm'), String(cams.filter(c => c.status === 'alert').length), kpiLast, 'alarm');
    setTxt($('#kPower'), String(Math.round(cams.filter(c => c.compressor).length * 38.5 + 120)), kpiLast, 'power');

    // el registro solo se rehace cuando de verdad hay una entrada nueva
    if (logShown !== logVersion) {
      logShown = logVersion;
      $('#alertLog').innerHTML = log.map(e => `
        <div class="row">
          <span class="tm">${e.t.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
          <span class="dot" style="width:8px;height:8px;border-radius:50%;flex:none;background:var(--${e.type === 'alert' ? 'err' : e.type === 'warn' ? 'warn' : e.type === 'ok' ? 'ok' : 'info'})"></span>
          <span class="msg"></span>
        </div>`).join('');
      const rows = $('#alertLog').querySelectorAll('.row .msg');
      log.forEach((e, i) => { if (rows[i]) rows[i].textContent = e.msg; });
    }
  }

  build();
  update();
  setInterval(tick, TICK_MS);
})();
