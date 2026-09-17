/* ══════════════════════════════════════════════════════════════
   VeraTrack DEMO — Datos de ejemplo (sin backend)
   Flota, chóferes, corredores logísticos y cámaras frigoríficas
   ══════════════════════════════════════════════════════════════ */

const VT = window.VT = window.VT || {};

/* ── Corredores logísticos (ciudades vía → OSRM ruta real por autovía).
      Los waypoints sirven de guía para OSRM y de respaldo si no hay red. ── */
VT.CORRIDORS = [
  { id: 'mad-bcn', name: 'Madrid – Barcelona (A-2)', pts: [
    [40.4168,-3.7038],[40.6333,-3.1669],[41.1700,-2.4300],[41.3530,-1.6420],[41.6488,-0.8891],[41.5200,0.3500],[41.6176,0.6200],[41.5800,1.6200],[41.3874,2.1686]] },
  { id: 'mad-sev', name: 'Madrid – Sevilla (A-4)', pts: [
    [40.4168,-3.7038],[40.0300,-3.6000],[39.4700,-3.5300],[38.9900,-3.3700],[38.7600,-3.3800],[38.3700,-3.4800],[38.0900,-3.7700],[37.8882,-4.7794],[37.5400,-5.0800],[37.3891,-5.9845]] },
  { id: 'mad-val', name: 'Madrid – Valencia (A-3)', pts: [
    [40.4168,-3.7038],[40.0100,-3.0000],[39.5600,-1.8900],[39.4900,-1.1000],[39.4699,-0.3763]] },
  { id: 'mad-lis', name: 'Madrid – Lisboa (A-5/A6)', pts: [
    [40.4168,-3.7038],[39.9600,-4.8300],[39.8900,-5.5400],[39.4600,-5.8800],[38.9161,-6.3437],[38.8794,-6.9707],[38.8800,-7.1600],[38.8400,-7.5900],[38.6500,-8.2100],[38.7223,-9.1393]] },
  { id: 'mad-bio', name: 'Madrid – Bilbao (A-1)', pts: [
    [40.4168,-3.7038],[41.0300,-3.6100],[41.6700,-3.6900],[42.3439,-3.6969],[42.6900,-2.9400],[42.8467,-2.6716],[43.2630,-2.9350]] },
  { id: 'bcn-val', name: 'Barcelona – Valencia (AP-7)', pts: [
    [41.3874,2.1686],[41.1189,1.2445],[40.7100,0.5800],[39.9864,-0.0513],[39.6800,-0.2700],[39.4699,-0.3763]] },
  { id: 'val-mal', name: 'Valencia – Málaga (A-7)', pts: [
    [39.4699,-0.3763],[38.9800,-0.5200],[38.3452,-0.4810],[37.9922,-1.1307],[37.6700,-1.7000],[36.8340,-2.4637],[36.7500,-3.5200],[36.7213,-4.4214]] },
  { id: 'sev-alg', name: 'Sevilla – Algeciras (AP-4)', pts: [
    [37.3891,-5.9845],[36.6900,-6.1300],[36.1800,-5.6500],[36.1408,-5.4562]] },
  { id: 'lis-por', name: 'Lisboa – Porto (A1)', pts: [
    [38.7223,-9.1393],[39.2400,-8.6900],[39.7400,-8.8100],[40.2033,-8.4103],[40.6400,-8.6500],[41.1579,-8.6291]] },
  { id: 'por-vig', name: 'Porto – Vigo (A3/AP-9)', pts: [
    [41.1579,-8.6291],[41.5454,-8.4265],[42.0300,-8.6400],[42.2406,-8.7207]] },
  { id: 'vig-cor', name: 'Vigo – A Coruña (AP-9)', pts: [
    [42.2406,-8.7207],[42.4300,-8.6400],[42.8800,-8.5400],[43.3623,-8.4115]] },
  { id: 'mad-cor', name: 'Madrid – A Coruña (A-6)', pts: [
    [40.4168,-3.7038],[40.7800,-4.4200],[41.5000,-5.0000],[42.0000,-5.6800],[42.4600,-6.0500],[42.5500,-6.6000],[43.0097,-7.5567],[43.3623,-8.4115]] },
  { id: 'bio-bcn', name: 'Bilbao – Barcelona (AP-68/AP-2)', pts: [
    [43.2630,-2.9350],[42.6900,-2.9400],[42.4627,-2.4450],[42.0600,-1.6000],[41.6488,-0.8891],[41.5200,0.3500],[41.6176,0.6200],[41.3874,2.1686]] },
  { id: 'ruta-plata', name: 'Sevilla – Oviedo (A-66 Ruta de la Plata)', pts: [
    [37.3891,-5.9845],[38.4200,-6.4200],[38.9161,-6.3437],[39.4753,-6.3724],[40.0300,-6.0900],[40.9701,-5.6635],[41.5000,-5.7400],[42.0000,-5.6800],[42.5987,-5.5671],[43.3619,-5.8494]] },
  { id: 'zar-val', name: 'Zaragoza – Valencia (A-23)', pts: [
    [41.6488,-0.8891],[41.1100,-1.4100],[40.3457,-1.1065],[39.6800,-0.2700],[39.4699,-0.3763]] },
  { id: 'lis-far', name: 'Lisboa – Faro (A2)', pts: [
    [38.7223,-9.1393],[38.5300,-8.8900],[38.1700,-8.5600],[37.6500,-8.2200],[37.1300,-8.0200],[37.0194,-7.9304]] },
  { id: 'sev-far', name: 'Sevilla – Faro (A-49)', pts: [
    [37.3891,-5.9845],[37.2614,-6.9447],[37.2100,-7.4000],[37.1200,-7.6500],[37.0194,-7.9304]] },
  { id: 'mad-ali', name: 'Madrid – Alicante (A-31)', pts: [
    [40.4168,-3.7038],[39.7200,-3.0300],[38.9943,-1.8585],[38.8700,-1.1000],[38.6400,-0.8600],[38.3452,-0.4810]] },
  { id: 'sev-gra-mur', name: 'Sevilla – Murcia (A-92)', pts: [
    [37.3891,-5.9845],[37.0200,-4.5600],[37.1700,-4.1500],[37.1773,-3.5986],[37.3000,-3.1400],[37.4900,-2.7700],[37.5600,-1.8100],[37.9922,-1.1307]] },
  { id: 'san-mad', name: 'Santander – Madrid (A-67/A-62)', pts: [
    [43.4623,-3.8100],[43.0000,-4.1400],[42.7900,-4.2600],[42.0100,-4.5300],[41.6523,-4.7245],[40.9500,-4.1200],[40.4168,-3.7038]] },
  { id: 'por-sal', name: 'Porto – Salamanca (A25/A-62)', pts: [
    [41.1579,-8.6291],[40.6600,-7.9100],[40.5400,-7.2700],[40.6100,-6.8300],[40.6000,-6.5300],[40.9701,-5.6635]] },
  { id: 'bcn-gir', name: 'Barcelona – Girona – La Jonquera (AP-7)', pts: [
    [41.3874,2.1686],[41.7300,2.5700],[41.9794,2.8214],[42.2600,2.9600],[42.4200,2.8700]] },
];

/* ── Puntos de parada realistas (áreas de servicio, plataformas, talleres) ── */
VT.STOP_POINTS = [
  { name: 'Área de Servicio La Jonquera',      lat: 42.4160, lng: 2.8730,  kind: 'descanso' },
  { name: 'Plataforma Logística PLAZA (Zaragoza)', lat: 41.6120, lng: -1.0170, kind: 'carga' },
  { name: 'Mercamadrid',                        lat: 40.3520, lng: -3.6360, kind: 'carga' },
  { name: 'Mercabarna',                         lat: 41.3330, lng: 2.1130,  kind: 'descarga' },
  { name: 'Área de Servicio Bailén (A-4)',      lat: 38.0940, lng: -3.7750, kind: 'descanso' },
  { name: 'Puerto de Algeciras · Terminal TTI', lat: 36.1350, lng: -5.4390, kind: 'descarga' },
  { name: 'CT Benavente (A-6)',                 lat: 42.0080, lng: -5.6740, kind: 'descanso' },
  { name: 'MARL · Mercado Abastecedor Lisboa',  lat: 38.8290, lng: -9.1130, kind: 'descarga' },
  { name: 'Taller Oficial Scania Getafe',       lat: 40.3120, lng: -3.7180, kind: 'taller' },
  { name: 'Taller Volvo Trucks Antequera',      lat: 37.0350, lng: -4.5520, kind: 'taller' },
  { name: 'Área de Servicio Medinaceli (A-2)',  lat: 41.1650, lng: -2.4280, kind: 'descanso' },
  { name: 'Mercavalencia',                      lat: 39.4310, lng: -0.3560, kind: 'carga' },
];

/* ── Chóferes ── */
VT.DRIVER_NAMES = [
  'Antonio Delgado','María Ferreira','José Luis Cano','Carmen Ruano','Manuel Prieto',
  'Joana Almeida','Francisco Ortega','Lucía Barros','Rafael Medina','Tiago Sousa',
  'Isabel Montes','Andrés Caballero','Rosa Mari Gil','Nuno Carvalho','Sergio Pastor',
  'Elena Vidal','Paulo Menezes','Cristina Roca','Álvaro Serrano','Beatriz Lorenzo',
  'Juan Pedro Mora','Ana Rita Costa','Diego Fuentes','Marta Ibáñez','Rui Tavares',
  'Pablo Cordero','Silvia Marín','Hugo Esteban','Inês Rodrigues','Óscar Peña',
  'Laura Cifuentes','Miguel Ángel Soto','Sofía Navas','Bruno Machado','David Redondo',
  'Patricia Vega','Jorge Salas','Catarina Pinto','Raúl Herrero','Nerea Campos',
  'Vicente Aguilar','Teresa Molina','André Batista','Alicia Guerrero','Fernando Rey',
  'Mónica Sanz','Ismael Torres','Rocío Domínguez','Gonçalo Neves','Julia Bermejo',
];

/* ── Modelos de tractora / rígido ── */
VT.MODELS = [
  'Scania R450', 'Scania 500S', 'Volvo FH 460', 'Volvo FH Aero', 'Mercedes-Benz Actros L',
  'MAN TGX 18.470', 'DAF XF 480', 'DAF XG+', 'Renault Trucks T High', 'Iveco S-Way 490',
];

/* ── Tipos de semirremolque ── */
VT.TYPES = {
  frigo:   { label: 'Frigorífico',   icon: '❄' },
  lona:    { label: 'Lona / Tauliner', icon: '▤' },
  furgon:  { label: 'Furgón seco',   icon: '▢' },
  cisterna:{ label: 'Cisterna alimentaria', icon: '◍' },
};

/* ── Banda de temperatura de la cadena de frío ─────────────────
   Norma Veraleza: TODA la mercancía —camiones y cámaras— viaja y se
   almacena entre 8 y 12 °C. Cualquier lectura fuera de esa banda es
   ALARMA, tanto por exceso como por defecto. Único sitio donde se
   define: sim.js, camaras.js, flota.js y main.js leen de aquí. */
VT.TEMP = { min: 8, max: 12, sp: 10, near: 0.5 };
VT.TEMP.label = `${VT.TEMP.min}–${VT.TEMP.max} °C`;

/* ── Cargas típicas Veraleza ──
   Todas refrigeradas en la misma banda 8–12 °C: producto sensible al
   daño por frío, que por debajo de 8 °C también se estropea. */
VT.CARGO_FRIGO = [
  'Plátano de Canarias', 'Cítricos', 'Tomate', 'Pepino',
  'Calabacín', 'Berenjena', 'Pimiento', 'Judía verde',
  'Aguacate', 'Mango', 'Piña', 'Patata de consumo',
].map(name => ({ name, sp: VT.TEMP.sp }));
VT.CARGO_DRY = [
  'Aceite de oliva', 'Conservas vegetales', 'Vino embotellado', 'Cereal a granel',
  'Piensos', 'Almendra', 'Envases y palets', 'Fruta en fresco (ventilado)',
  'Aceituna de mesa', 'Mosto', 'Garrafas AOVE', 'Material de riego',
];

/* ── Matrículas ── */
const _ES_LETTERS = 'BCDFGHJKLMNPRSTVWXYZ';
function _plateES(seed) {
  const n = 1000 + ((seed * 733) % 9000);
  const l = i => _ES_LETTERS[(seed * (7 + i) + i * 13) % _ES_LETTERS.length];
  return `${n} ${l(0)}${l(1)}${l(2)}`;
}
function _platePT(seed) {
  const A = 'ABCDEFGHJLMNPRSTUVXZ';
  const l = i => A[(seed * (5 + i) + i * 11) % A.length];
  const n = 10 + ((seed * 37) % 90);
  return `${l(0)}${l(1)}-${n}-${l(2)}${l(3)}`;
}

/* ── Generación determinista de la flota (50 vehículos) ── */
function _mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

VT.buildFleet = function () {
  const rnd = _mulberry32(20260917);
  const fleet = [];
  const nCorr = VT.CORRIDORS.length;

  // Estados: 38 en ruta, 12 parados repartidos con motivo
  const stopped = [
    { st: 'descanso', n: 5 }, { st: 'carga', n: 3 }, { st: 'descarga', n: 2 }, { st: 'taller', n: 2 },
  ];
  const states = [];
  stopped.forEach(s => { for (let i = 0; i < s.n; i++) states.push(s.st); });
  while (states.length < 50) states.push('ruta');
  // Barajar estados de forma determinista
  for (let i = states.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [states[i], states[j]] = [states[j], states[i]];
  }

  for (let i = 0; i < 50; i++) {
    const isPT = i % 9 === 4;                       // ~6 matrículas portuguesas
    const isFrigo = i % 5 !== 1 && i % 5 !== 3;     // 30 frigoríficos
    const type = isFrigo ? 'frigo' : (i % 10 === 1 ? 'cisterna' : (i % 10 === 3 ? 'furgon' : 'lona'));
    const cargo = isFrigo
      ? VT.CARGO_FRIGO[i % VT.CARGO_FRIGO.length]
      : { name: VT.CARGO_DRY[i % VT.CARGO_DRY.length], sp: null };

    const corridor = VT.CORRIDORS[i % nCorr];
    const state = states[i];
    // Los parados se concentran en pocas plataformas para que se formen grupos (clusters)
    let stopPoint = null;
    if (state === 'taller') {
      const talleres = VT.STOP_POINTS.filter(p => p.kind === 'taller');
      stopPoint = talleres[i % talleres.length];
    } else if (state !== 'ruta') {
      const plataformas = VT.STOP_POINTS.filter(p => p.kind !== 'taller');
      stopPoint = plataformas[i % 4];
    }

    fleet.push({
      id: `V${String(i + 1).padStart(2, '0')}`,
      plate: isPT ? _platePT(i + 3) : _plateES(i + 7),
      country: isPT ? 'PT' : 'ES',
      model: VT.MODELS[i % VT.MODELS.length],
      type, typeLabel: VT.TYPES[type].label,
      isFrigo,
      cargo: cargo.name,
      setpoint: cargo.sp,
      driver: VT.DRIVER_NAMES[i],
      corridor: corridor.id,
      corridorName: corridor.name,
      dir: rnd() > 0.5 ? 1 : -1,                 // sentido de la marcha
      prog: rnd(),                               // progreso inicial 0..1
      baseSpeed: 76 + Math.floor(rnd() * 14),    // 76–89 km/h
      state,                                     // ruta | descanso | carga | descarga | taller
      stopPoint,
      fuel: 25 + Math.floor(rnd() * 70),         // % depósito
      odo: 120000 + Math.floor(rnd() * 680000),  // km totales
      todayKm: state === 'ruta' ? 120 + Math.floor(rnd() * 420) : Math.floor(rnd() * 160),
    });
  }
  return fleet;
};

/* ── Cámaras frigoríficas · Plataforma Logística Veraleza ──
   Todas comparten la banda única 8–12 °C de VT.TEMP. */
VT.CHAMBERS = [
  { id: 'C1',  name: 'Cámara 1 · Plátano A',       zone: 'Nave Norte',  hum: 85, vol: 2400 },
  { id: 'C2',  name: 'Cámara 2 · Plátano B',       zone: 'Nave Norte',  hum: 85, vol: 2400 },
  { id: 'C3',  name: 'Sala de maduración',         zone: 'Nave Norte',  hum: 90, vol: 620 },
  { id: 'C4',  name: 'Cámara 3 · Hortícola',       zone: 'Nave Centro', hum: 88, vol: 1800 },
  { id: 'C5',  name: 'Cámara 4 · Exóticos',        zone: 'Nave Centro', hum: 86, vol: 1500 },
  { id: 'C6',  name: 'Cámara 5 · Fruta y verdura', zone: 'Nave Sur',    hum: 90, vol: 3200 },
  { id: 'C7',  name: 'Cámara 6 · Cítricos',        zone: 'Nave Sur',    hum: 88, vol: 2800 },
  { id: 'C8',  name: 'Sala de trabajo IV gama',    zone: 'Nave Sur',    hum: 75, vol: 950 },
  { id: 'C9',  name: 'Antecámara · Muelle 1-4',    zone: 'Muelles',     hum: 72, vol: 1100 },
  { id: 'C10', name: 'Antecámara · Muelle 5-8',    zone: 'Muelles',     hum: 72, vol: 1100 },
].map(c => ({ ...c, sp: VT.TEMP.sp, min: VT.TEMP.min, max: VT.TEMP.max }));

/* ── Utilidades geográficas compartidas ── */
VT.geo = {
  distKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  },
  bearing(a, b) {
    const rad = Math.PI / 180;
    const y = Math.sin((b[1] - a[1]) * rad) * Math.cos(b[0] * rad);
    const x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) -
      Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos((b[1] - a[1]) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  },
};
