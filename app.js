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
  // Radar sweep parameters
  radarSweepActive: true,
  sweepX: 0,
  sweepSpeed: 2,
  currentCanvasData: null,
  // Sound FX parameters
  soundEnabled: true,
  volume: 0.3,
  // Weather parameter
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
   CLOCK
══════════════════════════════════════════════ */
function updateClock() {
  const now = new Date();
  const datePart = now.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Tokyo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).toUpperCase().replace(/\s/g, '-');

  const dayPart = now.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).toUpperCase();

  const dateStr = `${datePart} (${dayPart})`;

  const timeStr = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  if (dateDisplay) dateDisplay.textContent = dateStr;
  clock.textContent = timeStr;
}

updateClock();
setInterval(updateClock, 1000);

/* ══════════════════════════════════════════════
   MEMORY DISPLAY (approx)
══════════════════════════════════════════════ */
function updateMemDisplay() {
  if (performance && performance.memory) {
    const mb = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
    sbMem.textContent = `${mb} MB`;
  } else {
    sbMem.textContent = '—';
  }
}
setInterval(updateMemDisplay, 5000);
updateMemDisplay();

/* ══════════════════════════════════════════════
   QUERY COUNT
══════════════════════════════════════════════ */
function incrementQuery() {
  state.queryCount++;
  sessionStorage.setItem('tfr-qcount', state.queryCount);
  statQueries.textContent = state.queryCount;
}
statQueries.textContent = state.queryCount;

/* ══════════════════════════════════════════════
   AIRLINE DATABASE (IATA → full name)
══════════════════════════════════════════════ */
const AIRLINES = {
  AA: 'American Airlines',        UA: 'United Airlines',
  DL: 'Delta Air Lines',          WN: 'Southwest Airlines',
  B6: 'JetBlue Airways',          AS: 'Alaska Airlines',
  NK: 'Spirit Airlines',          F9: 'Frontier Airlines',
  G4: 'Allegiant Air',            HA: 'Hawaiian Airlines',
  BA: 'British Airways',          LH: 'Lufthansa',
  AF: 'Air France',               KL: 'KLM Royal Dutch',
  IB: 'Iberia',                   AZ: 'ITA Airways',
  SK: 'Scandinavian Airlines',    AY: 'Finnair',
  LX: 'Swiss International',      OS: 'Austrian Airlines',
  TK: 'Turkish Airlines',         EK: 'Emirates',
  EY: 'Etihad Airways',           QR: 'Qatar Airways',
  SQ: 'Singapore Airlines',       CX: 'Cathay Pacific',
  NH: 'All Nippon Airways',       JL: 'Japan Airlines',
  KE: 'Korean Air',               OZ: 'Asiana Airlines',
  QF: 'Qantas',                   NZ: 'Air New Zealand',
  CA: 'Air China',                MU: 'China Eastern',
  CZ: 'China Southern',           AI: 'Air India',
  SU: 'Aeroflot',                 AC: 'Air Canada',
  AM: 'Aeromexico',               LA: 'LATAM Airlines',
  AV: 'Avianca',                  CM: 'Copa Airlines',
  G3: 'Gol Transportes Aéreos',   AD: 'Azul Brazilian Airlines',
  FR: 'Ryanair',                  U2: 'easyJet',
  VY: 'Vueling',                  W6: 'Wizz Air',
  PC: 'Pegasus Airlines',         BT: 'airBaltic',
  WZ: 'Red Wings',                PS: 'Ukraine International',
  MS: 'EgyptAir',                 ET: 'Ethiopian Airlines',
  SA: 'South African Airways',    KQ: 'Kenya Airways',
};

function getAirlineName(iata) {
  if (!iata) return 'Unknown Airline';
  const code = iata.toUpperCase().replace(/\d+$/, '');
  return AIRLINES[code] || `${code} Airlines`;
}

/* ══════════════════════════════════════════════
   AIRPORT DATABASE (ICAO → name + city)
══════════════════════════════════════════════ */
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

function lookupAirport(icao) {
  if (!icao) return null;
  return AIRPORTS[icao.toUpperCase()] || null;
}

function airportDisplay(icao) {
  const ap = lookupAirport(icao);
  if (!ap) return icao || 'Unknown';
  return `${ap.iata} — ${ap.name} (${ap.city})`;
}

/* ══════════════════════════════════════════════
   FLIGHT STATUS DECODER
══════════════════════════════════════════════ */
const STATUS_LABELS = {
  0: ['ON GROUND', 'rl-amber'],
  1: ['AIRBORNE', 'rl-green'],
  2: ['AIRBORNE', 'rl-green'],
};

function decodeStatus(onGround, velocity) {
  if (onGround) return ['ON GROUND', 'rl-amber'];
  if (velocity && velocity > 50) return ['AIRBORNE', 'rl-green'];
  return ['UNKNOWN', 'rl-dim'];
}

/* ══════════════════════════════════════════════
   OPENSKY API
══════════════════════════════════════════════ */
async function fetchOpenSky(callsign) {
  // OpenSky returns all states; we filter by callsign
  const url = `https://opensky-network.org/api/states/all?callsign=${encodeURIComponent(callsign.padEnd(8))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);
  const data = await res.json();
  if (!data.states || data.states.length === 0) return null;

  // state vector indices:
  // 0: icao24, 1: callsign, 2: origin_country, 3: time_position,
  // 4: last_contact, 5: longitude, 6: latitude, 7: baro_alt,
  // 8: on_ground, 9: velocity, 10: true_track, 11: vert_rate,
  // 12: sensors, 13: geo_altitude, 14: squawk, 15: spi, 16: position_source
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

/* ══════════════════════════════════════════════
   AVIATIONSTACK (free tier, 100 calls/month)
   - Falls back to demo/enriched data if unavailable
══════════════════════════════════════════════ */
async function fetchAviationStack(flight) {
  // AviationStack free plan — user can add their own key
  const API_KEY = window.AVIATIONSTACK_KEY || '';
  if (!API_KEY) return null;
  try {
    const url = `https://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_iata=${encodeURIComponent(flight)}&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data || data.data.length === 0) return null;
    return data.data[0];
  } catch { return null; }
}

/* ══════════════════════════════════════════════
   KNOWN ROUTES — hardcoded correct data for tracked flights
   Overrides API to fix NRT/HND confusion and ensure accuracy
══════════════════════════════════════════════ */
const _HND = {
  iata_code: 'HND', icao_code: 'RJTT',
  name: 'Tokyo Haneda Airport',
  municipality: 'Tokyo', country_name: 'Japan',
  latitude: 35.55280, longitude: 139.77960,
};
const _NRT = {
  iata_code: 'NRT', icao_code: 'RJAA',
  name: 'Narita International Airport',
  municipality: 'Tokyo', country_name: 'Japan',
  latitude: 35.77667, longitude: 140.38639,
};
const _JFK = {
  iata_code: 'JFK', icao_code: 'KJFK',
  name: 'John F. Kennedy International Airport',
  municipality: 'New York', country_name: 'United States',
  latitude: 40.63972, longitude: -73.77889,
};
const _LAX = {
  iata_code: 'LAX', icao_code: 'KLAX',
  name: 'Los Angeles International Airport',
  municipality: 'Los Angeles', country_name: 'United States',
  latitude: 33.94250, longitude: -118.40806,
};
const _DFW = {
  iata_code: 'DFW', icao_code: 'KDFW',
  name: 'Dallas/Fort Worth International Airport',
  municipality: 'Dallas-Fort Worth', country_name: 'United States',
  latitude: 32.89700, longitude: -97.03800,
};
const _ORD = {
  iata_code: 'ORD', icao_code: 'KORD',
  name: "O'Hare International Airport",
  municipality: 'Chicago', country_name: 'United States',
  latitude: 41.97960, longitude: -87.90480,
};
const _AA = { name: 'American Airlines', iata: 'AA', icao: 'AAL' };

const KNOWN_ROUTES = {
  // schedDep/schedArr = confirmed UTC times from OAG/Google Flights
  // PAIR 1: LAX ↔ HND
  AA169: { airline: _AA, origin: _LAX, destination: _HND, durationHours: 11.917,
           schedDepUTCH:  7, schedDepUTCM: 50,   // LAX 00:50 PDT (confirmed OAG)
           schedArrUTCH: 19, schedArrUTCM: 45 }, // HND 04:45 JST +1d (confirmed OAG)
  AA170: { airline: _AA, origin: _HND, destination: _LAX, durationHours: 10.083,
           schedDepUTCH:  2, schedDepUTCM: 55,   // HND 11:55 JST (confirmed)
           schedArrUTCH: 13, schedArrUTCM:  0 }, // LAX 06:00 PDT (confirmed)
  // PAIR 2: DFW ↔ HND
  AA175: { airline: _AA, origin: _DFW, destination: _HND, durationHours: 13.083,
           schedDepUTCH: 16, schedDepUTCM: 15,   // DFW 11:15 CDT (confirmed)
           schedArrUTCH:  5, schedArrUTCM: 20 }, // HND 14:20 JST +1d (confirmed)
  AA176: { airline: _AA, origin: _HND, destination: _DFW, durationHours: 12.083,
           schedDepUTCH:  7, schedDepUTCM: 30,   // HND 16:30 JST (confirmed)
           schedArrUTCH: 19, schedArrUTCM: 35 }, // DFW 14:35 CDT (confirmed)
  // PAIR 3: JFK ↔ HND
  AA167: { airline: _AA, origin: _JFK, destination: _HND, durationHours: 14.167,
           schedDepUTCH: 14, schedDepUTCM: 30,   // JFK 10:30 EDT (confirmed)
           schedArrUTCH:  4, schedArrUTCM: 40 }, // HND 13:40 JST +1d (confirmed)
  AA168: { airline: _AA, origin: _HND, destination: _JFK, durationHours: 13.167,
           schedDepUTCH:  8, schedDepUTCM: 45,   // HND 17:45 JST (confirmed)
           schedArrUTCH: 21, schedArrUTCM: 55 }, // JFK 17:55 EDT (confirmed)
  // PAIR 4: EXTRA ↔ HND
  AA9603: { airline: _AA, origin: _LAX, destination: _HND, durationHours: 11.917,
            schedDepUTCH:  9, schedDepUTCM: 10,
            schedArrUTCH: 21, schedArrUTCM: 10 },
  AA26:  { airline: _AA, origin: _HND, destination: _LAX, durationHours: 10.083,
           schedDepUTCH: 10, schedDepUTCM: 45,   // HND 19:45 JST (confirmed)
           schedArrUTCH: 20, schedArrUTCM: 50 }, // LAX 13:50 PDT (confirmed)
  // PAIR 5: LAX ↔ FERRY
  AA27:  { airline: _AA, origin: _LAX, destination: _HND, durationHours: 11.583,
           schedDepUTCH: 19, schedDepUTCM: 15,   // LAX 12:15 PDT (confirmed)
           schedArrUTCH:  6, schedArrUTCM: 50 }, // HND 15:50 JST +1d (confirmed)
  AA9600: { airline: _AA, origin: _HND, destination: _LAX, durationHours: 10.083,
            schedDepUTCH: 13, schedDepUTCM:  0,
            schedArrUTCH: 23, schedArrUTCM:  0 },
  // PAIR 6: DFW ↔ NRT
  AA61:  { airline: _AA, origin: _DFW, destination: _NRT, durationHours: 13.5,
           schedDepUTCH: 15, schedDepUTCM: 30,
           schedArrUTCH:  5, schedArrUTCM:  7 },
  AA60:  { airline: _AA, origin: _NRT, destination: _DFW, durationHours: 12.0,
           schedDepUTCH:  9, schedDepUTCM: 30,
           schedArrUTCH: 21, schedArrUTCM: 30 },
};

/* Compute today’s scheduled departure + arrival from hardcoded UTC hours.
   Handles active flights, recent arrivals, and upcoming flights correctly. */
function calcScheduledTimes(routeData) {
  if (routeData?.schedDepUTCH == null) return null;
  const now = Date.now();
  const nowUnix = Math.floor(now / 1000);
  const duration = routeData.durationHours || 12;

  // Helper to construct a timestamp for a given offset from today (e.g. -1, 0, +1)
  function getUnixTimesForOffset(daysOffset) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + daysOffset);
    d.setUTCHours(routeData.schedDepUTCH, routeData.schedDepUTCM, 0, 0);
    const depUnix = Math.floor(d.getTime() / 1000);
    const arrUnix = depUnix + Math.round(duration * 3600);
    return { depUnix, arrUnix };
  }

  const yesterday = getUnixTimesForOffset(-1);
  const today     = getUnixTimesForOffset(0);
  const tomorrow  = getUnixTimesForOffset(1);

  // 1. Check if yesterday's flight is currently active (airborne)
  if (nowUnix >= yesterday.depUnix && nowUnix < yesterday.arrUnix) {
    return yesterday;
  }
  // 2. Check if today's flight is currently active
  if (nowUnix >= today.depUnix && nowUnix < today.arrUnix) {
    return today;
  }
  // 3. Check if tomorrow's flight is currently active
  if (nowUnix >= tomorrow.depUnix && nowUnix < tomorrow.arrUnix) {
    return tomorrow;
  }

  // 4. Check if yesterday's flight landed recently (within 4 hours)
  if (nowUnix >= yesterday.arrUnix && nowUnix < yesterday.arrUnix + 4 * 3600) {
    return yesterday;
  }
  // 5. Check if today's flight landed recently (within 4 hours)
  if (nowUnix >= today.arrUnix && nowUnix < today.arrUnix + 4 * 3600) {
    return today;
  }

  // 6. Otherwise, return the next upcoming flight (today if not yet departed, else tomorrow)
  if (nowUnix < today.depUnix) {
    return today;
  }
  return tomorrow;
}

/* Helper to search the loaded operational routing plan for a flight number and verify date */
function findRoutingForFlight(flight, dateStr) {
  if (!state.routingsPlan) return null;
  if (dateStr && state.routingsPlanDate && state.routingsPlanDate !== dateStr) return null;
  const num = flight.replace(/[^0-9]/g, '');
  return state.routingsPlan.find(r => r.arrival === num || r.departure === num);
}

/* Helper to determine button status category from operational routing */
function getRoutingStatus(btnFlight) {
  const planDateStr = state.routingsPlanDate || new Date().toISOString().split('T')[0];
  const routing = findRoutingForFlight(btnFlight, planDateStr);
  if (!routing) return null;
  
  const num = btnFlight.replace(/[^0-9]/g, '');
  const isDep = (routing.departure === num);
  
  // Cancelled check
  const remarks = (routing.remarks || '').toUpperCase();
  if (remarks.includes('CANCEL') || remarks.includes('CNCL')) {
    return 'cancelled';
  }

  // Helper to parse HH:MM to JST Unix timestamp
  function parseJstTimeToUnix(timeStr) {
    if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return null;
    const [hh, mm] = timeStr.split(':').map(Number);
    const iso = `${planDateStr}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00+09:00`;
    return Math.floor(new Date(iso).getTime() / 1000);
  }

  const nowUnix = Math.floor(Date.now() / 1000);

  if (isDep) {
    const stdUnix = parseJstTimeToUnix(routing.std);
    const etdUnix = parseJstTimeToUnix(routing.etd) || stdUnix;
    const duration = 10.5; // Default approx duration
    const arrUnix = etdUnix + Math.round(duration * 3600);

    if (nowUnix >= arrUnix) {
      return 'landed';
    }
    if (nowUnix >= etdUnix && nowUnix < arrUnix) {
      return 'inflight';
    }
    // Delay check (etd != std or contains delay keywords)
    const isDelayed = (routing.etd && routing.etd !== routing.std) || remarks.includes('DLY') || remarks.includes('DELAY');
    if (isDelayed) {
      return 'delayed';
    }
    if (stdUnix && stdUnix - nowUnix > 0 && stdUnix - nowUnix < 3600) {
      return 'soon';
    }
    return 'scheduled';
  } else {
    if (routing.eta === 'IN') {
      return 'landed';
    }
    const staUnix = parseJstTimeToUnix(routing.sta);
    const etaUnix = parseJstTimeToUnix(routing.eta) || staUnix;
    const duration = 12.0;
    const depUnix = etaUnix - Math.round(duration * 3600);

    if (nowUnix >= etaUnix) {
      return 'landed';
    }
    if (nowUnix >= depUnix && nowUnix < etaUnix) {
      return 'inflight';
    }
    // Delay check
    const isDelayed = (routing.eta && routing.eta !== routing.sta) || remarks.includes('DLY') || remarks.includes('DELAY');
    if (isDelayed) {
      return 'delayed';
    }
    return 'scheduled';
  }
}

/* ══════════════════════════════════════════════
   IATA → ICAO airline code map (for callsign lookup)
══════════════════════════════════════════════ */
const IATA_TO_ICAO_AIRLINE = {
  AA:'AAL', UA:'UAL', DL:'DAL', WN:'SWA', B6:'JBU',
  AS:'ASA', NK:'NKS', F9:'FFT', HA:'HAL',
  BA:'BAW', LH:'DLH', AF:'AFR', KL:'KLM', EK:'UAE',
  QR:'QTR', SQ:'SIA', NH:'ANA', JL:'JAL', KE:'KAL',
  CX:'CPA', QF:'QFA', AC:'ACA', AM:'AMX',
};

/* ══════════════════════════════════════════════
   OPENSKY DEPARTURE API — finds a flight by callsign
   at its origin airport (no icao24 needed)
══════════════════════════════════════════════ */
async function fetchOpenSkyDeparture(iataCallsign, originIcaoAirport) {
  if (!originIcaoAirport) return null;
  try {
    const now   = Math.floor(Date.now() / 1000);
    const begin = now - 86400; // search last 24 hours
    const url   = `https://opensky-network.org/api/flights/departure?airport=${originIcaoAirport}&begin=${begin}&end=${now}`;
    const res   = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data  = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    // Build ICAO callsign: e.g. AA169 → AAL169
    const iata      = iataCallsign.match(/^([A-Z]{2})/)?.[1] || '';
    const flightNum = iataCallsign.replace(/^[A-Z]{2}/, '');
    const icaoCs    = (IATA_TO_ICAO_AIRLINE[iata] || iata) + flightNum;

    const match = data.find(f => f.callsign && f.callsign.trim() === icaoCs);
    return match || null;
  } catch { return null; }
}

/* ══════════════════════════════════════════════
   ADSBDB — free, no key, route/airline data
   Checks KNOWN_ROUTES first, then falls back to API
══════════════════════════════════════════════ */
async function fetchAdsbDb(callsign) {
  // Use hardcoded route if available — prevents NRT/HND confusion
  if (KNOWN_ROUTES[callsign]) return KNOWN_ROUTES[callsign];
  try {
    const url = `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.response?.flightroute || null;
  } catch { return null; }
}

/* ══════════════════════════════════════════════
   OPENSKY AIRCRAFT FLIGHTS — free, no key
   Gets historical flight record (departure/arrival times)
══════════════════════════════════════════════ */
async function fetchOpenSkyFlights(icao24) {
  if (!icao24) return null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const begin = now - 86400; // last 24 hours
    const url = `https://opensky-network.org/api/flights/aircraft?icao24=${icao24}&begin=${begin}&end=${now}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[data.length - 1]; // most recent flight record
  } catch { return null; }
}

/* ══════════════════════════════════════════════
   HAVERSINE — great-circle distance (km)
══════════════════════════════════════════════ */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ══════════════════════════════════════════════
   CALCULATE ETA from live position + speed
══════════════════════════════════════════════ */
function calcETA(sv, routeData) {
  if (!sv || !routeData?.destination) return null;
  const { latitude: lat1, longitude: lon1, velocity_ms } = sv;
  const { latitude: lat2, longitude: lon2 } = routeData.destination;
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  if (!velocity_ms || velocity_ms < 50) return null; // not airborne
  const distKm = haversine(lat1, lon1, lat2, lon2);
  const speedKmh = velocity_ms * 3.6;
  const etaHours = distKm / speedKmh;
  const etaMs = Date.now() + etaHours * 3600 * 1000;
  return { distKm: Math.round(distKm), speedKmh: Math.round(speedKmh), etaHours, etaMs };
}

/* ══════════════════════════════════════════════
   UNIT CONVERSIONS
══════════════════════════════════════════════ */
const msToKnots = v => v ? (v * 1.94384).toFixed(0) : '—';
const msToKmh   = v => v ? (v * 3.6).toFixed(0) : '—';
const mToFt     = m => m ? (m * 3.28084).toFixed(0) : '—';
const mToFl     = m => m ? `FL${Math.round(m * 3.28084 / 100)}` : '—';
const degToCompass = d => {
  if (d == null) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(d / 22.5) % 16];
};
function formatUnixTime(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toUTCString().replace(' GMT','').replace(/,\s/,'T') + ' UTC';
}
function secondsAgo(ts) {
  if (!ts) return '—';
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ${diff%60}s ago`;
  return `${Math.floor(diff/3600)}h ${Math.floor((diff%3600)/60)}m ago`;
}

/* ══════════════════════════════════════════════
   TERMINAL PRINT ENGINE
══════════════════════════════════════════════ */
function clearOutput() {
  resultStream.innerHTML = '';
}

let printQueue = [];
let printTimer = null;

function schedulePrint(lines) {
  clearOutput();
  printQueue = [...lines];
  let delay = 0;
  for (let i = 0; i < printQueue.length; i++) {
    const line = printQueue[i];
    setTimeout(() => appendLine(line), delay);
    // Vary speed: headers/dividers faster, data lines slightly slower
    delay += line.type === 'blank' ? 10 : line.type === 'header' || line.type === 'divider' ? 20 : 35;
  }
}

function appendLine({ type, label, value, raw, cssClass }) {
  const el = document.createElement('div');
  el.className = `rl rl-${type || 'value'}`;

  if (type === 'kv') {
    el.className = 'rl rl-kv';
    // Pad label to fixed width for reliable monospace alignment
    const PAD = 22;
    const labelEl = document.createElement('span');
    labelEl.className = 'rl-label';
    labelEl.textContent = (label || '').padEnd(PAD);
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
   GEO HELPERS — great circle interpolation & distance
══════════════════════════════════════════════ */
function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }

// Haversine distance in km between two lat/lon points
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Interpolate along great circle at fraction t (0=origin, 1=dest)
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

// Human-readable region description from lat/lon
function getOceanRegion(lat, lon) {
  // Normalise lon to [-180, 180]
  while (lon >  180) lon -= 360;
  while (lon < -180) lon += 360;
  if (lon < -100) return 'Eastern Pacific  (near California/Alaska)';
  if (lon < -150 || lon > 160) return 'Central North Pacific';
  if (lon <  130) return 'Western Pacific  (near Japan/Kurils)';
  if (lon <  145) return 'Approaching Japan';
  return 'North Pacific Ocean';
}

/* ══════════════════════════════════════════════
   ROUTE CANVAS
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

    // Draw trail gradient leading up to the sweep line
    const grad = ctx.createLinearGradient(state.sweepX - 80, 0, state.sweepX, 0);
    grad.addColorStop(0, 'rgba(57, 255, 126, 0)');
    grad.addColorStop(0.8, 'rgba(57, 255, 126, 0.08)');
    grad.addColorStop(1, 'rgba(57, 255, 126, 0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(state.sweepX - 80, 0, 80, H);

    // Draw the bright vertical sweep line
    if (state.sweepX <= W) {
      ctx.beginPath();
      ctx.moveTo(state.sweepX, 0);
      ctx.lineTo(state.sweepX, H);
      ctx.strokeStyle = 'rgba(57, 255, 126, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  if (!data) return;

  // Draw route line
  const margin = 40;
  const originX = margin;
  const destX = W - margin;
  const midY = H / 2;
  const arcY = midY - 28;

  // Arc path
  ctx.beginPath();
  ctx.moveTo(originX, midY);
  ctx.quadraticCurveTo(W / 2, arcY, destX, midY);
  ctx.strokeStyle = 'rgba(255,45,107,0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Origin dot
  ctx.beginPath();
  ctx.arc(originX, midY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#39ff7e';
  ctx.fill();
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#39ff7e';
  ctx.fill();
  ctx.shadowBlur = 0;

  // Destination dot
  ctx.beginPath();
  ctx.arc(destX, midY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ff2d6b';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#ff2d6b';
  ctx.fill();
  ctx.shadowBlur = 0;

  // Helper: bezier point at t
  function bezierPt(t) {
    return {
      x: (1-t)*(1-t)*originX + 2*(1-t)*t*(W/2) + t*t*destX,
      y: (1-t)*(1-t)*midY    + 2*(1-t)*t*arcY   + t*t*midY,
    };
  }

  // Live GPS aircraft position (gold, solid)
  if (data.lon != null && data.lat != null && data.progress != null) {
    const { x: bx, y: by } = bezierPt(data.progress);
    const grd = ctx.createRadialGradient(bx, by, 2, bx, by, 10);
    grd.addColorStop(0, 'rgba(255,183,0,0.4)');
    grd.addColorStop(1, 'rgba(255,183,0,0)');
    ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fillStyle = grd; ctx.fill();
    ctx.font = '14px monospace';
    ctx.fillStyle = '#ffb700';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✈', bx, by);
  }

  // Dead-reckoning estimated position (amber, dashed ring)
  if (data.estProgress != null && data.lon == null) {
    const { x: bx, y: by } = bezierPt(data.estProgress);
    // Pulsing dashed ring
    ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,183,0,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Amber plane
    ctx.font = '13px monospace';
    ctx.fillStyle = '#ffb700';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✈', bx, by);
    // "EST" label
    ctx.font = '7px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(255,183,0,0.8)';
    ctx.fillText('EST', bx, by - 18);
  }

  // Labels
  ctx.font = '9px JetBrains Mono, monospace';
  ctx.fillStyle = 'rgba(57,255,126,0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (data.origin) ctx.fillText(data.origin, originX, midY + 8);
  if (data.dest)   ctx.fillText(data.dest,   destX,   midY + 8);
}


/* ══════════════════════════════════════════════
   BUILD OUTPUT LINES
══════════════════════════════════════════════ */
function buildOutputLines(callsign, sv, routeData, flightHistory, asData, now) {
  const iata        = callsign.replace(/\s/g, '');
  const flightNum   = iata.match(/\d+/)?.[0] || '?';
  const airlineName = routeData?.airline?.name || getAirlineName(iata);
  const [statusLabel, statusClass] = decodeStatus(sv?.on_ground, sv?.velocity_ms);

  const lines = [];
  const ts = new Date(now).toUTCString();

  // ── Header box ──
  lines.push({ type: 'blank' });
  lines.push({ type: 'header', raw: `┌─ FLIGHT TRACK: ${iata.toUpperCase()} ─`.padEnd(54,'─') + '┐' });
  lines.push({ type: 'header', raw: `│  ${airlineName} · Flight ${flightNum}`.padEnd(54) + '│' });
  lines.push({ type: 'header', raw: `│  Query Time: ${ts}`.padEnd(54) + '│' });
  lines.push({ type: 'header', raw: `└${'─'.repeat(54)}┘` });
  lines.push({ type: 'blank' });

  // ── ROUTE & TIMING ──
  const origin = routeData?.origin;
  const dest   = routeData?.destination;

  // sched declared outside both if-blocks so dead-reckoning section at line ~807 can access it
  let sched = calcScheduledTimes(routeData);

  if (origin || dest || flightHistory) {
    lines.push({ type: 'divider', raw: '─── ROUTE & TIMING ' + '─'.repeat(34) });

    if (origin) {
      lines.push({ type: 'kv',
        label:    '  ORIGIN',
        value:    `${origin.iata_code} — ${origin.municipality || origin.country_name}`,
        cssClass: 'rl-green' });
    }
    if (dest) {
      lines.push({ type: 'kv',
        label:    '  DESTINATION',
        value:    `${dest.iata_code} — ${dest.municipality || dest.country_name}`,
        cssClass: 'rl-cyan' });
    }
    if (origin && dest) {
      const totalKm = Math.round(haversine(
        origin.latitude, origin.longitude,
        dest.latitude,   dest.longitude
      ));
      lines.push({ type: 'kv',
        label: '  ROUTE DIST.',
        value: `${totalKm.toLocaleString()} km  (${Math.round(totalKm * 0.539957).toLocaleString()} nm)` });
    }

    // sched is already computed above

    if (flightHistory?.firstSeen) {
      // ── Actual departure confirmed by OpenSky ──
      lines.push({ type: 'kv',
        label:    '  DEPARTED (JST)',
        value:    `${formatJST(flightHistory.firstSeen)}  (${secondsAgo(flightHistory.firstSeen)})`,
        cssClass: 'rl-amber' });

      if (routeData?.durationHours) {
        const estArrUnix = flightHistory.firstSeen + Math.round(routeData.durationHours * 3600);
        const nowUnix    = Math.floor(Date.now() / 1000);
        const isArrived  = nowUnix > estArrUnix;
        lines.push({ type: 'kv',
          label:    '  EST. ARRIVAL (JST)',
          value:    `${formatJST(estArrUnix)}${isArrived ? '  ✓ ARRIVED' : ''}`,
          cssClass: isArrived ? 'rl-amber' : 'rl-green' });
        if (!isArrived) {
          const secsLeft = estArrUnix - nowUnix;
          const hLeft = Math.floor(secsLeft / 3600);
          const mLeft = Math.floor((secsLeft % 3600) / 60);
          lines.push({ type: 'kv',
            label:    '  TIME TO ARRIVAL',
            value:    hLeft > 0 ? `${hLeft}h ${mLeft}m remaining` : `${mLeft}m remaining`,
            cssClass: 'rl-green' });
        }
      }

    } else if (sched) {
      // ── No live history — show hardcoded schedule (approx.) ──
      const nowUnix  = Math.floor(Date.now() / 1000);
      const departed = nowUnix > sched.depUnix;
      const arrived  = nowUnix > sched.arrUnix;

      lines.push({ type: 'kv',
        label:    departed ? '  DEPARTED (JST)' : '  SCHED. DEP (JST)',
        value:    `${formatJST(sched.depUnix)}${departed ? '  (airborne)' : '  ⏰ not yet departed'}`,
        cssClass: departed ? 'rl-amber' : 'rl-value' });

      lines.push({ type: 'kv',
        label:    arrived ? '  ARRIVED (JST)' : '  SCHED. ARR (JST)',
        value:    `${formatJST(sched.arrUnix)}${arrived ? '  ✓ ARRIVED' : ''}`,
        cssClass: arrived ? 'rl-amber' : 'rl-green' });

      if (!arrived) {
        const secsLeft = sched.arrUnix - nowUnix;
        const hLeft    = Math.floor(secsLeft / 3600);
        const mLeft    = Math.floor((secsLeft % 3600) / 60);
        const label    = departed ? '  TIME TO ARRIVAL' : '  DEPARTS IN';
        const secsToDep = sched.depUnix - nowUnix;
        const hDep = Math.floor(secsToDep / 3600);
        const mDep = Math.floor((secsToDep % 3600) / 60);
        lines.push({ type: 'kv',
          label:    label,
          value:    departed
            ? (hLeft > 0 ? `${hLeft}h ${mLeft}m remaining` : `${mLeft}m remaining`)
            : (hDep > 0 ? `${hDep}h ${mDep}m` : `${mDep}m`),
          cssClass: 'rl-green' });
      }

      lines.push({ type: 'dim', raw: '  ⚠ Schedule is approximate (±30 min). Verify at aa.com' });
    }

    // Live calculated ETA (only when airborne + have GPS)
    const eta = calcETA(sv, routeData);
    if (eta) {
      const hrsLeft  = Math.floor(eta.etaHours);
      const minsLeft = Math.round((eta.etaHours - hrsLeft) * 60);
      lines.push({ type: 'kv',
        label:    '  LIVE CALC. ETA',
        value:    formatJST(Math.floor(eta.etaMs / 1000)),
        cssClass: 'rl-green' });
      lines.push({ type: 'kv',
        label:    '  └ TIME REMAINING',
        value:    hrsLeft > 0 ? `${hrsLeft}h ${minsLeft}m` : `${minsLeft}m`,
        cssClass: 'rl-green' });
      lines.push({ type: 'kv',
        label: '  └ DIST. REMAINING',
        value: `${eta.distKm.toLocaleString()} km at ${eta.speedKmh} km/h` });
    } else if (sv?.on_ground) {
      lines.push({ type: 'kv',
        label:    '  LIVE ETA',
        value:    'Aircraft on ground — not yet departed',
        cssClass: 'rl-amber' });
    }
    lines.push({ type: 'blank' });
  }

  // ── OPERATIONAL ROUTING (daily plan) ──
  const planDateStr = state.routingsPlanDate || new Date(now).toISOString().split('T')[0];
  const routing = findRoutingForFlight(callsign, planDateStr);
  if (routing) {
    lines.push({ type: 'divider', raw: '─── OPERATIONAL ROUTING ' + '─'.repeat(30) });
    if (routing.ac_type || routing.nose) {
      lines.push({ type: 'kv',
        label: '  AIRCRAFT TYPE',
        value: `${routing.ac_type || '—'}${routing.nose ? `  (Nose: ${routing.nose})` : ''}`,
        cssClass: 'rl-cyan' });
    }
    const spots = [];
    if (routing.arv_spot) spots.push(`Arv: ${routing.arv_spot}`);
    if (routing.tow_to) spots.push(`Tow: ${routing.tow_to}`);
    if (routing.dep_spot) spots.push(`Dep: ${routing.dep_spot}`);
    if (spots.length > 0) {
      lines.push({ type: 'kv',
        label: '  GATE / SPOTS',
        value: spots.join(' → '),
        cssClass: 'rl-value' });
    }

    const num = callsign.replace(/[^0-9]/g, '');
    const isDep = (routing.departure === num);
    if (isDep) {
      if (routing.etd && routing.etd !== routing.std) {
        lines.push({ type: 'kv',
          label: '  EST. DEPARTURE',
          value: `${routing.etd} JST  (DLY vs STD ${routing.std})`,
          cssClass: 'rl-amber' });
      } else {
        lines.push({ type: 'kv',
          label: '  EST. DEPARTURE',
          value: `${routing.std || '—'} JST  (On Time)`,
          cssClass: 'rl-green' });
      }
    } else {
      if (routing.eta && routing.eta !== routing.sta && routing.eta !== 'IN') {
        lines.push({ type: 'kv',
          label: '  EST. ARRIVAL',
          value: `${routing.eta} JST  (DLY vs STA ${routing.sta})`,
          cssClass: 'rl-amber' });
      } else if (routing.eta === 'IN') {
        lines.push({ type: 'kv',
          label: '  EST. ARRIVAL',
          value: `✓ ARRIVED / IN`,
          cssClass: 'rl-green' });
      } else {
        lines.push({ type: 'kv',
          label: '  EST. ARRIVAL',
          value: `${routing.sta || '—'} JST  (On Time)`,
          cssClass: 'rl-green' });
      }
    }

    if (routing.remarks) {
      lines.push({ type: 'kv',
        label: '  REMARKS / NOTES',
        value: routing.remarks,
        cssClass: (routing.remarks.toUpperCase().includes('DLY') || routing.remarks.toUpperCase().includes('MAINTENANCE')) ? 'rl-amber' : 'rl-value' });
    }
    lines.push({ type: 'blank' });
  }

  // ── No live position ──
  if (!sv) {
    // Check if flight is currently airborne by schedule (for dead-reckoning)
    const nowUnixDR  = Math.floor(Date.now() / 1000);
    const schedForDR = sched || calcScheduledTimes(routeData);
    const isAirborne = schedForDR &&
                       nowUnixDR > schedForDR.depUnix &&
                       nowUnixDR < schedForDR.arrUnix;

    if (isAirborne && origin?.latitude && dest?.latitude) {
      // ── DEAD RECKONING ──
      const elapsed     = nowUnixDR - schedForDR.depUnix;
      const totalDurSec = schedForDR.arrUnix - schedForDR.depUnix;
      const fraction    = Math.min(1, Math.max(0, elapsed / totalDurSec));
      const estPos      = greatCirclePoint(
        origin.latitude, origin.longitude,
        dest.latitude,   dest.longitude, fraction
      );
      const totalDistKm  = haversineKm(origin.latitude, origin.longitude, dest.latitude, dest.longitude);
      const distDoneKm   = Math.round(totalDistKm * fraction);
      const distLeftKm   = Math.round(totalDistKm * (1 - fraction));
      const distLeftNm   = Math.round(distLeftKm / 1.852);
      const avgSpeedKmh  = Math.round(totalDistKm / (totalDurSec / 3600));
      const avgSpeedKts  = Math.round(avgSpeedKmh / 1.852);
      const pct          = Math.round(fraction * 100);
      const secsLeft     = schedForDR.arrUnix - nowUnixDR;
      const hLeft        = Math.floor(secsLeft / 3600);
      const mLeft        = Math.floor((secsLeft % 3600) / 60);
      const latStr       = Math.abs(estPos.lat).toFixed(1) + (estPos.lat >= 0 ? '°N' : '°S');
      const lonStr       = Math.abs(estPos.lon).toFixed(1) + (estPos.lon >= 0 ? '°E' : '°W');
      const elapsedH     = Math.floor(elapsed / 3600);
      const elapsedM     = Math.floor((elapsed % 3600) / 60);

      lines.push({ type: 'warn', raw: '⊕  DEAD RECKONING  (no satellite ADS-B over Pacific)' });
      lines.push({ type: 'dim',  raw: '   Position estimated from schedule + great circle route.' });
      lines.push({ type: 'blank' });
      lines.push({ type: 'kv', label: '  EST. POSITION',
        value:    `${latStr}  ${lonStr}`, cssClass: 'rl-amber' });
      lines.push({ type: 'kv', label: '  REGION',
        value:    getOceanRegion(estPos.lat, estPos.lon), cssClass: 'rl-dim' });
      lines.push({ type: 'kv', label: '  ELAPSED',
        value:    `${elapsedH}h ${elapsedM}m  /  ${Math.round(totalDurSec/3600*10)/10}h scheduled`,
        cssClass: 'rl-green' });
      lines.push({ type: 'kv', label: '  PROGRESS',
        value:    `${pct}%  (${distDoneKm.toLocaleString()} km of ${Math.round(totalDistKm).toLocaleString()} km)`,
        cssClass: 'rl-green' });
      lines.push({ type: 'kv', label: '  DIST. REMAINING',
        value:    `${distLeftKm.toLocaleString()} km  (${distLeftNm.toLocaleString()} nm)`,
        cssClass: 'rl-green' });
      lines.push({ type: 'kv', label: '  TIME REMAINING',
        value:    hLeft > 0 ? `${hLeft}h ${mLeft}m` : `${mLeft}m`,
        cssClass: 'rl-green' });
      lines.push({ type: 'kv', label: '  AVG SPEED (sched)',
        value:    `${avgSpeedKmh} km/h  (${avgSpeedKts} kts)`,
        cssClass: 'rl-dim' });
      lines.push({ type: 'blank' });

      // Canvas update handled by trackFlight (avoids double-draw)
    } else {
      lines.push({ type: 'warn', raw: '⚠  NO LIVE ADS-B POSITION FOR THIS FLIGHT.' });
      lines.push({ type: 'dim',  raw: '   Aircraft may be on ground, completed, or out of range.' });
    }
    lines.push({ type: 'blank' });
    if (asData) {
      lines.push({ type: 'divider', raw: '─── SCHEDULE DATA (Aviation Stack) ' + '─'.repeat(19) });
      appendScheduleLines(lines, asData);
    }
    lines.push({ type: 'dim', raw: `  Route data: adsbdb.com  ·  Position: OpenSky Network` });
    lines.push({ type: 'blank' });
    return lines;
  }

  // ── LIVE ADS-B POSITION ──
  lines.push({ type: 'divider', raw: '─── LIVE ADS-B POSITION ' + '─'.repeat(30) });
  lines.push({ type: 'kv', label: '  STATUS',        value: `● ${statusLabel}`, cssClass: statusClass });
  lines.push({ type: 'kv', label: '  ICAO-24 HEX',   value: (sv.icao24 || '—').toUpperCase() });
  lines.push({ type: 'kv', label: '  SQUAWK CODE',   value: sv.squawk || '—', cssClass: 'rl-amber' });
  lines.push({ type: 'kv', label: '  REGISTERED IN', value: sv.country || '—' });
  lines.push({ type: 'blank' });

  lines.push({ type: 'divider', raw: '─── POSITION & NAVIGATION ' + '─'.repeat(28) });
  if (sv.latitude != null && sv.longitude != null) {
    lines.push({ type: 'kv', label: '  LATITUDE',  value: `${sv.latitude.toFixed(5)}°`,  cssClass: 'rl-cyan' });
    lines.push({ type: 'kv', label: '  LONGITUDE', value: `${sv.longitude.toFixed(5)}°`, cssClass: 'rl-cyan' });
  } else {
    lines.push({ type: 'kv', label: '  POSITION', value: 'No GPS fix' });
  }
  lines.push({ type: 'kv', label: '  BARO ALTITUDE', value: sv.baro_alt_m != null ? `${mToFt(sv.baro_alt_m)} ft  (${mToFl(sv.baro_alt_m)})` : '—' });
  lines.push({ type: 'kv', label: '  GEO ALTITUDE',  value: sv.geo_alt_m  != null ? `${mToFt(sv.geo_alt_m)} ft` : '—' });
  lines.push({ type: 'blank' });

  lines.push({ type: 'divider', raw: '─── SPEED & VECTOR ' + '─'.repeat(34) });
  lines.push({ type: 'kv', label: '  GROUND SPEED',  value: sv.velocity_ms != null ? `${msToKnots(sv.velocity_ms)} kts  (${msToKmh(sv.velocity_ms)} km/h)` : '—', cssClass: 'rl-green' });
  lines.push({ type: 'kv', label: '  TRUE TRACK',    value: sv.true_track  != null ? `${sv.true_track.toFixed(1)}°  (${degToCompass(sv.true_track)})` : '—' });
  lines.push({ type: 'kv', label: '  VERTICAL RATE', value: sv.vert_rate   != null ? formatVertRate(sv.vert_rate) : '—',
    cssClass: sv.vert_rate > 0 ? 'rl-green' : sv.vert_rate < 0 ? 'rl-ruby' : 'rl-value' });
  lines.push({ type: 'blank' });

  lines.push({ type: 'divider', raw: '─── DATA FRESHNESS ' + '─'.repeat(34) });
  lines.push({ type: 'kv', label: '  POSITION TIME', value: formatUnixTime(sv.time_pos) });
  lines.push({ type: 'kv', label: '  LAST CONTACT',  value: secondsAgo(sv.last_contact), cssClass: 'rl-amber' });
  lines.push({ type: 'blank' });

  if (asData) {
    lines.push({ type: 'divider', raw: '─── SCHEDULE DATA ' + '─'.repeat(35) });
    appendScheduleLines(lines, asData);
  }

  lines.push({ type: 'dim', raw: '  Sources: OpenSky ADS-B (live)  ·  adsbdb.com (route/timing)' });
  lines.push({ type: 'blank' });

  return lines;
}


function formatVertRate(vr) {
  if (vr == null) return '—';
  const fpm = (vr * 196.85).toFixed(0);
  const arrow = vr > 0 ? '▲ CLIMBING' : vr < 0 ? '▼ DESCENDING' : '→ LEVEL';
  return `${Math.abs(fpm)} fpm  ${arrow}`;
}

function appendScheduleLines(lines, d) {
  const dep = d.departure || {};
  const arr = d.arrival || {};
  const airline = d.airline || {};
  const flight = d.flight || {};

  if (airline.name) lines.push({ type: 'kv', label: '  AIRLINE', value: airline.name });
  if (flight.iata)  lines.push({ type: 'kv', label: '  FLIGHT NO.', value: flight.iata?.toUpperCase() });
  lines.push({ type: 'blank' });

  if (dep.airport) lines.push({ type: 'kv', label: '  DEPARTURE', value: `${dep.iata || '?'} — ${dep.airport}` });
  if (dep.scheduled) lines.push({ type: 'kv', label: '  SCHED. DEP.', value: formatIsoTime(dep.scheduled) });
  if (dep.actual)    lines.push({ type: 'kv', label: '  ACTUAL DEP.', value: formatIsoTime(dep.actual), cssClass: 'rl-amber' });
  if (arr.airport) lines.push({ type: 'kv', label: '  ARRIVAL', value: `${arr.iata || '?'} — ${arr.airport}` });
  if (arr.scheduled) lines.push({ type: 'kv', label: '  SCHED. ARR.', value: formatIsoTime(arr.scheduled) });
  if (arr.estimated) lines.push({ type: 'kv', label: '  EST. ARR.', value: formatIsoTime(arr.estimated), cssClass: 'rl-green' });

  const status = d.flight_status;
  if (status) {
    const cls = status === 'active' ? 'rl-green' : status === 'landed' ? 'rl-amber' : 'rl-dim';
    lines.push({ type: 'kv', label: '  FLIGHT STATUS', value: status.toUpperCase(), cssClass: cls });
  }
  lines.push({ type: 'blank' });
}

function formatIsoTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toUTCString().replace(' GMT', ' UTC');
  } catch { return iso; }
}

/* Format a Unix timestamp as JST date+time */
function formatJST(unixSeconds) {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleString('en-GB', {
    timeZone: 'Asia/Tokyo',
    year:   'numeric',
    month:  'short',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(',', '') + ' JST';
}

/* ══════════════════════════════════════════════
   LOADING MESSAGES
══════════════════════════════════════════════ */
const LOADING_MESSAGES = [
  'Querying ADS-B network...',
  'Connecting to OpenSky receivers...',
  'Fetching transponder data...',
  'Decoding state vectors...',
  'Processing flight telemetry...',
  'Enriching route data...',
  'Rendering output stream...',
];
let loadingMsgIdx = 0;
let loadingMsgTimer = null;

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

/* Helper to parse and normalize date input (DD/MON/YY or DDMONYY) format to YYYY-MM-DD */
function parseDateInput(input) {
  const cleaned = input.trim().toUpperCase();
  // Match strictly DD/MON/YY or DDMONYY where:
  // - DD is exactly 2 digits (01-31)
  // - MON is exactly 3 letters (e.g., JAN, FEB, etc.)
  // - YY is exactly 2 digits
  const match = cleaned.match(/^(0[1-9]|[12]\d|3[01])\/([A-Z]{3})\/(\d{2})$/) ||
                cleaned.match(/^(0[1-9]|[12]\d|3[01])([A-Z]{3})(\d{2})$/);
  if (match) {
    const day = match[1];
    const monthStr = match[2];
    const yy = match[3];
    const year = '20' + yy;
    const months = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    const monthNum = months[monthStr];
    if (monthNum) {
      return `${year}-${monthNum}-${day}`;
    }
  }
  return null;
}

/* Render a daily summary overview of all 8 routes in the terminal */
function renderDailyOverview(dateStr) {
  const now = Date.now();
  const ts = new Date(now).toUTCString();

  const lines = [];
  lines.push({ type: 'blank' });
  lines.push({ type: 'header', raw: `┌─ DAILY OVERVIEW: ${dateStr} (HND ROUTES) ─`.padEnd(54,'─') + '┐' });
  lines.push({ type: 'header', raw: `│  Query Time: ${ts}`.padEnd(54) + '│' });
  lines.push({ type: 'header', raw: `└${'─'.repeat(54)}┘` });
  lines.push({ type: 'blank' });

  // Verification messages
  const hasPlan = state.routingsPlan && (state.routingsPlanDate === dateStr);
  if (!hasPlan) {
    lines.push({ type: 'warn', raw: `⚠ OPERATIONAL ROUTING PLAN OFFLINE FOR ${dateStr}` });
    lines.push({ type: 'blank' });
    lines.push({ type: 'header', raw: '─── CHEAPEST SATELLITE & FLIGHT APIs GUIDE ───' });
    lines.push({ type: 'kv', label: '  1. FlightAware AeroAPI', value: 'FREE Tier (500 queries/mo) | Bronze: $25/mo' });
    lines.push({ type: 'kv', label: '     └ Satellite Tracking', value: 'Included (Pacific oceanic routes tracked automatically)' });
    lines.push({ type: 'kv', label: '     └ Key Data Points', value: 'Gate spots, terminal status, tail numbers, actual ETA' });
    lines.push({ type: 'kv', label: '  2. Aviationstack API', value: 'FREE Tier (100 queries/mo) | Standard: $29/mo' });
    lines.push({ type: 'kv', label: '  3. OpenSky Network API', value: 'FREE (Community) - Live coordinates only, no gates/spots' });
    lines.push({ type: 'blank' });
    lines.push({ type: 'dim', raw: '  * Note: Space-based satellite ADS-B is built directly into' });
    lines.push({ type: 'dim', raw: '    FlightAware AeroAPI and Flightradar24. You do not need' });
    lines.push({ type: 'dim', raw: '    a separate satellite provider (which costs $1,000s/mo).' });
    lines.push({ type: 'blank' });
  }

  const routeKeys = Object.keys(KNOWN_ROUTES);
  routeKeys.forEach(flight => {
    const route = KNOWN_ROUTES[flight];
    const routing = findRoutingForFlight(flight, dateStr);
    const num = flight.replace(/[^0-9]/g, '');
    const isDep = (routing?.departure === num);

    let statusText = 'Scheduled';
    let statusClass = 'rl-value';
    let timeInfo = '';
    let noseInfo = '—';
    let spotInfo = '—';
    let remarkInfo = '';

    const sched = calcScheduledTimes(route);
    if (sched) {
      const nowUnix = Math.floor(Date.now() / 1000);
      const isArrived = nowUnix > sched.arrUnix;
      const isAirborne = nowUnix > sched.depUnix && nowUnix < sched.arrUnix;
      const isSoon = nowUnix < sched.depUnix && sched.depUnix - nowUnix < 3600;

      if (isArrived) {
        statusText = 'Landed';
        statusClass = 'rl-dim';
      } else if (isAirborne) {
        statusText = 'In Flight';
        statusClass = 'rl-green';
      } else if (isSoon) {
        statusText = 'Soon';
        statusClass = 'rl-amber';
      }
      
      const isHndArrival = route.destination.iata_code === 'HND';
      if (isHndArrival) {
        const arrH = route.schedArrUTCH;
        const arrM = route.schedArrUTCM;
        const arrTimeStr = arrH != null ? `${String((arrH + 9) % 24).padStart(2,'0')}:${String(arrM).padStart(2,'0')}` : '—';
        timeInfo = `STA ${arrTimeStr}`;
      } else {
        const depH = route.schedDepUTCH;
        const depM = route.schedDepUTCM;
        const depTimeStr = depH != null ? `${String((depH + 9) % 24).padStart(2,'0')}:${String(depM).padStart(2,'0')}` : '—';
        timeInfo = `STD ${depTimeStr}`;
      }
    }

    if (routing) {
      noseInfo = routing.nose || '—';
      const spots = [];
      if (routing.arv_spot) spots.push(routing.arv_spot);
      if (routing.tow_to && routing.tow_to !== 'STAY') spots.push(`→${routing.tow_to}`);
      if (routing.dep_spot && routing.dep_spot !== routing.arv_spot) spots.push(`→${routing.dep_spot}`);
      spotInfo = spots.join('') || '—';
      remarkInfo = routing.remarks || '';

      const rStatus = getRoutingStatus(flight);
      if (rStatus === 'inflight') {
        statusText = 'In Flight';
        statusClass = 'rl-green';
      } else if (rStatus === 'landed') {
        statusText = '✓ Arrived';
        statusClass = 'rl-dim';
      } else if (rStatus === 'soon') {
        statusText = '⏰ Soon';
        statusClass = 'rl-amber';
      } else if (rStatus === 'delayed') {
        statusText = '⚠ Delayed';
        statusClass = 'rl-amber';
      } else if (rStatus === 'cancelled') {
        statusText = '❌ Cancelled';
        statusClass = 'rl-ruby';
      }

      if (isDep) {
        timeInfo = `STD ${routing.std || '—'}${routing.etd && routing.etd !== routing.std ? ` (ETD ${routing.etd})` : ''}`;
      } else {
        timeInfo = `STA ${routing.sta || '—'}${routing.eta && routing.eta !== routing.sta && routing.eta !== 'IN' ? ` (ETA ${routing.eta})` : ''}`;
        if (routing.eta === 'IN') {
          timeInfo = `STA ${routing.sta || '—'} (IN)`;
        }
      }
    }

    const routeDir = `${route.origin.iata_code}→${route.destination.iata_code}`;
    const flCol = `${flight}`.padEnd(6);
    const dirCol = `(${routeDir})`.padEnd(9);
    const timeCol = `[${timeInfo}]`.padEnd(25);
    const noseCol = `Nose:${noseInfo.padEnd(3)}`.padEnd(9);
    const spotCol = `Spot:${spotInfo.padEnd(7)}`.padEnd(14);
    
    lines.push({
      type: 'value',
      raw: `  ${flCol} ${dirCol} ${timeCol} ${noseCol} ${spotCol} ${statusText}${remarkInfo ? ` (${remarkInfo})` : ''}`,
      cssClass: statusClass
    });
  });

  lines.push({ type: 'blank' });
  lines.push({ type: 'dim', raw: '  Daily operational plan updates dynamically with changes.' });
  lines.push({ type: 'blank' });
  
  schedulePrint(lines);
  drawRouteCanvas(null);
  state.isLoading = false;
  loadingOverlay.classList.add('hidden');
  refreshBtn.disabled = true;
}

/* ══════════════════════════════════════════════
   MAIN TRACK FUNCTION
══════════════════════════════════════════════ */
async function trackFlight(rawInput) {
  const cleaned = rawInput.trim();
  if (!cleaned) return;

  if (state.isLoading) return;
  state.isLoading = true;
  state.currentFlight = cleaned;

  // Check if input is a date overview query
  const dateStr = parseDateInput(cleaned);
  if (dateStr) {
    splash.classList.add('hidden');
    flightResult.classList.remove('hidden');
    startLoading();
    
    outputFlightId.textContent = `DAILY OVERVIEW: ${dateStr}`;
    refreshBtn.disabled = true;
    flightInput.value = cleaned;
    incrementQuery();
    statLastQuery.textContent = dateStr;
    addCmdHistory(`day ${dateStr}`);
    
    setTimeout(() => {
      renderDailyOverview(dateStr);
    }, 600);
    return;
  }

  const flight = cleaned.toUpperCase().replace(/\s+/g,'');
  if (!flight) return;

  // Show loading
  splash.classList.add('hidden');
  flightResult.classList.remove('hidden');
  startLoading();

  // Update UI
  outputFlightId.textContent = flight;
  refreshBtn.disabled = false;
  flightInput.value = flight;

  // Stats
  incrementQuery();
  statLastQuery.textContent = flight;

  // Log command
  addCmdHistory(flight);

  // Spin refresh icon
  refreshIcon.classList.add('spinning');

  let sv = null, routeData = null, asData = null, flightHistory = null;
  let error = null;

  // Phase 1: OpenSky live + adsbdb route in parallel
  try {
    [sv, routeData] = await Promise.all([
      fetchOpenSky(flight).catch(e => { error = e.message; return null; }),
      fetchAdsbDb(flight).catch(() => null),
    ]);
  } catch (e) {
    console.warn('Phase 1 fetch error:', e);
    error = e.message;
    statApi.textContent = 'DEGRADED';
    statApi.className = 'stat-val rl-amber';
  }

  // Phase 2: OpenSky flight history (needs icao24 from live data)
  if (sv?.icao24) {
    flightHistory = await fetchOpenSkyFlights(sv.icao24).catch(() => null);
  }

  // Phase 2b: Fallback — query departure airport by callsign (works without live data)
  // Handles flights over Pacific with no ADS-B coverage
  if (!flightHistory && routeData?.origin?.icao_code) {
    flightHistory = await fetchOpenSkyDeparture(flight, routeData.origin.icao_code).catch(() => null);
  }

  // Phase 3: AviationStack if key is set
  asData = await fetchAviationStack(flight).catch(() => null);

  stopLoading();
  refreshIcon.classList.remove('spinning');

  const now = Date.now();
  state.lastFlightData = { sv, asData, flight, now };
  sbData.textContent = new Date(now).toUTCString().split(' ')[4] + ' UTC';

  // Update status bar
  if (sv) {
    sbNet.textContent = 'ADS-B LIVE';
    sbNet.className = 'sb-val green-text';
  } else {
    sbNet.textContent = error ? 'ERROR' : 'NO SIGNAL';
    sbNet.className = error ? 'sb-val rl-ruby' : 'sb-val rl-amber';
  }

  // Draw canvas — live GPS takes priority; fall back to dead-reckoning if airborne
  const originIata = routeData?.origin?.iata_code || asData?.departure?.iata;
  const destIata   = routeData?.destination?.iata_code || asData?.arrival?.iata;
  let canvasData = null;
  if (sv?.longitude != null && sv?.latitude != null) {
    let progress = 0.5;
    if (routeData?.origin && routeData?.destination) {
      const totalDist  = haversine(
        routeData.origin.latitude, routeData.origin.longitude,
        routeData.destination.latitude, routeData.destination.longitude);
      const remainDist = haversine(
        sv.latitude, sv.longitude,
        routeData.destination.latitude, routeData.destination.longitude);
      progress = Math.max(0, Math.min(1, 1 - (remainDist / totalDist)));
    }
    canvasData = { lon: sv.longitude, lat: sv.latitude, progress,
                   origin: originIata || '???', dest: destIata || '???' };
  } else {
    // No live GPS — check dead reckoning
    const drSched = calcScheduledTimes(routeData);
    const nowDR   = Math.floor(Date.now() / 1000);
    const drAirborne = drSched &&
                       nowDR > drSched.depUnix && nowDR < drSched.arrUnix &&
                       routeData?.origin?.latitude && routeData?.destination?.latitude;
    if (drAirborne) {
      const frac = Math.min(1, Math.max(0,
        (nowDR - drSched.depUnix) / (drSched.arrUnix - drSched.depUnix)));
      canvasData = { origin: originIata, dest: destIata, estProgress: frac,
                     lon: null, lat: null };
    } else if (originIata || destIata) {
      canvasData = { origin: originIata, dest: destIata };
    }
  }
  drawRouteCanvas(canvasData);

  // Build and print output
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

  // Keep only last 6
  while (cmdHistory.children.length > 6) {
    cmdHistory.removeChild(cmdHistory.firstChild);
  }
}

/* ══════════════════════════════════════════════
   AUTO-REFRESH
══════════════════════════════════════════════ */
function startAutoRefresh() {
  stopAutoRefresh();
  state.autoRefreshTimer = setInterval(() => {
    if (state.currentFlight && !state.isLoading) {
      trackFlight(state.currentFlight);
    }
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
  resultStream.innerHTML = '';
  cmdHistory.innerHTML = '';
  splash.classList.remove('hidden');
  flightResult.classList.add('hidden');
  outputFlightId.textContent = 'AWAITING INPUT';
  refreshBtn.disabled = true;
  state.currentFlight = null;
  flightInput.value = '';
  flightInput.focus();
  drawRouteCanvas(null);
});

// Drag and Drop files onto left terminal
const leftTerminal = $('left-terminal');

leftTerminal.addEventListener('dragenter', e => {
  e.preventDefault();
  leftTerminal.classList.add('dragover');
});

leftTerminal.addEventListener('dragover', e => {
  e.preventDefault();
  leftTerminal.classList.add('dragover');
});

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
    alert('Error: Please drop a valid JSON file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const plan = JSON.parse(evt.target.result);
      const success = window.loadPlan(plan);
      if (success) {
        // Clear terminal output and schedule confirmation message
        const lines = [];
        lines.push({ type: 'blank' });
        lines.push({ type: 'header', raw: `┌─ SYSTEM: PLAN LOADED ────────────────────────────────┐` });
        lines.push({ type: 'header', raw: `│  Date: ${plan.date}`.padEnd(54) + '│' });
        lines.push({ type: 'header', raw: `│  Routes Loaded: ${plan.routings.length}`.padEnd(54) + '│' });
        lines.push({ type: 'header', raw: `└${'─'.repeat(54)}┘` });
        lines.push({ type: 'blank' });
        schedulePrint(lines);
      } else {
        alert('Error: Failed to parse plan structure. Check console for details.');
      }
    } catch (err) {
      alert('Error: Invalid JSON syntax in file.');
      console.error(err);
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

// Quick track buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const flight = btn.dataset.flight;
    flightInput.value = flight;
    trackFlight(flight);
  });
});

// Input formatting — uppercase, alphanumeric and slashes only
flightInput.addEventListener('input', () => {
  const pos = flightInput.selectionStart;
  flightInput.value = flightInput.value.toUpperCase().replace(/[^A-Z0-9\/]/g, '');
  flightInput.setSelectionRange(pos, pos);
});



/* ══════════════════════════════════════════════
   QUICK BTN STATUS COLORS (schedule-based)
══════════════════════════════════════════════ */
function updateQuickBtnStatus() {
  const nowUnix = Math.floor(Date.now() / 1000);
  document.querySelectorAll('.quick-btn').forEach(btn => {
    const flight = btn.dataset.flight;
    if (!flight) return;
    const route = KNOWN_ROUTES[flight];
    btn.classList.remove('quick-btn--inflight', 'quick-btn--soon', 'quick-btn--landed', 'quick-btn--delayed', 'quick-btn--cancelled');
    
    const rStatus = getRoutingStatus(flight);
    if (rStatus) {
      if (rStatus === 'inflight') btn.classList.add('quick-btn--inflight');
      else if (rStatus === 'landed') btn.classList.add('quick-btn--landed');
      else if (rStatus === 'soon') btn.classList.add('quick-btn--soon');
      else if (rStatus === 'delayed') btn.classList.add('quick-btn--delayed');
      else if (rStatus === 'cancelled') btn.classList.add('quick-btn--cancelled');
    } else if (route) {
      const sched = calcScheduledTimes(route);
      if (!sched) return;
      const { depUnix, arrUnix } = sched;
      
      if (nowUnix >= depUnix && nowUnix < arrUnix) {
        btn.classList.add('quick-btn--inflight');
      } else if (nowUnix >= arrUnix && nowUnix < arrUnix + 4 * 3600) {
        btn.classList.add('quick-btn--landed');
      } else if (nowUnix < depUnix && depUnix - nowUnix < 3600) {
        btn.classList.add('quick-btn--soon');
      }
    }
  });
}

/* Load saved operational routing plan if present */
function loadSavedRoutings() {
  try {
    const saved = localStorage.getItem('tfr-routings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.routings && parsed?.date) {
        state.routingsPlan = parsed.routings;
        state.routingsPlanDate = parsed.date;
        const routingStatus = document.getElementById('routing-status') || document.getElementById('routingStatus');
        if (routingStatus) {
          routingStatus.textContent = `Applied: ${parsed.date} (${parsed.routings.length} loaded)`;
          routingStatus.className = 'routing-status-text ok';
        }
      }
    }
  } catch (e) {
    console.error('Failed to load routing plan', e);
  }
}

/* Expose helpers to load/clear routing plan via DevTools Console */
window.loadPlan = function(planObj) {
  try {
    if (!planObj || !planObj.date || !Array.isArray(planObj.routings)) {
      console.error('Invalid plan format. Must be an object containing "date" (YYYY-MM-DD) and a "routings" array.');
      return false;
    }
    localStorage.setItem('tfr-routings', JSON.stringify(planObj));
    loadSavedRoutings();
    updateQuickBtnStatus();
    console.log(`%c✓ Operational routing plan loaded successfully for date: ${planObj.date} (${planObj.routings.length} routes).`, 'color: #39ff7e; font-weight: bold;');
    return true;
  } catch (e) {
    console.error('Failed to load plan:', e);
    return false;
  }
};

const CITY_WEATHER_DATABASE = {
  HND: {
    name: "RJTT (TOKYO HANEDA)",
    temp: "22°C (72°F)",
    wind: "SOUTH-SOUTHEAST @ 12 KT",
    sky: "CLEAR SKY",
    sunrise: "04:50 AM",
    sunset: "06:55 PM",
    icon: "☀️"
  },
  MNL: {
    name: "RPLL (MANILA INTL)",
    temp: "28°C (82°F)",
    wind: "EAST-SOUTHEAST @ 14 KT",
    sky: "POURING WATER (HEAVY THUNDERSTORM)",
    sunrise: "05:25 AM",
    sunset: "06:20 PM",
    icon: "🌧️"
  },
  LAX: {
    name: "KLAX (LOS ANGELES INTL)",
    temp: "16°C (61°F)",
    wind: "WEST-SOUTHWEST @ 12 KT",
    sky: "CLOUDY (OVERCAST / FOG)",
    sunrise: "05:40 AM",
    sunset: "08:00 PM",
    icon: "☁️"
  },
  KTM: {
    name: "VNKT (KATHMANDU INTL)",
    temp: "25°C (77°F)",
    wind: "WEST-NORTHWEST @ 6 KT",
    sky: "CLEAR SKY",
    sunrise: "05:10 AM",
    sunset: "07:05 PM",
    icon: "☀️"
  },
  LHR: {
    name: "EGLL (LONDON HEATHROW)",
    temp: "17°C (63°F)",
    wind: "WEST-SW @ 12 KT",
    sky: "CLOUDY (OVERCAST)",
    sunrise: "04:40 AM",
    sunset: "09:15 PM",
    icon: "☁️"
  },
  CDG: {
    name: "LFPG (PARIS CHARLES DE GAULLE)",
    temp: "18°C (64°F)",
    wind: "SOUTH-SOUTHWEST @ 14 KT",
    sky: "POURING WATER (LIGHT RAIN)",
    sunrise: "05:45 AM",
    sunset: "09:50 PM",
    icon: "🌧️"
  }
};

function refreshWeather() {
  const city = state.activeWeatherCity || 'HND';
  const report = CITY_WEATHER_DATABASE[city];
  if (!report) return;

  const cityNameEl = $('wx-city-name');
  const tempEl = $('wx-temp');
  const windEl = $('wx-wind');
  const skyEl = $('wx-sky');
  const sunriseEl = $('wx-sunrise');
  const sunsetEl = $('wx-sunset');
  const iconEl = $('wx-icon');

  if (cityNameEl) cityNameEl.textContent = report.name;
  if (tempEl) tempEl.textContent = report.temp;
  if (windEl) windEl.textContent = report.wind;
  if (skyEl) skyEl.textContent = report.sky;
  if (sunriseEl) sunriseEl.textContent = report.sunrise;
  if (sunsetEl) sunsetEl.textContent = report.sunset;
  if (iconEl) iconEl.textContent = report.icon;
}

// Bind tabs
document.querySelectorAll('.wx-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    playClickSound();
    document.querySelectorAll('.wx-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeWeatherCity = tab.dataset.city;
    refreshWeather();
  });
});

window.clearPlan = function() {
  localStorage.removeItem('tfr-routings');
  state.routingsPlan = null;
  state.routingsPlanDate = null;
  updateQuickBtnStatus();
  console.log('%c✓ Operational routing plan cleared.', 'color: #ff2d6b; font-weight: bold;');
};

/* ══════════════════════════════════════════════
   INITIAL DRAW
══════════════════════════════════════════════ */
drawRouteCanvas(null);
flightInput.focus();
loadSavedRoutings();
updateQuickBtnStatus();
refreshWeather();
setInterval(updateQuickBtnStatus, 30000);

// Keyboard shortcut: Ctrl+Enter = refresh
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    if (state.currentFlight) trackFlight(state.currentFlight);
  }
  if (e.key === 'Escape') {
    flightInput.focus();
  }
});

/* ══════════════════════════════════════════════
   AUDIO SYNTH FX (Web Audio API)
   ══════════════════════════════════════════════ */
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playClickSound() {
  if (!state.soundEnabled) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.04);

    gain.gain.setValueAtTime(state.volume * 0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
  } catch (e) { console.warn(e); }
}

function playChimeSound() {
  if (!state.soundEnabled) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.08); // A5

    gain.gain.setValueAtTime(state.volume * 0.6, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch (e) { console.warn(e); }
}

function playWarningSound() {
  if (!state.soundEnabled) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, audioCtx.currentTime); // F#3
    osc.frequency.setValueAtTime(180, audioCtx.currentTime + 0.12);

    gain.gain.setValueAtTime(state.volume * 0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.28);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.28);
  } catch (e) { console.warn(e); }
}

function playEngineStartSound() {
  if (!state.soundEnabled) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const duration = 2.0;

    // Master volume gain node
    const mainGain = audioCtx.createGain();
    mainGain.gain.setValueAtTime(state.volume * 0.9, now);
    mainGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Filter to shape the engine sound (higher frequencies allowed for audibility on laptops)
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(350, now + duration);

    // 1. Starter Cranking (Chug-chug-chug) for 0.8s
    // Sawtooth at 110Hz provides rich harmonics that laptop speakers can reproduce easily
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

    // 2. Engine Ignition & Rumble (starting at 0.8s)
    // Triangle oscillator starting at 80Hz, revving up to 160Hz, settling to 65Hz
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

    // 3. Engine Buzz/Growl (sawtooth layer for laptop audibility)
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

    // Connect filter to mainGain, and mainGain to destination
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

// Hover Wobble & Sound effect for Le Wagon Tokyo Neon box
let isWobbling = false;
const neonBox = document.querySelector('.wagon-neon-box');
const neonWrapper = document.querySelector('.wagon-neon-wrapper');

// Unblock audio context on user interaction
document.addEventListener('click', () => {
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
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

// Hook keypress sound
flightInput.addEventListener('keypress', () => playClickSound());



/* ══════════════════════════════════════════════
   SETTINGS PANEL EVENT LISTENERS
   ══════════════════════════════════════════════ */
// Radar Scanner Controls
const sweepToggle = $('radar-sweep-toggle');
const speedSlider = $('radar-speed-slider');

sweepToggle.addEventListener('change', () => {
  state.radarSweepActive = sweepToggle.checked;
  playClickSound();
  if (!state.radarSweepActive) {
    drawRouteCanvas(state.currentCanvasData); // redraw to clear sweep line
  }
});

speedSlider.addEventListener('input', () => {
  state.sweepSpeed = parseInt(speedSlider.value);
});

// Audio Deck Controls
const soundToggle = $('sound-toggle');
const volumeSlider = $('volume-slider');

soundToggle.addEventListener('change', () => {
  state.soundEnabled = soundToggle.checked;
  if (state.soundEnabled) playClickSound();
});

volumeSlider.addEventListener('input', () => {
  state.volume = parseInt(volumeSlider.value) / 10;
});

// Sound Test buttons
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

  // Clear output stream and show simulation starting
  const startLines = [
    { type: 'blank' },
    { type: 'header', raw: '┌─ 🤖 DEMO SEQUENCE STARTING ──────────────────────────┐' },
    { type: 'header', raw: '│  Loading dispatch plans and executing query...       │' },
    { type: 'header', raw: '└──────────────────────────────────────────────────────┘' },
    { type: 'blank' }
  ];
  schedulePrint(startLines);

  setTimeout(() => {
    // 1. Simulating drag-drop operational JSON loading
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
      // 2. Type "05JUN26" into the search bar with typewriter effect
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
            // 3. Trigger search
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
