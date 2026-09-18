/* ══════════════════════════════════════════════════════════════
   VeraTrack DEMO — Gestión de flota (vehículos y chóferes)
   ══════════════════════════════════════════════════════════════ */

(function () {
  const VT = window.VT;
  const $ = s => document.querySelector(s);

  const fleet = VT.buildFleet();
  let filter = 'all';
  let searchTxt = '';

  /* ── Datos derivados deterministas (ITV, mantenimiento, CAP…) ── */
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function futureDate(seed, minM, maxM) {
    const d = new Date();
    d.setMonth(d.getMonth() + minM + (seed % (maxM - minM + 1)));
    d.setDate(1 + (seed * 7) % 27);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  fleet.forEach((v, i) => {
    v.itv = futureDate(i + 3, 2, 11);
    v.nextService = 5000 + (i * 733) % 22000;      // km hasta próximo mantenimiento
    v.year = 2018 + (i % 8);
  });

  const AVATAR_COLORS = ['#848635', '#1E7556', '#B8700F', '#5AB0E8', '#A8AA5F', '#C98A1A', '#2B8F6B', '#85725E'];
  const drivers = fleet.map((v, i) => ({
    name: v.driver,
    truck: v.plate,
    color: AVATAR_COLORS[i % AVATAR_COLORS.length],
    phone: `+34 6${String(10 + (i * 37) % 90)} ${String(100 + (i * 53) % 900)} ${String(100 + (i * 71) % 900)}`,
    cap: futureDate(i + 11, 6, 40),
    hoursToday: v.state === 'ruta' ? (3 + (i % 6)) + ',' + ((i * 3) % 6) : 0,
    state: v.state === 'ruta' ? 'ok' : (v.state === 'descanso' ? 'rest' : 'off'),
    stateLabel: v.state === 'ruta' ? 'En ruta' : (v.state === 'descanso' ? 'Descanso' : 'Disponible'),
  }));

  /* ── KPIs cabecera ── */
  function renderStats() {
    const taller = fleet.filter(v => v.state === 'taller').length;
    $('#sTotal').textContent = fleet.length;
    $('#sDisp').textContent = Math.round((fleet.length - taller) / fleet.length * 100) + '%';
    $('#sFrigo').textContent = fleet.filter(v => v.isFrigo).length;
    $('#sDrivers').textContent = drivers.length;
  }

  /* ── Tarjetas de vehículo ── */
  function matches(v) {
    if (filter === 'frigo' && !v.isFrigo) return false;
    if (filter === 'seco' && v.isFrigo) return false;
    if (filter === 'ruta' && v.state !== 'ruta') return false;
    if (filter === 'taller' && v.state !== 'taller') return false;
    if (searchTxt) {
      const hay = `${v.plate} ${v.model} ${v.driver} ${v.cargo}`.toLowerCase();
      if (!hay.includes(searchTxt)) return false;
    }
    return true;
  }

  function badge(v) {
    if (v.state === 'taller') return '<span class="tc-badge taller">EN TALLER</span>';
    if (v.state === 'ruta') return '<span class="tc-badge ok">OPERATIVO</span>';
    return '<span class="tc-badge stop">' + (v.state === 'descanso' ? 'DESCANSO' : 'EN MUELLE') + '</span>';
  }

  function renderTrucks() {
    const vs = fleet.filter(matches);
    $('#truckCount').textContent = `· ${vs.length}`;
    $('#truckGrid').innerHTML = vs.map(v => `
      <div class="truck-card" data-id="${v.id}">
        <div class="tc-top">
          <span class="tc-plate">${v.plate}</span>
          <span class="vd-flag">${v.country}</span>
          ${badge(v)}
        </div>
        <div class="tc-model">${v.model} · ${v.year}</div>
        <span class="tc-type ${v.isFrigo ? 'frio' : ''}">${v.isFrigo ? '❄ ' : ''}${v.typeLabel}</span>
        <div class="tc-meta">
          <span>Chófer <b>${v.driver}</b></span>
          <span>Carga <b>${v.cargo}</b></span>
        </div>
        <div class="tc-meta">
          <span>ITV <b>${v.itv}</b></span>
          <span>Mant. <b>${v.nextService.toLocaleString('es-ES')} km</b></span>
          <span>Odóm. <b>${v.odo.toLocaleString('es-ES')} km</b></span>
        </div>
      </div>`).join('');

    document.querySelectorAll('.truck-card').forEach(el =>
      el.addEventListener('click', () => openDetail(el.dataset.id)));
  }

  /* ── Tarjetas de chófer ── */
  function renderDrivers() {
    const list = searchTxt
      ? drivers.filter(d => d.name.toLowerCase().includes(searchTxt) || d.truck.toLowerCase().includes(searchTxt))
      : drivers;
    $('#driverCount').textContent = `· ${list.length}`;
    $('#driverGrid').innerHTML = list.map(d => {
      const initials = d.name.split(' ').slice(0, 2).map(w => w[0]).join('');
      return `
        <div class="driver-card">
          <div class="avatar" style="background:${d.color}">${initials}</div>
          <div class="dmain">
            <div class="dname">${d.name}</div>
            <div class="dsub">${d.truck} · CAP hasta ${d.cap}</div>
            <div class="dsub">${d.phone}${d.hoursToday ? ` · ${d.hoursToday} h hoy` : ''}</div>
          </div>
          <span class="dstate ${d.state}">${d.stateLabel}</span>
        </div>`;
    }).join('');
  }

  /* ── Detalle de vehículo (modal) ── */
  function openDetail(id) {
    const v = fleet.find(x => x.id === id);
    if (!v) return;
    $('#modalDetailBody').innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
        <span class="tc-plate" style="font-size:24px">${v.plate}</span>
        <span class="vd-flag">${v.country}</span>
        ${badge(v)}
      </div>
      <div class="vd-grid">
        <div class="vd-cell"><div class="l">Modelo</div><div class="v" style="font-size:15px">${v.model}</div></div>
        <div class="vd-cell"><div class="l">Año</div><div class="v">${v.year}</div></div>
        <div class="vd-cell"><div class="l">Semirremolque</div><div class="v" style="font-size:15px">${v.typeLabel}</div></div>
        <div class="vd-cell"><div class="l">Carga habitual</div><div class="v" style="font-size:15px">${v.cargo}</div></div>
        <div class="vd-cell"><div class="l">Chófer</div><div class="v" style="font-size:15px">${v.driver}</div></div>
        <div class="vd-cell"><div class="l">Corredor</div><div class="v" style="font-size:13.5px">${v.corridorName}</div></div>
        <div class="vd-cell"><div class="l">Odómetro</div><div class="v">${v.odo.toLocaleString('es-ES')} <small>km</small></div></div>
        <div class="vd-cell"><div class="l">Próx. mantenimiento</div><div class="v">${v.nextService.toLocaleString('es-ES')} <small>km</small></div></div>
        <div class="vd-cell"><div class="l">ITV</div><div class="v" style="font-size:15px">${v.itv}</div></div>
        <div class="vd-cell"><div class="l">Combustible</div><div class="v">${v.fuel} <small>%</small></div></div>
      </div>
      <div class="actions">
        <button class="btn" id="btnCloseDetail">Cerrar</button>
        <a class="btn primary" href="index.html" style="text-decoration:none">Ver en el mapa</a>
      </div>`;
    $('#modalDetail').classList.add('open');
    $('#btnCloseDetail').addEventListener('click', () => $('#modalDetail').classList.remove('open'));
  }
  $('#modalDetail').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  /* ── Alta de vehículo (en memoria, para la demo) ── */
  const modalNew = $('#modalNew');
  $('#fModel').innerHTML = VT.MODELS.map(m => `<option>${m}</option>`).join('');
  $('#fDriver').innerHTML = VT.DRIVER_NAMES.map(n => `<option>${n}</option>`).join('');

  $('#btnNew').addEventListener('click', () => modalNew.classList.add('open'));
  $('#btnCancel').addEventListener('click', () => modalNew.classList.remove('open'));
  modalNew.addEventListener('click', e => {
    if (e.target === e.currentTarget) modalNew.classList.remove('open');
  });

  $('#btnSave').addEventListener('click', () => {
    const type = $('#fType').value;
    const isFrigo = type === 'frigo';
    const plate = $('#fPlate').value.trim().toUpperCase() || '0000 VRT';
    fleet.unshift({
      id: 'NEW' + Date.now(),
      plate, country: 'ES',
      model: $('#fModel').value,
      type, typeLabel: VT.TYPES[type].label, isFrigo,
      cargo: $('#fCargo').value.trim() || (isFrigo ? 'Flor cortada' : 'Retornables'),
      setpoint: isFrigo ? VT.TEMP.sp : null,
      driver: $('#fDriver').value,
      corridorName: 'Sin asignar', corridor: null,
      state: 'carga', stopPoint: null,
      fuel: 100, odo: 0, todayKm: 0,
      itv: futureDate(99, 10, 12), nextService: 30000, year: 2026,
    });
    modalNew.classList.remove('open');
    renderTrucks(); renderStats();
    showToast(`Vehículo ${plate} dado de alta correctamente ✓`);
  });

  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ── Filtros ── */
  $('#chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.f;
    renderTrucks();
  });
  $('#search').addEventListener('input', e => {
    searchTxt = e.target.value.trim().toLowerCase();
    renderTrucks(); renderDrivers();
  });

  renderStats();
  renderTrucks();
  renderDrivers();
})();
