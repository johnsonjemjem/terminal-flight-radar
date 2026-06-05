/**
 * Terminal Flight GEM 💎 — app.js
 * Uses OpenSky Network (free, no key) + Aviation Stack fallback
 * Real-time ADS-B data streaming with terminal print effect
 */

'use strict';

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
const state = {
  currentFlight: null,
  autoRefreshTimer: null,
  queryCount: parseInt(sessionStorage.getItem('tfr-qcount') || '0'),
  lastFlightData: null,
  isLoading: false,
  routingsPlan: null,
  routingsPlanDate: null,
  radarSweepActive: true,
  sweepX: 0,
  sweepSpeed: 2,
  currentCanvasData: null,
  soundEnabled: true,
  volume: 0.3,
  activeWeatherCity: 'HND',
};

/* ══════════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const flightInput   = $('flight-input');
const trackBtn      = $('track-btn');
const refreshBtn    = $('refresh-btn');
const clearBtn      = $('clear-btn');
const autoToggle    = $('auto-refresh-toggle');
const cmdHistory    = $('cmd-history');
const resultStream  = $('result-stream');
const splash        = $('splash');
const flightResult  = $('flight-result');
const loadingOverlay = $('loading-overlay');
const loadingText   = $('loading-text');
const refreshIcon   = $('refresh-icon');
const clock         = $('clock');
const dateDisplay   = $('date-display');
const outputFlightId = $('output-flight-id');
const sbNet         = $('sb-net');
const sbData        = $('sb-data');
const sbMem         = $('sb-mem');
const statLastQuery = $('stat-last-query');
const statQueries   = $('stat-queries');
const statApi       = $('stat-api');
const routeCanvas   = $('route-canvas');

/* ══════════════════════════════════════════════
   CLOCK & MEMORY
══════════════════════════════════════════════ */
function updateClock() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Tokyo', day: '2-digit', month: 'short', year: 'numeric'
  }).toUpperCase().replace(/\s/g, '-') + ` (${now.toLocaleDateString('en-GB', { timeZone: 'Asia/Tokyo', weekday: 'short' }).toUpperCase()})`;

  const timeStr = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });

  if (dateDisplay) dateDisplay.textContent = dateStr;
  clock.textContent = timeStr;
}
updateClock();
setInterval(updateClock, 1000);

function updateMemDisplay() {
  sbMem.textContent = (performance && performance.memory) 
    ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} MB` 
    : '—';
}
setInterval(updateMemDisplay, 5000);
updateMemDisplay();

function incrementQuery() {
  state.queryCount++;
  sessionStorage.setItem('tfr-qcount', state.queryCount);
  statQueries.textContent = state.queryCount;
}
statQueries.textContent = state.queryCount;

/* ══════════════════════════════════════════════
   AIRLINE & AIRPORT DATABASES
══════════════════════════════════════════════ */
const AIRLINES = {
  AA: 'American Airlines',        UA: 'United Airlines',          DL: 'Delta Air Lines',          WN: 'Southwest Airlines',
  B6: 'JetBlue Airways',          AS: 'Alaska Airlines',          NK: 'Spirit Airlines',          F9: 'Frontier Airlines',
  G4: 'Allegiant Air',            HA: 'Hawaiian Airlines',        BA: 'British Airways',          LH: 'Lufthansa',
  AF: 'Air France',               KL: 'KLM Royal Dutch',          IB: 'Iberia',                   AZ: 'ITA Airways',
  SK: 'Scandinavian Airlines',    AY: 'Finnair',                  LX: 'Swiss International',      OS: 'Austrian Airlines',
  TK: 'Turkish Airlines',         EK: 'Emirates',                 EY: 'Etihad Airways',           QR: 'Qatar Airways',
  SQ: 'Singapore Airlines',       CX: 'Cathay Pacific',           NH: 'All Nippon Airways',       JL: 'Japan Airlines',
  KE: 'Korean Air',               OZ: 'Asiana Airlines',          QF: 'Qantas',                   NZ: 'Air New Zealand',
  CA: 'Air China',                MU: 'China Eastern',            CZ: 'China Southern',           AI: 'Air India',
  SU: 'Aeroflot',                 AC: 'Air Canada',               AM: 'Aeromexico',               LA: 'LATAM Airlines',
  AV: 'Avianca',                  CM: 'Copa Airlines',            G3: 'Gol Transportes Aéreos',   AD: 'Azul Brazilian Airlines',
  FR: 'Ryanair',                  U2: 'easyJet',                  VY: 'Vueling',                  W6: 'Wizz Air',
  PC: 'Pegasus Airlines',         BT: 'airBaltic',                WZ: 'Red Wings',                PS: 'Ukraine International',
  MS: 'EgyptAir',                 ET: 'Ethiopian Airlines',       SA: 'South African Airways',    KQ: 'Kenya Airways',
};

function getAirlineName(iata) {
  if (!iata) return 'Unknown Airline';
  const code = iata.toUpperCase().replace(/\d+$/, '');
  return AIRLINES[code] || `${code} Airlines`;
}

const AIRPORTS = {
  KLAX: { name: 'Los Angeles Intl', city: 'Los Angeles', country: 'USA', iata: 'LAX' },
  KJFK: { name: 'John F. Kennedy Intl', city: 'New York', country: 'USA', iata: 'JFK' },
  KORD: { name: "O'Hare Intl", city: 'Chicago', country: 'USA', iata: 'ORD' },
  KATL: { name: 'Hartsfield-Jackson Intl', city: 'Atlanta', country: 'USA', iata: 'ATL' },
  KDFW: { name: 'Dallas/Fort Worth Intl', city: 'Dallas', country: 'USA', iata: 'DFW' },
  KDEN: { name: 'Denver Intl', city: 'Denver', country: 'USA', iata: 'DEN' },
  KSFO: { name: 'San Francisco Intl', city: 'San Francisco', country: 'USA', iata: 'SFO' },
  KSEA: { name: 'Seattle-Tacoma Intl', city: 'Seattle', country: 'USA', iata: 'SEA' },
  KMIA: { name: 'Miami Intl', city: 'Miami', country: 'USA', iata: 'MIA' },
  KBOS: { name: 'Boston Logan Intl', city: 'Boston', country: 'USA', iata: 'BOS' },
  KEWR: { name: 'Newark Liberty Intl', city: 'Newark', country: 'USA', iata: 'EWR' },
  KPHX: { name: 'Phoenix Sky Harbor Intl', city: 'Phoenix', country: 'USA', iata: 'PHX' },
  EGLL: { name: 'Heathrow', city: 'London', country: 'UK', iata: 'LHR' },
  EGKK: { name: 'Gatwick', city: 'London', country: 'UK', iata: 'LGW' },
  LFPG: { name: 'Charles de Gaulle', city: 'Paris', country: 'France', iata: 'CDG' },
  EDDF: { name: 'Frankfurt am Main', city: 'Frankfurt', country: 'Germany', iata: 'FRA' },
  EHAM: { name: 'Amsterdam Schiphol', city: 'Amsterdam', country: 'Netherlands', iata: 'AMS' },
  LEMD: { name: 'Adolfo Suárez Madrid-Barajas', city: 'Madrid', country: 'Spain', iata: 'MAD' },
  LIRF: { name: 'Leonardo da Vinci–Fiumicino', city: 'Rome', country: 'Italy', iata: 'FCO' },
  LTBA: { name: 'Istanbul Atatürk', city: 'Istanbul', country: 'Turkey', iata: 'IST' },
  LTFM: { name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey', iata: 'IST' },
  OMDB: { name: 'Dubai Intl', city: 'Dubai', country: 'UAE', iata: 'DXB' },
  OTHH: { name: 'Hamad Intl', city: 'Doha', country: 'Qatar', iata: 'DOH' },
  WSSS: { name: 'Singapore Changi', city: 'Singapore', country: 'Singapore', iata: 'SIN' },
  VHHH: { name: 'Hong Kong Intl', city: 'Hong Kong', country: 'China', iata: 'HKG' },
  RJTT: { name: 'Tokyo Haneda', city: 'Tokyo', country: 'Japan', iata: 'HND' },
  RJAA: { name: 'Narita Intl', city: 'Tokyo', country: 'Japan', iata: 'NRT' },
  RKSI: { name: 'Incheon Intl', city: 'Seoul', country: 'South Korea', iata: 'ICN' },
  YSSY: { name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'Australia', iata: 'SYD' },
  YMML: { name: 'Melbourne Airport', city: 'Melbourne', country: 'Australia', iata: 'MEL' },
  CYYZ: { name: 'Toronto Pearson Intl', city: 'Toronto', country: 'Canada', iata: 'YYZ' },
  CYVR: { name: 'Vancouver Intl', city: 'Vancouver', country: 'Canada', iata: 'YVR' },
  ZBAA: { name: 'Beijing Capital Intl', city: 'Beijing', country: 'China', iata: 'PEK' },
  ZSPD: { name: 'Shanghai Pudong Intl', city: 'Shanghai', country: 'China', iata: 'PVG' },
  VIDP: { name: 'Indira Gandhi Intl', city: 'New Delhi', country: 'India', iata: 'DEL' },
  VOBL: { name: 'Kempegowda Intl', city: 'Bengaluru', country: 'India', iata: 'BLR' },
  GMMN: { name: 'Mohammed V Intl', city: 'Casablanca', country: 'Morocco', iata: 'CMN' },
  HAAB: { name: 'Bole Intl', city: 'Addis Ababa', country: 'Ethiopia', iata: 'ADD' },
  FAOR: { name: 'O.R. Tambo Intl', city: 'Johannesburg', country: 'S. Africa', iata: 'JNB' },
  SBGR: { name: 'Guarulhos Intl', city: 'São Paulo', country: 'Brazil', iata: 'GRU' },
  SAEZ: { name: 'Ministro Pistarini Intl', city: 'Buenos Aires', country: 'Argentina', iata: 'EZE' },
  MMMX: { name: 'Benito Juárez Intl', city: 'Mexico City', country: 'Mexico', iata: 'MEX' },
};

const lookupAirport = icao => icao ? (AIRPORTS[icao.toUpperCase()] || null) : null;

function airportDisplay(icao) {
  const ap = lookupAirport(icao);
  return ap ? `${ap.iata} — ${ap.name} (${ap.city})` : (icao || 'Unknown');
}

const decodeStatus = (onGround, velocity) => 
  onGround ? ['ON GROUND', 'rl-amber'] : (velocity && velocity > 50 ? ['AIRBORNE', 'rl-green'] : ['UNKNOWN', 'rl-dim']);

/* ══════════════════════════════════════════════
   APIS (OPENSKY & AVIATIONSTACK)
══════════════════════════════════════════════ */
async function fetchOpenSky(callsign) {
  const url = `https://opensky-network.org/api/states/all?callsign=${encodeURIComponent(callsign.padEnd(8))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);
  const data = await res.json();
  if (!data.states || data.states.length === 0) return null;

  const sv = data.states[0];
  return {
    icao24:       sv[0],
    callsign:     (sv[1] || '').trim(),
    country:      sv[2],
    time_pos:     sv[3],
    last_contact: sv[4],
    longitude:    sv[5],
    latitude:     sv[6],
    baro_alt_m:   sv[7],
    on_ground:    sv[8],
    velocity_ms:  sv[9],
    true_track:   sv[10],
    vert_rate:    sv[11],
    geo_alt_m:    sv[13],
    squawk:       sv[14],
  };
}

async function fetchAviationStack(flight) {
  const API_KEY = window.AVIATIONSTACK_KEY || '';
  if (!API_KEY) return null;
  try {
    const url = `https://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_iata=${encodeURIComponent(flight)}&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0] || null;
  } catch { return null; }
}

/* ══════════════════════════════════════════════
   KNOWN ROUTES
══════════════════════════════════════════════ */
const _HND = { iata_code: 'HND', icao_code: 'RJTT', name: 'Tokyo Haneda Airport', municipality: 'Tokyo', country_name: 'Japan', latitude: 35.55280, longitude: 139.77960 };
const _NRT = { iata_code: 'NRT', icao_code: 'RJAA', name: 'Narita International Airport', municipality: 'Tokyo', country_name: 'Japan', latitude: 35.77667, longitude: 140.38639 };
const _JFK = { iata_code: 'JFK', icao_code: 'KJFK', name: 'John F. Kennedy International Airport', municipality: 'New York', country_name: 'United States', latitude: 40.63972, longitude: -73.77889 };
const _LAX = { iata_code: 'LAX', icao_code: 'KLAX', name: 'Los Angeles International Airport', municipality: 'Los Angeles', country_name: 'United States', latitude: 33.94250, longitude: -118.40806 };
const _DFW = { iata_code: 'DFW', icao_code: 'KDFW', name: 'Dallas/Fort Worth International Airport', municipality: 'Dallas-Fort Worth', country_name: 'United States', latitude: 32.89700, longitude: -97.03800 };
const _ORD = { iata_code: 'ORD', icao_code: 'KORD', name: "O'Hare International Airport", municipality: 'Chicago', country_name: 'United States', latitude: 41.97960, longitude: -87.90480 };
const _AA  = { name: 'American Airlines', iata: 'AA', icao: 'AAL' };

const KNOWN_ROUTES = {
  AA169:  { airline: _AA, origin: _LAX, destination: _HND, durationHours: 11.917, schedDepUTCH:  7, schedDepUTCM: 50, schedArrUTCH: 19, schedArrUTCM: 45 },
  AA170:  { airline: _AA, origin: _HND, destination: _LAX, durationHours: 10.083, schedDepUTCH:  2, schedDepUTCM: 55, schedArrUTCH: 13, schedArrUTCM:  0 },
  AA175:  { airline: _AA, origin: _DFW, destination: _HND, durationHours: 13.083, schedDepUTCH: 16, schedDepUTCM: 15, schedArrUTCH:  5, schedArrUTCM: 20 },
  AA176:  { airline: _AA, origin: _HND, destination: _DFW, durationHours: 12.083, schedDepUTCH:  7, schedDepUTCM: 30, schedArrUTCH: 19, schedArrUTCM: 35 },
  AA167:  { airline: _AA, origin: _JFK, destination: _HND, durationHours: 14.167, schedDepUTCH: 14, schedDepUTCM: 30, schedArrUTCH:  4, schedArrUTCM: 40 },
  AA168:  { airline: _AA, origin: _HND, destination: _JFK, durationHours: 13.167, schedDepUTCH:  8, schedDepUTCM: 45, schedArrUTCH: 21, schedArrUTCM: 55 },
  AA9603: { airline: _AA, origin: _LAX, destination: _HND, durationHours: 11.917, schedDepUTCH:  9, schedDepUTCM: 10, schedArrUTCH: 21, schedArrUTCM: 10 },
  AA26:   { airline: _AA, origin: _HND, destination: _LAX, durationHours: 10.083, schedDepUTCH: 10, schedDepUTCM: 45, schedArrUTCH: 20, schedArrUTCM: 50 },
  AA27:   { airline: _AA, origin: _LAX, destination: _HND, durationHours: 11.583, schedDepUTCH: 19, schedDepUTCM: 15, schedArrUTCH:  6, schedArrUTCM: 50 },
  AA9600: { airline: _AA, origin: _HND, destination: _LAX, durationHours: 10.083, schedDepUTCH: 13, schedDepUTCM:  0, schedArrUTCH: 23, schedArrUTCM:  0 },
  AA61:   { airline: _AA, origin: _DFW, destination: _NRT, durationHours: 13.5,   schedDepUTCH: 15, schedDepUTCM: 30, schedArrUTCH:  5, schedArrUTCM:  7 },
  AA60:   { airline: _AA, origin: _NRT, destination: _DFW, durationHours: 12.0,   schedDepUTCH:  9, schedDepUTCM: 30, schedArrUTCH: 21, schedArrUTCM: 30 },
};

function calcScheduledTimes(routeData) {
  if (routeData?.schedDepUTCH == null) return null;
  const nowUnix = Math.floor(Date.now() / 1000);
  const duration = routeData.durationHours || 12;

  const getUnix = (offset) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    d.setUTCHours(routeData.schedDepUTCH, routeData.schedDepUTCM, 0, 0);
    const depUnix = Math.floor(d.getTime() / 1000);
    return { depUnix, arrUnix: depUnix + Math.round(duration * 3600) };
  };

  const yesterday = getUnix(-1), today = getUnix(0), tomorrow = getUnix(1);

  if (nowUnix >= yesterday.depUnix && nowUnix < yesterday.arrUnix) return yesterday;
  if (nowUnix >= today.depUnix && nowUnix < today.arrUnix) return today;
  if (nowUnix >= tomorrow.depUnix && nowUnix < tomorrow.arrUnix) return tomorrow;
  if (nowUnix >= yesterday.arrUnix && nowUnix < yesterday.arrUnix + 4 * 3600) return yesterday;
  if (nowUnix >= today.arrUnix && nowUnix < today.arrUnix + 4 * 3600) return today;
  return nowUnix < today.depUnix ? today : tomorrow;
}

const findRoutingForFlight = (flight, dateStr) => {
  if (!state.routingsPlan) return null;
  if (dateStr && state.routingsPlanDate && state.routingsPlanDate !== dateStr) return null;
  const num = flight.replace(/[^0-9]/g, '');
  return state.routingsPlan.find(r => r.arrival === num || r.departure === num);
};

function getRoutingStatus(btnFlight) {
  const planDateStr = state.routingsPlanDate || new Date().toISOString().split('T')[0];
  const routing = findRoutingForFlight(btnFlight, planDateStr);
  if (!routing) return null;
  
  const num = btnFlight.replace(/[^0-9]/g, '');
  const isDep = (routing.departure === num);
  const remarks = (routing.remarks || '').toUpperCase();
  if (remarks.includes('CANCEL') || remarks.includes('CNCL')) return 'cancelled';

  const parseJstTimeToUnix = (timeStr) => {
    if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return null;
    const [hh, mm] = timeStr.split(':').map(Number);
    return Math.floor(new Date(`${planDateStr}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00+09:00`).getTime() / 1000);
  };

  const nowUnix = Math.floor(Date.now() / 1000);

  if (isDep) {
    const stdUnix = parseJstTimeToUnix(routing.std);
    const etdUnix = parseJstTimeToUnix(routing.etd) || stdUnix;
    const arrUnix = etdUnix + Math.round(10.5 * 3600);

    if (nowUnix >= arrUnix) return 'landed';
    if (nowUnix >= etdUnix) return 'inflight';
    if ((routing.etd && routing.etd !== routing.std) || remarks.includes('DLY') || remarks.includes('DELAY')) return 'delayed';
    if (stdUnix && stdUnix - nowUnix > 0 && stdUnix - nowUnix < 3600) return 'soon';
    return 'scheduled';
  } else {
    if (routing.eta === 'IN') return 'landed';
    const staUnix = parseJstTimeToUnix(routing.sta);
    const etaUnix = parseJstTimeToUnix(routing.eta) || staUnix;
    const depUnix = etaUnix - Math.round(12.0 * 3600);

    if (nowUnix >= etaUnix) return 'landed';
    if (nowUnix >= depUnix) return 'inflight';
    if ((routing.eta && routing.eta !== routing.sta) || remarks.includes('DLY') || remarks.includes('DELAY')) return 'delayed';
    return 'scheduled';
  }
}

const IATA_TO_ICAO_AIRLINE = {
  AA:'AAL', UA:'UAL', DL:'DAL', WN:'SWA', B6:'JBU', AS:'ASA', NK:'NKS', F9:'FFT', HA:'HAL',
  BA:'BAW', LH:'DLH', AF:'AFR', KL:'KLM', EK:'UAE', QR:'QTR', SQ:'SIA', NH:'ANA', JL:'JAL', KE:'KAL',
  CX:'CPA', QF:'QFA', AC:'ACA', AM:'AMX',
};

async function fetchOpenSkyDeparture(iataCallsign, originIcaoAirport) {
  if (!originIcaoAirport) return null;
  try {
    const now   = Math.floor(Date.now() / 1000);
    const begin = now - 86400;
    const url   = `https://opensky-network.org/api/flights/departure?airport=${originIcaoAirport}&begin=${begin}&end=${now}`;
    const res   = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data  = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const iata      = iataCallsign.match(/^([A-Z]{2})/)?.[1] || '';
    const flightNum = iataCallsign.replace(/^[A-Z]{2}/, '');
    const icaoCs    = (IATA_TO_ICAO_AIRLINE[iata] || iata) + flightNum;

    return data.find(f => f.callsign && f.callsign.trim() === icaoCs) || null;
  } catch { return null; }
}

async function fetchAdsbDb(callsign) {
  if (KNOWN_ROUTES[callsign]) return KNOWN_ROUTES[callsign];
  try {
    const url = `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.response?.flightroute || null;
  } catch { return null; }
}

async function fetchOpenSkyFlights(icao24) {
  if (!icao24) return null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const begin = now - 86400;
    const url = `https://opensky-network.org/api/flights/aircraft?icao24=${icao24}&begin=${begin}&end=${now}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[data.length - 1] : null;
  } catch { return null; }
}

/* ══════════════════════════════════════════════
   GEOGRAPHY & MATHEMATICS
══════════════════════════════════════════════ */
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function greatCirclePoint(lat1, lon1, lat2, lon2, t) {
  const φ1 = toRad(lat1), λ1 = toRad(lon1);
  const φ2 = toRad(lat2), λ2 = toRad(lon2);
  const dLat = φ2 - φ1, dLon = λ2 - λ1;
  const a = Math.sin(dLat/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dLon/2)**2;
  const d = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  if (d < 1e-10) return { lat: lat1, lon: lon1 };
  const A = Math.sin((1-t)*d) / Math.sin(d);
  const B = Math.sin(t*d)    / Math.sin(d);
  const x = A*Math.cos(φ1)*Math.cos(λ1) + B*Math.cos(φ2)*Math.cos(λ2);
  const y = A*Math.cos(φ1)*Math.sin(λ1) + B*Math.cos(φ2)*Math.sin(λ2);
  const z = A*Math.sin(φ1)              + B*Math.sin(φ2);
  return {
    lat: toDeg(Math.atan2(z, Math.sqrt(x*x + y*y))),
    lon: toDeg(Math.atan2(y, x)),
  };
}

function getOceanRegion(lat, lon) {
  while (lon >  180) lon -= 360;
  while (lon < -180) lon += 360;
  if (lon < -100) return 'Eastern Pacific  (near California/Alaska)';
  if (lon < -150 || lon > 160) return 'Central North Pacific';
  if (lon <  130) return 'Western Pacific  (near Japan/Kurils)';
  if (lon <  145) return 'Approaching Japan';
  return 'North Pacific Ocean';
}

function calcETA(sv, routeData) {
  if (!sv || !routeData?.destination) return null;
  const { latitude: lat1, longitude: lon1, velocity_ms } = sv;
  const { latitude: lat2, longitude: lon2 } = routeData.destination;
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null || !velocity_ms || velocity_ms < 50) return null;
  const distKm = haversine(lat1, lon1, lat2, lon2);
  const speedKmh = velocity_ms * 3.6;
  return { distKm: Math.round(distKm), speedKmh: Math.round(speedKmh), etaHours: distKm / speedKmh, etaMs: Date.now() + (distKm / speedKmh) * 3600 * 1000 };
}

/* ══════════════════════════════════════════════
   UNIT CONVERSIONS & FORMATTING
══════════════════════════════════════════════ */
const msToKnots = v => v ? (v * 1.94384).toFixed(0) : '—';
const msToKmh   = v => v ? (v * 3.6).toFixed(0) : '—';
const mToFt     = m => m ? (m * 3.28084).toFixed(0) : '—';
const mToFl     = m => m ? `FL${Math.round(m * 3.28084 / 100)}` : '—';
const degToCompass = d => {
  if (d == null) return '—';
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(d / 22.5) % 16];
};
const formatUnixTime = ts => ts ? new Date(ts * 1000).toUTCString().replace(' GMT','').replace(/,\s/,'T') + ' UTC' : '—';

function secondsAgo(ts) {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ${diff%60}s ago`;
  return `${Math.floor(diff/3600)}h ${Math.floor((diff%3600)/60)}m ago`;
}

function formatJST(unixSeconds) {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleString('en-GB', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).replace(',', '') + ' JST';
}

function formatVertRate(vr) {
  if (vr == null) return '—';
  const fpm = (vr * 196.85).toFixed(0);
  return `${Math.abs(fpm)} fpm  ${vr > 0 ? '▲ CLIMBING' : vr < 0 ? '▼ DESCENDING' : '→ LEVEL'}`;
}

const formatIsoTime = iso => iso ? new Date(iso).toUTCString().replace(' GMT', ' UTC') : '—';

/* ══════════════════════════════════════════════
   OUTPUT WRITING HELPERS
══════════════════════════════════════════════ */
const pushKV = (arr, label, value, cssClass) => arr.push({ type: 'kv', label, value, cssClass });
const pushLine = (arr, raw, type = 'value', cssClass) => arr.push({ type, raw, cssClass });
const pushBlank = arr => arr.push({ type: 'blank' });

function appendScheduleLines(lines, d) {
  const { departure: dep = {}, arrival: arr = {}, airline = {}, flight = {}, flight_status: status } = d;
  if (airline.name) pushKV(lines, '  AIRLINE', airline.name);
  if (flight.iata)  pushKV(lines, '  FLIGHT NO.', flight.iata.toUpperCase());
  pushBlank(lines);
  if (dep.airport) pushKV(lines, '  DEPARTURE', `${dep.iata || '?'} — ${dep.airport}`);
  if (dep.scheduled) pushKV(lines, '  SCHED. DEP.', formatIsoTime(dep.scheduled));
  if (dep.actual)    pushKV(lines, '  ACTUAL DEP.', formatIsoTime(dep.actual), 'rl-amber');
  if (arr.airport) pushKV(lines, '  ARRIVAL', `${arr.iata || '?'} — ${arr.airport}`);
  if (arr.scheduled) pushKV(lines, '  SCHED. ARR.', formatIsoTime(arr.scheduled));
  if (arr.estimated) pushKV(lines, '  EST. ARR.', formatIsoTime(arr.estimated), 'rl-green');
  if (status) {
    pushKV(lines, '  FLIGHT STATUS', status.toUpperCase(), status === 'active' ? 'rl-green' : status === 'landed' ? 'rl-amber' : 'rl-dim');
  }
  pushBlank(lines);
}

/* ══════════════════════════════════════════════
   TERMINAL PRINT ENGINE
══════════════════════════════════════════════ */
const clearOutput = () => resultStream.innerHTML = '';
let printQueue = [];

function schedulePrint(lines) {
  clearOutput();
  printQueue = [...lines];
  let delay = 0;
  for (let i = 0; i < printQueue.length; i++) {
    const line = printQueue[i];
    setTimeout(() => appendLine(line), delay);
    delay += line.type === 'blank' ? 10 : line.type === 'header' || line.type === 'divider' ? 20 : 35;
  }
}

function appendLine({ type, label, value, raw, cssClass }) {
  const el = document.createElement('div');
  el.className = `rl rl-${type || 'value'}`;

  if (type === 'kv') {
    el.className = 'rl rl-kv';
    const labelEl = document.createElement('span');
    labelEl.className = 'rl-label';
    labelEl.textContent = (label || '').padEnd(22);
    const valueEl = document.createElement('span');
    valueEl.className = cssClass || 'rl-value';
    valueEl.textContent = value || '';
    el.appendChild(labelEl);
    el.appendChild(valueEl);
  } else if (type === 'blank') {
    el.innerHTML = '&nbsp;';
  } else {
    el.textContent = raw || value || '';
    if (cssClass) el.className += ' ' + cssClass;
  }

  resultStream.appendChild(el);
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ══════════════════════════════════════════════
   ROUTE CANVAS DRAWING
══════════════════════════════════════════════ */
function drawRouteCanvas(data) {
  state.currentCanvasData = data;
  const ctx = routeCanvas.getContext('2d');
  const W = routeCanvas.offsetWidth || 800;
  const H = routeCanvas.offsetHeight || 90;
  routeCanvas.width = W;
  routeCanvas.height = H;
  ctx.clearRect(0, 0, W, H);

  // Background grid
  ctx.strokeStyle = 'rgba(57,255,126,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Draw scanner sweep line if active
  if (state.radarSweepActive) {
    ctx.save();
    state.sweepX = (state.sweepX || 0) + state.sweepSpeed;
    if (state.sweepX > W + 80) state.sweepX = 0;

    const grad = ctx.createLinearGradient(state.sweepX - 80, 0, state.sweepX, 0);
    grad.addColorStop(0, 'rgba(57, 255, 126, 0)');
    grad.addColorStop(0.8, 'rgba(57, 255, 126, 0.08)');
    grad.addColorStop(1, 'rgba(57, 255, 126, 0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(state.sweepX - 80, 0, 80, H);

    if (state.sweepX <= W) {
      ctx.beginPath(); ctx.moveTo(state.sweepX, 0); ctx.lineTo(state.sweepX, H);
      ctx.strokeStyle = 'rgba(57, 255, 126, 0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  }

  if (!data) return;

  const margin = 40, originX = margin, destX = W - margin, midY = H / 2, arcY = midY - 28;

  // Draw route arc
  ctx.beginPath(); ctx.moveTo(originX, midY);
  ctx.quadraticCurveTo(W / 2, arcY, destX, midY);
  ctx.strokeStyle = 'rgba(255,45,107,0.4)'; ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

  // Draw node helper
  const drawNode = (x, y, radius, color) => {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.shadowBlur = 10; ctx.shadowColor = color;
    ctx.fill(); ctx.shadowBlur = 0;
  };

  drawNode(originX, midY, 5, '#39ff7e');
  drawNode(destX, midY, 5, '#ff2d6b');

  const bezierPt = t => ({
    x: (1-t)**2 * originX + 2*(1-t)*t*(W/2) + t**2 * destX,
    y: (1-t)**2 * midY    + 2*(1-t)*t*arcY   + t**2 * midY
  });

  // Live GPS aircraft position (gold, solid)
  if (data.lon != null && data.lat != null && data.progress != null) {
    const { x: bx, y: by } = bezierPt(data.progress);
    const grd = ctx.createRadialGradient(bx, by, 2, bx, by, 10);
    grd.addColorStop(0, 'rgba(255,183,0,0.4)'); grd.addColorStop(1, 'rgba(255,183,0,0)');
    ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fillStyle = grd; ctx.fill();
    ctx.font = '14px monospace'; ctx.fillStyle = '#ffb700';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✈', bx, by);
  }

  // Dead-reckoning estimated position (amber, dashed ring)
  if (data.estProgress != null && data.lon == null) {
    const { x: bx, y: by } = bezierPt(data.estProgress);
    ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,183,0,0.55)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '13px monospace'; ctx.fillStyle = '#ffb700';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✈', bx, by);
    ctx.font = '7px JetBrains Mono, monospace'; ctx.fillStyle = 'rgba(255,183,0,0.8)';
    ctx.fillText('EST', bx, by - 18);
  }

  // Labels
  ctx.font = '9px JetBrains Mono, monospace'; ctx.fillStyle = 'rgba(57,255,126,0.7)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  if (data.origin) ctx.fillText(data.origin, originX, midY + 8);
  if (data.dest)   ctx.fillText(data.dest,   destX,   midY + 8);
}

/* ══════════════════════════════════════════════
   BUILD OUTPUT LINES
══════════════════════════════════════════════ */
function buildOutputLines(callsign, sv, routeData, flightHistory, asData, now) {
  const iata = callsign.replace(/\s/g, '');
  const flightNum = iata.match(/\d+/)?.[0] || '?';
  const airlineName = routeData?.airline?.name || getAirlineName(iata);
  const [statusLabel, statusClass] = decodeStatus(sv?.on_ground, sv?.velocity_ms);

  const lines = [];
  const ts = new Date(now).toUTCString();

  const addKV = (label, value, cssClass) => pushKV(lines, label, value, cssClass);
  const addLine = (raw, type = 'value', cssClass) => pushLine(lines, raw, type, cssClass);
  const addBlank = () => pushBlank(lines);

  // ── Header box ──
  addBlank();
  addLine(`┌─ FLIGHT TRACK: ${iata.toUpperCase()} ─`.padEnd(54,'─') + '┐', 'header');
  addLine(`│  ${airlineName} · Flight ${flightNum}`.padEnd(54) + '│', 'header');
  addLine(`│  Query Time: ${ts}`.padEnd(54) + '│', 'header');
  addLine(`└${'─'.repeat(54)}┘`, 'header');
  addBlank();

  // ── ROUTE & TIMING ──
  const origin = routeData?.origin;
  const dest   = routeData?.destination;
  let sched = calcScheduledTimes(routeData);

  if (origin || dest || flightHistory) {
    addLine('─── ROUTE & TIMING ' + '─'.repeat(34), 'divider');
    if (origin) addKV('  ORIGIN', `${origin.iata_code} — ${origin.municipality || origin.country_name}`, 'rl-green');
    if (dest) addKV('  DESTINATION', `${dest.iata_code} — ${dest.municipality || dest.country_name}`, 'rl-cyan');
    if (origin && dest) {
      const totalKm = Math.round(haversine(origin.latitude, origin.longitude, dest.latitude, dest.longitude));
      addKV('  ROUTE DIST.', `${totalKm.toLocaleString()} km  (${Math.round(totalKm * 0.539957).toLocaleString()} nm)`);
    }

    if (flightHistory?.firstSeen) {
      addKV('  DEPARTED (JST)', `${formatJST(flightHistory.firstSeen)}  (${secondsAgo(flightHistory.firstSeen)})`, 'rl-amber');
      if (routeData?.durationHours) {
        const estArrUnix = flightHistory.firstSeen + Math.round(routeData.durationHours * 3600);
        const nowUnix = Math.floor(Date.now() / 1000);
        const isArrived = nowUnix > estArrUnix;
        addKV('  EST. ARRIVAL (JST)', `${formatJST(estArrUnix)}${isArrived ? '  ✓ ARRIVED' : ''}`, isArrived ? 'rl-amber' : 'rl-green');
        if (!isArrived) {
          const secsLeft = estArrUnix - nowUnix;
          const hLeft = Math.floor(secsLeft / 3600);
          const mLeft = Math.floor((secsLeft % 3600) / 60);
          addKV('  TIME TO ARRIVAL', hLeft > 0 ? `${hLeft}h ${mLeft}m remaining` : `${mLeft}m remaining`, 'rl-green');
        }
      }
    } else if (sched) {
      const nowUnix = Math.floor(Date.now() / 1000);
      const departed = nowUnix > sched.depUnix;
      const arrived = nowUnix > sched.arrUnix;

      addKV(departed ? '  DEPARTED (JST)' : '  SCHED. DEP (JST)', `${formatJST(sched.depUnix)}${departed ? '  (airborne)' : '  ⏰ not yet departed'}`, departed ? 'rl-amber' : 'rl-value');
      addKV(arrived ? '  ARRIVED (JST)' : '  SCHED. ARR (JST)', `${formatJST(sched.arrUnix)}${arrived ? '  ✓ ARRIVED' : ''}`, arrived ? 'rl-amber' : 'rl-green');

      if (!arrived) {
        const secsLeft = sched.arrUnix - nowUnix;
        const hLeft = Math.floor(secsLeft / 3600);
        const mLeft = Math.floor((secsLeft % 3600) / 60);
        const label = departed ? '  TIME TO ARRIVAL' : '  DEPARTS IN';
        const secsToDep = sched.depUnix - nowUnix;
        const hDep = Math.floor(secsToDep / 3600);
        const mDep = Math.floor((secsToDep % 3600) / 60);
        addKV(label, departed
          ? (hLeft > 0 ? `${hLeft}h ${mLeft}m remaining` : `${mLeft}m remaining`)
          : (hDep > 0 ? `${hDep}h ${mDep}m` : `${mDep}m`), 'rl-green');
      }
      addLine('  ⚠ Schedule is approximate (±30 min). Verify at aa.com', 'dim');
    }

    const eta = calcETA(sv, routeData);
    if (eta) {
      const hrsLeft = Math.floor(eta.etaHours);
      const minsLeft = Math.round((eta.etaHours - hrsLeft) * 60);
      addKV('  LIVE CALC. ETA', formatJST(Math.floor(eta.etaMs / 1000)), 'rl-green');
      addKV('  └ TIME REMAINING', hrsLeft > 0 ? `${hrsLeft}h ${minsLeft}m` : `${minsLeft}m`, 'rl-green');
      addKV('  └ DIST. REMAINING', `${eta.distKm.toLocaleString()} km at ${eta.speedKmh} km/h`);
    } else if (sv?.on_ground) {
      addKV('  LIVE ETA', 'Aircraft on ground — not yet departed', 'rl-amber');
    }
    addBlank();
  }

  // ── OPERATIONAL ROUTING ──
  const planDateStr = state.routingsPlanDate || new Date(now).toISOString().split('T')[0];
  const routing = findRoutingForFlight(callsign, planDateStr);
  if (routing) {
    addLine('─── OPERATIONAL ROUTING ' + '─'.repeat(30), 'divider');
    if (routing.ac_type || routing.nose) {
      addKV('  AIRCRAFT TYPE', `${routing.ac_type || '—'}${routing.nose ? `  (Nose: ${routing.nose})` : ''}`, 'rl-cyan');
    }
    const spots = [routing.arv_spot, routing.tow_to, routing.dep_spot].filter(Boolean);
    if (spots.length) {
      addKV('  GATE / SPOTS', spots.join(' → '), 'rl-value');
    }

    const num = callsign.replace(/[^0-9]/g, '');
    const isDep = (routing.departure === num);
    if (isDep) {
      if (routing.etd && routing.etd !== routing.std) {
        addKV('  EST. DEPARTURE', `${routing.etd} JST  (DLY vs STD ${routing.std})`, 'rl-amber');
      } else {
        addKV('  EST. DEPARTURE', `${routing.std || '—'} JST  (On Time)`, 'rl-green');
      }
    } else {
      if (routing.eta && routing.eta !== routing.sta && routing.eta !== 'IN') {
        addKV('  EST. ARRIVAL', `${routing.eta} JST  (DLY vs STA ${routing.sta})`, 'rl-amber');
      } else if (routing.eta === 'IN') {
        addKV('  EST. ARRIVAL', '✓ ARRIVED / IN', 'rl-green');
      } else {
        addKV('  EST. ARRIVAL', `${routing.sta || '—'} JST  (On Time)`, 'rl-green');
      }
    }

    if (routing.remarks) {
      addKV('  REMARKS / NOTES', routing.remarks, (routing.remarks.toUpperCase().includes('DLY') || routing.remarks.toUpperCase().includes('MAINTENANCE')) ? 'rl-amber' : 'rl-value');
    }
    addBlank();
  }

  // ── No live position ──
  if (!sv) {
    const nowUnixDR = Math.floor(Date.now() / 1000);
    const schedForDR = sched || calcScheduledTimes(routeData);
    const isAirborne = schedForDR && nowUnixDR > schedForDR.depUnix && nowUnixDR < schedForDR.arrUnix;

    if (isAirborne && origin?.latitude && dest?.latitude) {
      const elapsed = nowUnixDR - schedForDR.depUnix;
      const totalDurSec = schedForDR.arrUnix - schedForDR.depUnix;
      const fraction = Math.min(1, Math.max(0, elapsed / totalDurSec));
      const estPos = greatCirclePoint(origin.latitude, origin.longitude, dest.latitude, dest.longitude, fraction);
      const totalDistKm = haversine(origin.latitude, origin.longitude, dest.latitude, dest.longitude);
      const distDoneKm = Math.round(totalDistKm * fraction);
      const distLeftKm = Math.round(totalDistKm * (1 - fraction));
      const distLeftNm = Math.round(distLeftKm / 1.852);
      const avgSpeedKmh = Math.round(totalDistKm / (totalDurSec / 3600));
      const avgSpeedKts = Math.round(avgSpeedKmh / 1.852);
      const pct = Math.round(fraction * 100);
      const secsLeft = schedForDR.arrUnix - nowUnixDR;
      const hLeft = Math.floor(secsLeft / 3600);
      const mLeft = Math.floor((secsLeft % 3600) / 60);
      const latStr = Math.abs(estPos.lat).toFixed(1) + (estPos.lat >= 0 ? '°N' : '°S');
      const lonStr = Math.abs(estPos.lon).toFixed(1) + (estPos.lon >= 0 ? '°E' : '°W');
      const elapsedH = Math.floor(elapsed / 3600);
      const elapsedM = Math.floor((elapsed % 3600) / 60);

      addLine('⊕  DEAD RECKONING  (no satellite ADS-B over Pacific)', 'warn');
      addLine('   Position estimated from schedule + great circle route.', 'dim');
      addBlank();
      addKV('  EST. POSITION', `${latStr}  ${lonStr}`, 'rl-amber');
      addKV('  REGION', getOceanRegion(estPos.lat, estPos.lon), 'rl-dim');
      addKV('  ELAPSED', `${elapsedH}h ${elapsedM}m  /  ${Math.round(totalDurSec/3600*10)/10}h scheduled`, 'rl-green');
      addKV('  PROGRESS', `${pct}%  (${distDoneKm.toLocaleString()} km of ${Math.round(totalDistKm).toLocaleString()} km)`, 'rl-green');
      addKV('  DIST. REMAINING', `${distLeftKm.toLocaleString()} km  (${distLeftNm.toLocaleString()} nm)`, 'rl-green');
      addKV('  TIME REMAINING', hLeft > 0 ? `${hLeft}h ${mLeft}m` : `${mLeft}m`, 'rl-green');
      addKV('  AVG SPEED (sched)', `${avgSpeedKmh} km/h  (${avgSpeedKts} kts)`, 'rl-dim');
      addBlank();
    } else {
      addLine('⚠  NO LIVE ADS-B POSITION FOR THIS FLIGHT.', 'warn');
      addLine('   Aircraft may be on ground, completed, or out of range.', 'dim');
    }
    addBlank();
    if (asData) {
      addLine('─── SCHEDULE DATA (Aviation Stack) ' + '─'.repeat(19), 'divider');
      appendScheduleLines(lines, asData);
    }
    addLine(`  Route data: adsbdb.com  ·  Position: OpenSky Network`, 'dim');
    addBlank();
    return lines;
  }

  // ── LIVE ADS-B POSITION ──
  addLine('─── LIVE ADS-B POSITION ' + '─'.repeat(30), 'divider');
  addKV('  STATUS', `● ${statusLabel}`, statusClass);
  addKV('  ICAO-24 HEX', (sv.icao24 || '—').toUpperCase());
  addKV('  SQUAWK CODE', sv.squawk || '—', 'rl-amber');
  addKV('  REGISTERED IN', sv.country || '—');
  addBlank();

  addLine('─── POSITION & NAVIGATION ' + '─'.repeat(28), 'divider');
  if (sv.latitude != null && sv.longitude != null) {
    addKV('  LATITUDE', `${sv.latitude.toFixed(5)}°`, 'rl-cyan');
    addKV('  LONGITUDE', `${sv.longitude.toFixed(5)}°`, 'rl-cyan');
  } else {
    addKV('  POSITION', 'No GPS fix');
  }
  addKV('  BARO ALTITUDE', sv.baro_alt_m != null ? `${mToFt(sv.baro_alt_m)} ft  (${mToFl(sv.baro_alt_m)})` : '—');
  addKV('  GEO ALTITUDE', sv.geo_alt_m != null ? `${mToFt(sv.geo_alt_m)} ft` : '—');
  addBlank();

  addLine('─── SPEED & VECTOR ' + '─'.repeat(34), 'divider');
  addKV('  GROUND SPEED', sv.velocity_ms != null ? `${msToKnots(sv.velocity_ms)} kts  (${msToKmh(sv.velocity_ms)} km/h)` : '—', 'rl-green');
  addKV('  TRUE TRACK', sv.true_track != null ? `${sv.true_track.toFixed(1)}°  (${degToCompass(sv.true_track)})` : '—');
  addKV('  VERTICAL RATE', sv.vert_rate != null ? formatVertRate(sv.vert_rate) : '—',
    sv.vert_rate > 0 ? 'rl-green' : sv.vert_rate < 0 ? 'rl-ruby' : 'rl-value');
  addBlank();

  addLine('─── DATA FRESHNESS ' + '─'.repeat(34), 'divider');
  addKV('  POSITION TIME', formatUnixTime(sv.time_pos));
  addKV('  LAST CONTACT', secondsAgo(sv.last_contact), 'rl-amber');
  addBlank();

  if (asData) {
    addLine('─── SCHEDULE DATA ' + '─'.repeat(35), 'divider');
    appendScheduleLines(lines, asData);
  }
  addLine('  Sources: OpenSky ADS-B (live)  ·  adsbdb.com (route/timing)', 'dim');
  addBlank();

  return lines;
}

/* ══════════════════════════════════════════════
   LOADING MESSAGES
══════════════════════════════════════════════ */
const LOADING_MESSAGES = [
  'Querying ADS-B network...', 'Connecting to OpenSky receivers...', 'Fetching transponder data...',
  'Decoding state vectors...', 'Processing flight telemetry...', 'Enriching route data...', 'Rendering output stream...'
];
let loadingMsgIdx = 0, loadingMsgTimer = null;

function startLoading() {
  loadingMsgIdx = 0;
  loadingText.textContent = LOADING_MESSAGES[0];
  loadingOverlay.classList.remove('hidden');
  loadingMsgTimer = setInterval(() => {
    loadingMsgIdx = (loadingMsgIdx + 1) % LOADING_MESSAGES.length;
    loadingText.textContent = LOADING_MESSAGES[loadingMsgIdx];
  }, 600);
}

function stopLoading() {
  clearInterval(loadingMsgTimer);
  loadingOverlay.classList.add('hidden');
  playChimeSound();
}

function parseDateInput(input) {
  const cleaned = input.trim().toUpperCase();
  const match = cleaned.match(/^(0[1-9]|[12]\d|3[01])\/([A-Z]{3})\/(\d{2})$/) || cleaned.match(/^(0[1-9]|[12]\d|3[01])([A-Z]{3})(\d{2})$/);
  if (match) {
    const months = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
    const monthNum = months[match[2]];
    if (monthNum) return `20${match[3]}-${monthNum}-${match[1]}`;
  }
  return null;
}

/* ══════════════════════════════════════════════
   DAILY OVERVIEW
══════════════════════════════════════════════ */
function renderDailyOverview(dateStr) {
  const now = Date.now(), ts = new Date(now).toUTCString(), lines = [];
  const addKV = (label, value, cssClass) => pushKV(lines, label, value, cssClass);
  const addLine = (raw, type = 'value', cssClass) => pushLine(lines, raw, type, cssClass);
  const addBlank = () => pushBlank(lines);

  addBlank();
  addLine(`┌─ DAILY OVERVIEW: ${dateStr} (HND ROUTES) ─`.padEnd(54,'─') + '┐', 'header');
  addLine(`│  Query Time: ${ts}`.padEnd(54) + '│', 'header');
  addLine(`└${'─'.repeat(54)}┘`, 'header');
  addBlank();

  if (!state.routingsPlan || state.routingsPlanDate !== dateStr) {
    addLine(`⚠ OPERATIONAL ROUTING PLAN OFFLINE FOR ${dateStr}`, 'warn');
    addBlank();
    addLine('─── CHEAPEST SATELLITE & FLIGHT APIs GUIDE ───', 'header');
    addKV('  1. FlightAware AeroAPI', 'FREE Tier (500 queries/mo) | Bronze: $25/mo');
    addKV('     └ Satellite Tracking', 'Included (Pacific oceanic routes tracked automatically)');
    addKV('     └ Key Data Points', 'Gate spots, terminal status, tail numbers, actual ETA');
    addKV('  2. Aviationstack API', 'FREE Tier (100 queries/mo) | Standard: $29/mo');
    addKV('  3. OpenSky Network API', 'FREE (Community) - Live coordinates only, no gates/spots');
    addBlank();
    addLine('  * Note: Space-based satellite ADS-B is built directly into', 'dim');
    addLine('    FlightAware AeroAPI and Flightradar24. You do not need', 'dim');
    addLine('    a separate satellite provider (which costs $1,000s/mo).', 'dim');
    addBlank();
  }

  Object.keys(KNOWN_ROUTES).forEach(flight => {
    const route = KNOWN_ROUTES[flight], routing = findRoutingForFlight(flight, dateStr);
    const num = flight.replace(/[^0-9]/g, '');
    const isDep = (routing?.departure === num);

    let statusText = 'Scheduled', statusClass = 'rl-value', timeInfo = '', noseInfo = '—', spotInfo = '—', remarkInfo = '';

    const sched = calcScheduledTimes(route);
    if (sched) {
      const nowUnix = Math.floor(Date.now() / 1000);
      if (nowUnix > sched.arrUnix) { statusText = 'Landed'; statusClass = 'rl-dim'; }
      else if (nowUnix > sched.depUnix) { statusText = 'In Flight'; statusClass = 'rl-green'; }
      else if (sched.depUnix - nowUnix < 3600) { statusText = 'Soon'; statusClass = 'rl-amber'; }
      
      const isHndArr = route.destination.iata_code === 'HND';
      const offsetH = isHndArr ? route.schedArrUTCH : route.schedDepUTCH;
      const offsetM = isHndArr ? route.schedArrUTCM : route.schedDepUTCM;
      const timeStr = offsetH != null ? `${String((offsetH + 9) % 24).padStart(2,'0')}:${String(offsetM).padStart(2,'0')}` : '—';
      timeInfo = `${isHndArr ? 'STA' : 'STD'} ${timeStr}`;
    }

    if (routing) {
      noseInfo = routing.nose || '—';
      const spots = [routing.arv_spot, routing.tow_to && routing.tow_to !== 'STAY' ? `→${routing.tow_to}` : '', routing.dep_spot && routing.dep_spot !== routing.arv_spot ? `→${routing.dep_spot}` : ''].filter(Boolean);
      spotInfo = spots.join('') || '—';
      remarkInfo = routing.remarks || '';

      const rStatus = getRoutingStatus(flight);
      if (rStatus === 'inflight') { statusText = 'In Flight'; statusClass = 'rl-green'; }
      else if (rStatus === 'landed') { statusText = '✓ Arrived'; statusClass = 'rl-dim'; }
      else if (rStatus === 'soon') { statusText = '⏰ Soon'; statusClass = 'rl-amber'; }
      else if (rStatus === 'delayed') { statusText = '⚠ Delayed'; statusClass = 'rl-amber'; }
      else if (rStatus === 'cancelled') { statusText = '❌ Cancelled'; statusClass = 'rl-ruby'; }

      timeInfo = isDep 
        ? `STD ${routing.std || '—'}${routing.etd && routing.etd !== routing.std ? ` (ETD ${routing.etd})` : ''}`
        : `STA ${routing.sta || '—'}${routing.eta && routing.eta !== routing.sta && routing.eta !== 'IN' ? ` (ETA ${routing.eta})` : routing.eta === 'IN' ? ' (IN)' : ''}`;
    }

    const routeDir = `${route.origin.iata_code}→${route.destination.iata_code}`;
    lines.push({
      type: 'value',
      raw: `  ${flight.padEnd(6)} (${routeDir})`.padEnd(17) + ` [${timeInfo}]`.padEnd(26) + ` Nose:${noseInfo.padEnd(3)}`.padEnd(10) + ` Spot:${spotInfo.padEnd(7)}`.padEnd(15) + ` ${statusText}${remarkInfo ? ` (${remarkInfo})` : ''}`,
      cssClass: statusClass
    });
  });

  addBlank();
  addLine('  Daily operational plan updates dynamically with changes.', 'dim');
  addBlank();
  
  schedulePrint(lines);
  drawRouteCanvas(null);
  state.isLoading = false;
  loadingOverlay.classList.add('hidden');
  refreshBtn.disabled = true;
}

/* ══════════════════════════════════════════════
   MAIN TRACKING ENGINE
══════════════════════════════════════════════ */
async function trackFlight(rawInput) {
  const cleaned = rawInput.trim();
  if (!cleaned || state.isLoading) return;

  // Auto-switch mobile tab to RADAR output panel
  if (typeof window.switchMobileTab === 'function') {
    window.switchMobileTab('right');
  }

  state.isLoading = true;
  state.currentFlight = cleaned;

  const dateStr = parseDateInput(cleaned);
  if (dateStr) {
    splash.classList.add('hidden'); flightResult.classList.remove('hidden');
    startLoading();
    outputFlightId.textContent = `DAILY OVERVIEW: ${dateStr}`;
    refreshBtn.disabled = true; flightInput.value = cleaned;
    incrementQuery(); statLastQuery.textContent = dateStr; addCmdHistory(`day ${dateStr}`);
    setTimeout(() => renderDailyOverview(dateStr), 600);
    return;
  }

  const flight = cleaned.toUpperCase().replace(/\s+/g,'');
  if (!flight) return;

  splash.classList.add('hidden'); flightResult.classList.remove('hidden');
  startLoading();
  outputFlightId.textContent = flight;
  refreshBtn.disabled = false; flightInput.value = flight;
  incrementQuery(); statLastQuery.textContent = flight; addCmdHistory(flight);
  refreshIcon.classList.add('spinning');

  let sv = null, routeData = null, asData = null, flightHistory = null, error = null;

  try {
    [sv, routeData] = await Promise.all([
      fetchOpenSky(flight).catch(e => { error = e.message; return null; }),
      fetchAdsbDb(flight).catch(() => null),
    ]);
  } catch (e) {
    error = e.message;
    statApi.textContent = 'DEGRADED'; statApi.className = 'stat-val rl-amber';
  }

  if (sv?.icao24) flightHistory = await fetchOpenSkyFlights(sv.icao24).catch(() => null);
  if (!flightHistory && routeData?.origin?.icao_code) {
    flightHistory = await fetchOpenSkyDeparture(flight, routeData.origin.icao_code).catch(() => null);
  }
  asData = await fetchAviationStack(flight).catch(() => null);

  stopLoading();
  refreshIcon.classList.remove('spinning');

  const now = Date.now();
  state.lastFlightData = { sv, asData, flight, now };
  sbData.textContent = new Date(now).toUTCString().split(' ')[4] + ' UTC';

  if (sv) {
    sbNet.textContent = 'ADS-B LIVE'; sbNet.className = 'sb-val green-text';
  } else {
    sbNet.textContent = error ? 'ERROR' : 'NO SIGNAL';
    sbNet.className = error ? 'sb-val rl-ruby' : 'sb-val rl-amber';
  }

  const originIata = routeData?.origin?.iata_code || asData?.departure?.iata;
  const destIata   = routeData?.destination?.iata_code || asData?.arrival?.iata;
  let canvasData = null;

  if (sv?.longitude != null && sv?.latitude != null) {
    let progress = 0.5;
    if (routeData?.origin && routeData?.destination) {
      const totalDist  = haversine(routeData.origin.latitude, routeData.origin.longitude, routeData.destination.latitude, routeData.destination.longitude);
      const remainDist = haversine(sv.latitude, sv.longitude, routeData.destination.latitude, routeData.destination.longitude);
      progress = Math.max(0, Math.min(1, 1 - (remainDist / totalDist)));
    }
    canvasData = { lon: sv.longitude, lat: sv.latitude, progress, origin: originIata || '???', dest: destIata || '???' };
  } else {
    const drSched = calcScheduledTimes(routeData);
    const nowDR   = Math.floor(Date.now() / 1000);
    const drAirborne = drSched && nowDR > drSched.depUnix && nowDR < drSched.arrUnix && routeData?.origin?.latitude && routeData?.destination?.latitude;
    if (drAirborne) {
      canvasData = { origin: originIata, dest: destIata, estProgress: Math.min(1, Math.max(0, (nowDR - drSched.depUnix) / (drSched.arrUnix - drSched.depUnix))), lon: null, lat: null };
    } else if (originIata || destIata) {
      canvasData = { origin: originIata, dest: destIata };
    }
  }
  drawRouteCanvas(canvasData);

  const lines = buildOutputLines(flight, sv, routeData, flightHistory, asData, now);
  schedulePrint(lines);
  state.isLoading = false;
}

/* ══════════════════════════════════════════════
   COMMAND HISTORY
══════════════════════════════════════════════ */
function addCmdHistory(flight) {
  const ts = new Date().toUTCString().split(' ')[4];
  const entry = document.createElement('div');
  entry.className = 'cmd-entry';
  entry.innerHTML = `<span class="cmd-ts">[${ts}]</span><span class="cmd-txt">track ${flight}</span><span class="cmd-status-ok">→ fetching</span>`;
  cmdHistory.appendChild(entry);
  cmdHistory.scrollTop = cmdHistory.scrollHeight;
  while (cmdHistory.children.length > 6) cmdHistory.removeChild(cmdHistory.firstChild);
}

/* ══════════════════════════════════════════════
   AUTO-REFRESH
══════════════════════════════════════════════ */
function startAutoRefresh() {
  stopAutoRefresh();
  state.autoRefreshTimer = setInterval(() => {
    if (state.currentFlight && !state.isLoading) trackFlight(state.currentFlight);
  }, 30000);
}

function stopAutoRefresh() {
  if (state.autoRefreshTimer) {
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }
}

autoToggle.addEventListener('change', () => {
  if (autoToggle.checked) startAutoRefresh();
  else stopAutoRefresh();
});

/* ══════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════ */
trackBtn.addEventListener('click', () => {
  const val = flightInput.value.trim();
  if (val) trackFlight(val);
});

refreshBtn.addEventListener('click', () => {
  if (state.currentFlight) trackFlight(state.currentFlight);
});

clearBtn.addEventListener('click', () => {
  resultStream.innerHTML = ''; cmdHistory.innerHTML = '';
  splash.classList.remove('hidden'); flightResult.classList.add('hidden');
  outputFlightId.textContent = 'AWAITING INPUT'; refreshBtn.disabled = true;
  state.currentFlight = null; flightInput.value = ''; flightInput.focus();
  drawRouteCanvas(null);
});

const leftTerminal = $('left-terminal');
leftTerminal.addEventListener('dragenter', e => { e.preventDefault(); leftTerminal.classList.add('dragover'); });
leftTerminal.addEventListener('dragover', e => { e.preventDefault(); leftTerminal.classList.add('dragover'); });
leftTerminal.addEventListener('dragleave', e => {
  if (e.relatedTarget && leftTerminal.contains(e.relatedTarget)) return;
  leftTerminal.classList.remove('dragover');
});
leftTerminal.addEventListener('drop', e => {
  e.preventDefault();
  leftTerminal.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length === 0) return;
  const file = files[0];
  if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
    alert('Error: Please drop a valid JSON file.'); return;
  }
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const plan = JSON.parse(evt.target.result);
      if (window.loadPlan(plan)) {
        const lines = [];
        pushBlank(lines);
        pushLine(lines, `┌─ SYSTEM: PLAN LOADED ────────────────────────────────┐`, 'header');
        pushLine(lines, `│  Date: ${plan.date}`.padEnd(54) + '│', 'header');
        pushLine(lines, `│  Routes Loaded: ${plan.routings.length}`.padEnd(54) + '│', 'header');
        pushLine(lines, `└${'─'.repeat(54)}┘`, 'header');
        pushBlank(lines);
        schedulePrint(lines);
      } else {
        alert('Error: Failed to parse plan structure. Check console for details.');
      }
    } catch (err) {
      alert('Error: Invalid JSON syntax.'); console.error(err);
    }
  };
  reader.readAsText(file);
});

flightInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const val = flightInput.value.trim();
    if (val) trackFlight(val);
  }
});

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const flight = btn.dataset.flight;
    flightInput.value = flight;
    trackFlight(flight);
  });
});

flightInput.addEventListener('input', () => {
  const pos = flightInput.selectionStart;
  flightInput.value = flightInput.value.toUpperCase().replace(/[^A-Z0-9\/]/g, '');
  flightInput.setSelectionRange(pos, pos);
});

function updateQuickBtnStatus() {
  const nowUnix = Math.floor(Date.now() / 1000);
  document.querySelectorAll('.quick-btn').forEach(btn => {
    const flight = btn.dataset.flight;
    if (!flight) return;
    const route = KNOWN_ROUTES[flight];
    btn.classList.remove('quick-btn--inflight', 'quick-btn--soon', 'quick-btn--landed', 'quick-btn--delayed', 'quick-btn--cancelled');
    
    const rStatus = getRoutingStatus(flight);
    if (rStatus) {
      btn.classList.add(`quick-btn--${rStatus}`);
    } else if (route) {
      const sched = calcScheduledTimes(route);
      if (sched) {
        const { depUnix, arrUnix } = sched;
        if (nowUnix >= depUnix && nowUnix < arrUnix) btn.classList.add('quick-btn--inflight');
        else if (nowUnix >= arrUnix && nowUnix < arrUnix + 4 * 3600) btn.classList.add('quick-btn--landed');
        else if (nowUnix < depUnix && depUnix - nowUnix < 3600) btn.classList.add('quick-btn--soon');
      }
    }
  });
}

function loadSavedRoutings() {
  try {
    const saved = localStorage.getItem('tfr-routings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.routings && parsed?.date) {
        state.routingsPlan = parsed.routings;
        state.routingsPlanDate = parsed.date;
        const statusEl = document.getElementById('routing-status') || document.getElementById('routingStatus');
        if (statusEl) {
          statusEl.textContent = `Applied: ${parsed.date} (${parsed.routings.length} loaded)`;
          statusEl.className = 'routing-status-text ok';
        }
      }
    }
  } catch (e) { console.error('Failed to load routing plan', e); }
}

window.loadPlan = function(planObj) {
  try {
    if (!planObj || !planObj.date || !Array.isArray(planObj.routings)) return false;
    localStorage.setItem('tfr-routings', JSON.stringify(planObj));
    loadSavedRoutings();
    updateQuickBtnStatus();
    console.log(`%c✓ Operational routing plan loaded successfully: ${planObj.date} (${planObj.routings.length} routes).`, 'color: #39ff7e; font-weight: bold;');
    return true;
  } catch { return false; }
};

window.clearPlan = function() {
  localStorage.removeItem('tfr-routings');
  state.routingsPlan = null;
  state.routingsPlanDate = null;
  updateQuickBtnStatus();
  console.log('%c✓ Operational routing plan cleared.', 'color: #ff2d6b; font-weight: bold;');
};

/* ══════════════════════════════════════════════
   WEATHER MODULE (LIVE WEATHER API)
   ══════════════════════════════════════════════ */
const AIRPORT_COORDINATES = {
  HND: { lat: 35.5494, lon: 139.7798, name: "RJTT (TOKYO HANEDA)" },
  MNL: { lat: 14.5086, lon: 121.0194, name: "RPLL (MANILA INTL)" },
  LAX: { lat: 33.9416, lon: -118.4085, name: "KLAX (LOS ANGELES INTL)" },
  KTM: { lat: 27.6977, lon: 85.3588, name: "VNKT (KATHMANDU INTL)" },
  LHR: { lat: 51.4700, lon: -0.4543, name: "EGLL (LONDON HEATHROW)" },
  CDG: { lat: 49.0097, lon: 2.5479, name: "LFPG (PARIS CHARLES DE GAULLE)" }
};

const CITY_WEATHER_DATABASE = {
  HND: { name: "RJTT (TOKYO HANEDA)", temp: "22°C (72°F)", wind: "SOUTH-SOUTHEAST @ 12 KT", sky: "CLEAR SKY", sunrise: "04:50 AM", sunset: "06:55 PM", icon: "☀️" },
  MNL: { name: "RPLL (MANILA INTL)", temp: "28°C (82°F)", wind: "EAST-SOUTHEAST @ 14 KT", sky: "POURING WATER (HEAVY THUNDERSTORM)", sunrise: "05:25 AM", sunset: "06:20 PM", icon: "🌧️" },
  LAX: { name: "KLAX (LOS ANGELES INTL)", temp: "16°C (61°F)", wind: "WEST-SOUTHWEST @ 12 KT", sky: "CLOUDY (OVERCAST / FOG)", sunrise: "05:40 AM", sunset: "08:00 PM", icon: "☁️" },
  KTM: { name: "VNKT (KATHMANDU INTL)", temp: "25°C (77°F)", wind: "WEST-NORTHWEST @ 6 KT", sky: "CLEAR SKY", sunrise: "05:10 AM", sunset: "07:05 PM", icon: "☀️" },
  LHR: { name: "EGLL (LONDON HEATHROW)", temp: "17°C (63°F)", wind: "WEST-SW @ 12 KT", sky: "CLOUDY (OVERCAST)", sunrise: "04:40 AM", sunset: "09:15 PM", icon: "☁️" },
  CDG: { name: "LFPG (PARIS CHARLES DE GAULLE)", temp: "18°C (64°F)", wind: "SOUTH-SOUTHWEST @ 14 KT", sky: "POURING WATER (LIGHT RAIN)", sunrise: "05:45 AM", sunset: "09:50 PM", icon: "🌧️" }
};

async function refreshWeather() {
  const cityCode = state.activeWeatherCity || 'HND';
  const coords = AIRPORT_COORDINATES[cityCode];
  const cityNameEl = $('wx-city-name');
  
  if (!coords) return;
  if (cityNameEl) cityNameEl.textContent = `${coords.name} // FETCHING METAR...`;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    
    const data = await res.json();
    const current = data.current;

    const weatherMapping = {
      0: { text: "CLEAR SKY", icon: current.is_day ? "☀️" : "🌙" },
      1: { text: "MAINLY CLEAR", icon: current.is_day ? "🌤️" : "🌙" },
      2: { text: "PARTLY CLOUDY", icon: "⛅" },
      3: { text: "OVERCAST", icon: "☁️" },
      45: { text: "FOGGY", icon: "🌫️" },
      48: { text: "RIME FOG", icon: "🌫️" },
      51: { text: "LIGHT DRIZZLE", icon: "🌦️" },
      53: { text: "MODERATE DRIZZLE", icon: "🌦️" },
      55: { text: "HEAVY DRIZZLE", icon: "🌧️" },
      61: { text: "LIGHT RAIN", icon: "🌧️" },
      63: { text: "MODERATE RAIN", icon: "🌧️" },
      65: { text: "HEAVY RAIN", icon: "🌧️" },
      71: { text: "LIGHT SNOW", icon: "❄️" },
      73: { text: "MODERATE SNOW", icon: "❄️" },
      75: { text: "HEAVY SNOW", icon: "❄️" },
      80: { text: "LIGHT RAIN SHOWERS", icon: "🌧️" },
      81: { text: "MODERATE RAIN SHOWERS", icon: "🌧️" },
      82: { text: "VIOLENT RAIN SHOWERS", icon: "⛈️" },
      95: { text: "THUNDERSTORM", icon: "⛈️" },
      96: { text: "THUNDERSTORM WITH HAIL", icon: "⛈️" },
      99: { text: "HEAVY THUNDERSTORM", icon: "⛈️" }
    };

    const mapping = weatherMapping[current.weather_code] || { text: `CODE ${current.weather_code}`, icon: "🌡️" };
    const tempC = Math.round(current.temperature_2m);
    const tempF = Math.round(tempC * 1.8 + 32);

    const windDirDeg = current.wind_direction_10m;
    const windSpeedKt = Math.round(current.wind_speed_10m * 0.539957);
    const windDirections = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const windDirStr = windDirections[Math.round(windDirDeg / 22.5) % 16];

    const staticReport = CITY_WEATHER_DATABASE[cityCode];

    const report = {
      name: coords.name,
      temp: `${tempC}°C (${tempF}°F)`,
      wind: `${windDirDeg}° @ ${windSpeedKt} KT (${windDirStr})`,
      sky: mapping.text,
      sunrise: staticReport.sunrise,
      sunset: staticReport.sunset,
      icon: mapping.icon
    };

    applyWeatherReport(report);
  } catch (err) {
    console.warn("Live weather fetch failed, falling back to static database:", err);
    const staticReport = CITY_WEATHER_DATABASE[cityCode];
    if (staticReport) applyWeatherReport(staticReport);
  }
}

function applyWeatherReport(report) {
  const elements = { 'wx-city-name': 'name', 'wx-temp': 'temp', 'wx-wind': 'wind', 'wx-sky': 'sky', 'wx-sunrise': 'sunrise', 'wx-sunset': 'sunset', 'wx-icon': 'icon' };
  Object.keys(elements).forEach(id => {
    const el = $(id);
    if (el) el.textContent = report[elements[id]];
  });
}

document.querySelectorAll('.wx-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    playClickSound();
    document.querySelectorAll('.wx-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeWeatherCity = tab.dataset.city;
    refreshWeather();
  });
});

/* ══════════════════════════════════════════════
   INITIAL DRAW & KEYBOARD LISTENERS
══════════════════════════════════════════════ */
drawRouteCanvas(null);
flightInput.focus();
loadSavedRoutings();
updateQuickBtnStatus();
refreshWeather();
setInterval(updateQuickBtnStatus, 30000);

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    if (state.currentFlight) trackFlight(state.currentFlight);
  }
  if (e.key === 'Escape') flightInput.focus();
});

/* ══════════════════════════════════════════════
   AUDIO SYNTH FX (Web Audio API)
══════════════════════════════════════════════ */
let audioCtx = null;
const initAudio = () => { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); };

function playSynth(type, freqs, gainTimes, duration) {
  if (!state.soundEnabled) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type;
    freqs.forEach(([f, t, ramp]) => {
      if (ramp === 'exp') osc.frequency.exponentialRampToValueAtTime(f, now + t);
      else if (ramp === 'linear') osc.frequency.linearRampToValueAtTime(f, now + t);
      else osc.frequency.setValueAtTime(f, now + t);
    });
    gainTimes.forEach(([g, t, ramp]) => {
      if (ramp === 'exp') gain.gain.exponentialRampToValueAtTime(g, now + t);
      else if (ramp === 'linear') gain.gain.linearRampToValueAtTime(g, now + t);
      else gain.gain.setValueAtTime(g, now + t);
    });
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(now + duration);
  } catch (e) { console.warn(e); }
}

const playClickSound = () => playSynth('triangle', [[110, 0], [10, 0.04, 'exp']], [[state.volume * 0.4, 0], [0.001, 0.04, 'exp']], 0.04);
const playChimeSound = () => playSynth('sine', [[587.33, 0], [880, 0.08]], [[state.volume * 0.6, 0], [0.001, 0.35, 'exp']], 0.35);
const playWarningSound = () => playSynth('sawtooth', [[180, 0], [180, 0.12]], [[state.volume * 0.8, 0], [0.001, 0.28, 'exp']], 0.28);

function playEngineStartSound() {
  if (!state.soundEnabled) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const duration = 2.0;

    const mainGain = audioCtx.createGain();
    mainGain.gain.setValueAtTime(state.volume * 0.9, now);
    mainGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(350, now + duration);

    const starterOsc = audioCtx.createOscillator();
    starterOsc.type = 'sawtooth';
    starterOsc.frequency.setValueAtTime(110, now);
    
    const starterGain = audioCtx.createGain();
    starterGain.gain.setValueAtTime(0.3, now);
    for (let i = 0; i < 6; i++) {
      const t = now + i * 0.13;
      starterGain.gain.setValueAtTime(0.3, t);
      starterGain.gain.linearRampToValueAtTime(0.02, t + 0.08);
      starterGain.gain.setValueAtTime(0.02, t + 0.08);
    }
    starterGain.gain.linearRampToValueAtTime(0, now + 0.8);

    starterOsc.connect(starterGain);
    starterGain.connect(filter);

    const engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'triangle';
    engineOsc.frequency.setValueAtTime(80, now + 0.8);
    engineOsc.frequency.linearRampToValueAtTime(160, now + 1.1);
    engineOsc.frequency.exponentialRampToValueAtTime(65, now + 2.0);

    const engineGain = audioCtx.createGain();
    engineGain.gain.setValueAtTime(0, now);
    engineGain.gain.setValueAtTime(0, now + 0.8);
    engineGain.gain.linearRampToValueAtTime(0.7, now + 0.95);
    engineGain.gain.exponentialRampToValueAtTime(0.25, now + 1.4);
    engineGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

    engineOsc.connect(engineGain);
    engineGain.connect(filter);

    const buzzOsc = audioCtx.createOscillator();
    buzzOsc.type = 'sawtooth';
    buzzOsc.frequency.setValueAtTime(90, now + 0.8);
    buzzOsc.frequency.linearRampToValueAtTime(170, now + 1.1);
    buzzOsc.frequency.exponentialRampToValueAtTime(70, now + 2.0);

    const buzzGain = audioCtx.createGain();
    buzzGain.gain.setValueAtTime(0, now);
    buzzGain.gain.setValueAtTime(0, now + 0.8);
    buzzGain.gain.linearRampToValueAtTime(0.2, now + 0.95);
    buzzGain.gain.exponentialRampToValueAtTime(0.08, now + 1.4);
    buzzGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

    buzzOsc.connect(buzzGain);
    buzzGain.connect(filter);

    filter.connect(mainGain);
    mainGain.connect(audioCtx.destination);

    starterOsc.start(now);
    starterOsc.stop(now + 0.8);

    engineOsc.start(now + 0.8);
    engineOsc.stop(now + duration);

    buzzOsc.start(now + 0.8);
    buzzOsc.stop(now + duration);

  } catch (e) {
    console.warn("Failed to play engine start sound", e);
  }
}

let isWobbling = false;
const neonBox = document.querySelector('.wagon-neon-box');
const neonWrapper = document.querySelector('.wagon-neon-wrapper');

document.addEventListener('click', () => {
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}, { once: true });

if (neonBox && neonWrapper) {
  neonBox.addEventListener('click', () => {
    if (isWobbling) return;
    isWobbling = true;
    playEngineStartSound();
    neonWrapper.classList.add('wobbling');
    setTimeout(() => {
      neonWrapper.classList.remove('wobbling');
      isWobbling = false;
    }, 2000);
  });
}

flightInput.addEventListener('keypress', () => playClickSound());

/* ══════════════════════════════════════════════
   SETTINGS PANEL CONTROLS
══════════════════════════════════════════════ */
const sweepToggle = $('radar-sweep-toggle');
const speedSlider = $('radar-speed-slider');

sweepToggle.addEventListener('change', () => {
  state.radarSweepActive = sweepToggle.checked;
  playClickSound();
  if (!state.radarSweepActive) drawRouteCanvas(state.currentCanvasData);
});

speedSlider.addEventListener('input', () => {
  state.sweepSpeed = parseInt(speedSlider.value);
});

const soundToggle = $('sound-toggle');
const volumeSlider = $('volume-slider');

soundToggle.addEventListener('change', () => {
  state.soundEnabled = soundToggle.checked;
  if (state.soundEnabled) playClickSound();
});

volumeSlider.addEventListener('input', () => {
  state.volume = parseInt(volumeSlider.value) / 10;
});

document.querySelectorAll('.sound-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.sound;
    if (type === 'click') playClickSound();
    else if (type === 'chime') playChimeSound();
    else if (type === 'alert') playWarningSound();
  });
});

/* ══════════════════════════════════════════════
   AUTOPLAY DEMO PRESENTATION
══════════════════════════════════════════════ */
const autoplayBtn = $('autoplay-btn');

autoplayBtn.addEventListener('click', () => {
  if (state.isLoading) return;
  playChimeSound();
  autoplayBtn.disabled = true;
  autoplayBtn.textContent = "PLAYING DEMO...";

  const startLines = [
    { type: 'blank' },
    { type: 'header', raw: '┌─ 🤖 DEMO SEQUENCE STARTING ──────────────────────────┐' },
    { type: 'header', raw: '│  Loading dispatch plans and executing query...       │' },
    { type: 'header', raw: '└──────────────────────────────────────────────────────┘' },
    { type: 'blank' }
  ];
  schedulePrint(startLines);

  setTimeout(() => {
    const mockJson = {
      "date": "2026-06-05",
      "airport": "HND",
      "routings": [
        { "arrival": "169", "sta": "04:45", "eta": "IN", "ac_type": "B789", "nose": "8LY", "arv_spot": "110", "tow_to": "153", "dep_spot": "144", "departure": "170", "std": "11:55", "remarks": "AA170 TOW IN AT 1000L" },
        { "arrival": "175", "sta": "14:20", "eta": "15:18", "ac_type": "B773", "nose": "7LT", "arv_spot": "102", "tow_to": "STAY", "dep_spot": "102", "departure": "176", "std": "16:30", "etd": "17:00", "remarks": "DLY DUE MAINTENANCE" },
        { "arrival": "167", "sta": "13:55", "eta": "13:21", "ac_type": "B789", "nose": "8LE", "arv_spot": "147", "tow_to": "STAY", "dep_spot": "147", "departure": "168", "std": "17:45" }
      ]
    };

    window.loadPlan(mockJson);
    playChimeSound();

    const loadLines = [
      { type: 'blank' },
      { type: 'header', raw: '┌─ SYSTEM: PLAN LOADED ────────────────────────────────┐' },
      { type: 'header', raw: `│  Date: 2026-06-05                                   │` },
      { type: 'header', raw: `│  Routes Loaded: 3                                   │` },
      { type: 'header', raw: '└──────────────────────────────────────────────────────┘' },
      { type: 'blank' }
    ];
    schedulePrint(loadLines);

    setTimeout(() => {
      const targetQuery = "05JUN26";
      flightInput.value = "";
      let charIdx = 0;

      const typeInterval = setInterval(() => {
        if (charIdx < targetQuery.length) {
          flightInput.value += targetQuery[charIdx];
          playClickSound();
          charIdx++;
        } else {
          clearInterval(typeInterval);
          setTimeout(() => {
            trackFlight(targetQuery);
            playChimeSound();
            autoplayBtn.disabled = false;
            autoplayBtn.textContent = "▶ AUTOPLAY DEMO";
          }, 800);
        }
      }, 150);

    }, 1800);

  }, 1500);
});

/* ══════════════════════════════════════════════
   RADAR ANIMATION LOOP
══════════════════════════════════════════════ */
function animateRadarSweep() {
  if (state.radarSweepActive) {
    drawRouteCanvas(state.currentCanvasData);
  }
  requestAnimationFrame(animateRadarSweep);
}
animateRadarSweep();

/* ══════════════════════════════════════════════
   MOBILE TABS CONTROLLER
   ══════════════════════════════════════════════ */
function setupMobileTabs() {
  const tabBtns = document.querySelectorAll('.m-tab-btn');
  const panels = {
    left: document.querySelector('.panel-left'),
    right: document.querySelector('.panel-right'),
    aux: document.querySelector('.panel-aux')
  };

  // Sync initial state based on active button
  const activeBtn = document.querySelector('.m-tab-btn.active');
  if (activeBtn) {
    const target = activeBtn.dataset.target;
    Object.keys(panels).forEach(key => {
      if (panels[key]) {
        panels[key].classList.toggle('active', key === target);
      }
    });
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      
      // Update active button classes
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update active panel classes
      Object.keys(panels).forEach(key => {
        if (panels[key]) {
          panels[key].classList.toggle('active', key === target);
        }
      });

      // Play click sound if volume/FX is enabled
      if (typeof playClickSound === 'function') {
        playClickSound();
      }
    });
  });

  // Global helper to switch tabs programmatically
  window.switchMobileTab = function(target) {
    const targetBtn = document.querySelector(`.m-tab-btn[data-target="${target}"]`);
    if (targetBtn) {
      targetBtn.click();
    }
  };
}

// Bind mobile tabs controller
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupMobileTabs);
} else {
  setupMobileTabs();
}

/* ══════════════════════════════════════════════
   PULL TO REFRESH SYSTEM
   ══════════════════════════════════════════════ */
// Pulling down to 12 parsecs, Chewie! 🚀 Millennium Falcon speed refresh activated.
function setupPullToRefresh() {
  const container = document.body;
  const indicator = $('pull-refresh-indicator');
  const icon = indicator ? indicator.querySelector('.pull-refresh-icon') : null;
  const text = indicator ? indicator.querySelector('#pull-refresh-text') : null;

  if (!indicator) return;

  let startY = 0;
  let currentY = 0;
  let pullDistance = 0;
  let isPulling = false;
  const threshold = 65; // px pull needed to trigger
  const maxPull = 100; // max distance visual pull

  container.addEventListener('touchstart', (e) => {
    // Only allow pull to refresh on mobile screen layout
    if (window.innerWidth > 900) return;
    
    // Check if the current active panel content body is at the very top of its scroll
    const activePanelBody = document.querySelector('.panel.active .terminal-body, .panel.active .output-body, .panel.active .aux-body');
    const scrollTop = activePanelBody ? activePanelBody.scrollTop : 0;
    
    if (scrollTop <= 0) {
      startY = e.touches[0].pageY;
      isPulling = true;
      indicator.classList.remove('release');
      indicator.style.transition = 'none';
      if (icon) icon.style.transform = 'rotate(0deg)';
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    
    currentY = e.touches[0].pageY;
    const diff = currentY - startY;

    if (diff > 0) {
      // Apply exponential resistance to the pull
      pullDistance = Math.min(maxPull, diff * 0.4);
      
      // Show and slide down the indicator
      indicator.style.display = 'flex';
      indicator.classList.add('visible');
      indicator.style.transform = `translateY(${pullDistance - 50}px)`; // Start hidden offset by height (50px)
      
      // Rotate refresh icon based on distance
      if (icon) {
        icon.style.transform = `rotate(${pullDistance * 4}deg)`;
      }

      if (text) {
        if (pullDistance >= threshold) {
          text.textContent = "RELEASE TO DISPATCH SYSTEM SCAN";
          text.style.color = 'var(--green-bright)';
        } else {
          text.textContent = "PULL TO SCAN SKY";
          text.style.color = 'var(--ruby-bright)';
        }
      }

      // Prevent default pull-to-refresh of Chrome/Safari if user drags down significantly
      if (diff > 10 && e.cancelable) {
        e.preventDefault();
      }
    }
  }, { passive: false });

  container.addEventListener('touchend', () => {
    if (!isPulling) return;
    isPulling = false;

    if (pullDistance >= threshold) {
      // Trigger refresh sequence!
      indicator.classList.add('release');
      indicator.style.transition = 'transform 0.3s ease';
      indicator.style.transform = `translateY(0px)`; // Stay at top bar level
      if (text) {
        text.textContent = "SCANNING SKY TELEMETRY...";
        text.style.color = 'var(--green-bright)';
      }

      // Trigger the refresh action
      executePullRefreshAction();
    } else {
      // Cancel pull
      resetPullIndicator();
    }
  });

  function resetPullIndicator() {
    indicator.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    indicator.style.transform = 'translateY(-100%)';
    indicator.classList.remove('visible', 'release');
    pullDistance = 0;
  }

  function executePullRefreshAction() {
    // Play chime sound FX
    if (typeof playChimeSound === 'function') {
      playChimeSound();
    }

    setTimeout(() => {
      // If a flight is currently tracked, reload it. Otherwise trigger metar reload
      if (state.currentFlight) {
        trackFlight(state.currentFlight);
      } else {
        // Just trigger boot sequence prints or reload current weather
        if (typeof refreshWeather === 'function') {
          refreshWeather();
        }
        
        // Print message to terminal history
        const lines = [
          { type: 'blank' },
          { type: 'header', raw: '┌─ 🛸 PILOT INITIATED SCAN ────────────────────────────┐' },
          { type: 'header', raw: '│  Re-scanning ADS-B receivers and weather ports...    │' },
          { type: 'header', raw: '└──────────────────────────────────────────────────────┘' }
        ];
        if (typeof schedulePrint === 'function') {
          schedulePrint(lines);
        }
      }

      // Hide indicator smoothly after a delay
      setTimeout(() => {
        resetPullIndicator();
      }, 1000);

    }, 800);
  }
}

// Bind mobile pull to refresh controller
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPullToRefresh);
} else {
  setupPullToRefresh();
}
