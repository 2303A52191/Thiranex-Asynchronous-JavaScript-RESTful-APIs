const $ = (sel) => document.querySelector(sel);

const state = {
  lastQuery: '',
  aborter: null,
  latestRaw: null,
};

const els = {
  form: $('#weatherForm'),
  cityInput: $('#cityInput'),
  useMyLocationBtn: $('#useMyLocationBtn'),

  quickCityButtons: document.querySelectorAll('[data-city]'),

  statusText: $('#apiStatusText'),

  loadingBox: $('#loadingBox'),
  errorBox: $('#errorBox'),
  errorText: $('#errorText'),

  // Parsed JSON Details
  tempValue: $('#tempValue'),
  humidityValue: $('#humidityValue'),
  windValue: $('#windValue'),
  feelsLikeValue: $('#feelsLikeValue'),
  conditionText: $('#conditionText'),
  updatedText: $('#updatedText'),
  jsonPre: $('#jsonPre'),

  // Hero
  cityTitle: $('#cityTitle'),
  geoMeta: $('#geoMeta'),
  badgeIcon: $('#badgeIcon'),
  badgeText: $('#badgeText'),
  bigTemp: $('#bigTemp'),
  metricHumidity: $('#metricHumidity'),
  metricWind: $('#metricWind'),
  metricFeels: $('#metricFeels'),

  forecastGrid: $('#forecastGrid'),
};

function setStatus(text, mode = 'ready') {
  els.statusText.textContent = text;
  // Keep it subtle; UI already communicates via panels.
}

function showLoading() {
  els.errorBox.hidden = true;
  els.loadingBox.hidden = false;
}

function hideLoading() {
  els.loadingBox.hidden = true;
}

function showError(message) {
  els.loadingBox.hidden = true;
  els.errorBox.hidden = false;
  els.errorText.textContent = message;
}

function formatTime(isoOrDate) {
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
    return d.toLocaleString(undefined, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function getConditionGlyph(code) {
  // Open-Meteo weathercode mapping (simplified)
  const c = Number(code);
  if ([0].includes(c)) return { icon: '☀️', label: 'Clear sky' };
  if ([1, 2].includes(c)) return { icon: '🌤️', label: 'Partly cloudy' };
  if ([3].includes(c)) return { icon: '☁️', label: 'Overcast' };
  if ([45, 48].includes(c)) return { icon: '🌫️', label: 'Fog' };
  if ([51, 53, 55].includes(c)) return { icon: '🌦️', label: 'Drizzle' };
  if ([61, 63, 65].includes(c)) return { icon: '🌧️', label: 'Rain' };
  if ([71, 73, 75, 77].includes(c)) return { icon: '❄️', label: 'Snow' };
  if ([80, 81, 82].includes(c)) return { icon: '🌦️', label: 'Rain showers' };
  if ([95, 96, 99].includes(c)) return { icon: '⛈️', label: 'Thunderstorm' };
  return { icon: '🌡️', label: 'Weather' };
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function updateForecastCards(timeseries) {
  els.forecastGrid.innerHTML = '';
  if (!timeseries || !Array.isArray(timeseries) || timeseries.length === 0) {
    return;
  }

  // Show the next 4 data points from hourly series.
  const slice = timeseries.slice(0, 4);
  slice.forEach((item) => {
    const code = item.weather_code;
    const glyph = getConditionGlyph(code);

    const card = document.createElement('div');
    card.className = 'daycard';
    card.innerHTML = `
      <div class="t">${glyph.icon} ${Math.round(item.temperature)}°C</div>
      <div class="x">${glyph.label}</div>
      <div class="x">${formatTime(item.time)}</div>
    `;
    els.forecastGrid.appendChild(card);
  });
}

async function fetchJSON(url, { signal } = {}) {
  const res = await fetch(url, { signal });
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let details = '';
    if (contentType.includes('application/json')) {
      try {
        const j = await res.json();
        details = JSON.stringify(j);
      } catch {
        details = '';
      }
    }
    throw new Error(`Request failed (${res.status}). ${details ? 'Details: ' + details : ''}`.trim());
  }

  // If response is JSON, parse it.
  if (contentType.includes('application/json') || contentType.includes('application/')) {
    return res.json();
  }

  // Otherwise treat as text.
  const text = await res.text();
  throw new Error('Unexpected API response (not JSON). Response: ' + text.slice(0, 120));
}

async function resolveCityToLatLon(city) {
  // Open-Meteo Geocoding API
  const q = encodeURIComponent(city);
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=5&language=en&format=json`;
  const data = await fetchJSON(url, { signal: state.aborter?.signal });

  const first = data?.results?.[0];
  if (!first) return null;

  return {
    name: first.name,
    country: first.country,
    latitude: first.latitude,
    longitude: first.longitude,
    timezone: first.timezone || null,
  };
}

function computeFeelsLike({ temperature, wind_speed, humidity }) {
  // Simple comfort estimate (not official). Made for dashboard display.
  // Feels-like approximation: temperature - small humidity/wind penalties.
  const t = safeNumber(temperature);
  const w = safeNumber(wind_speed);
  const h = safeNumber(humidity);
  if (t === null) return null;

  const windPenalty = w === null ? 0 : Math.min(6, w * 0.12);
  const humidityPenalty = h === null ? 0 : Math.max(0, (h - 50) * 0.02);
  return t - windPenalty - humidityPenalty;
}

function buildNestedJSONForPreview(parsed) {
  // Create a nested object to demonstrate parsing complex JSON.
  return {
    request: {
      city: parsed.query,
      lat: parsed.lat,
      lon: parsed.lon,
      source: 'Open-Meteo (no API key required)',
    },
    current: {
      temperatureC: parsed.temperatureC,
      feelsLikeC: parsed.feelsLikeC,
      humidityPercent: parsed.humidityPercent,
      wind: {
        speedKmH: parsed.windKmH,
      },
      conditions: {
        weatherCode: parsed.weatherCode,
        conditionLabel: parsed.conditionLabel,
        icon: parsed.icon,
      },
    },
    time: {
      updatedLocal: parsed.updatedLocal,
      asReceived: parsed.updatedRaw,
    },
  };
}

async function getWeatherByCity(city) {
  const query = city.trim();
  if (!query) return;

  // Cancel previous in-flight request.
  if (state.aborter) state.aborter.abort();
  state.aborter = new AbortController();

  state.lastQuery = query;

  setStatus('Fetching…');
  showLoading();
  try {
    const loc = await resolveCityToLatLon(query);
    if (!loc) {
      throw new Error(`No results found for "${query}". Try a different spelling.`);
    }

    // Open-Meteo Weather API
    // - humidity and wind are from hourly; pick nearest hour.
    const { latitude, longitude } = loc;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature` +
      `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&timezone=auto`;

    const data = await fetchJSON(url, { signal: state.aborter.signal });


    const current = data?.current;
    if (!current) throw new Error('Weather data missing in response.');

    const temperatureC = safeNumber(current.temperature_2m);
    const humidityPercent = safeNumber(current.relative_humidity_2m);
    const windSpeed = safeNumber(current.wind_speed_10m);
    const weatherCode = safeNumber(current.weather_code);

    // apparent_temperature exists in current request.
    const apparent = safeNumber(current.apparent_temperature);

    const feelsLikeC = apparent !== null ? apparent : computeFeelsLike({ temperature: temperatureC, wind_speed: windSpeed, humidity: humidityPercent });

    if (temperatureC === null) throw new Error('Temperature value missing in response.');

    const glyph = getConditionGlyph(weatherCode);

    // Updated time
    const updatedRaw = current.time || data?.current?.time || null;
    const updatedLocal = updatedRaw ? formatTime(updatedRaw) : '—';

    const parsed = {
      query,
      name: loc.name,
      country: loc.country,
      lat: loc.latitude,
      lon: loc.longitude,
      timezone: loc.timezone,

      temperatureC,
      humidityPercent,
      windKmH: windSpeed === null ? null : windSpeed * 3.6,
      windSpeedMps: windSpeed,
      feelsLikeC,
      weatherCode,

      conditionLabel: glyph.label,
      icon: glyph.icon,

      updatedLocal,
      updatedRaw,
    };

    state.latestRaw = data;

    // Render hero
    els.cityTitle.textContent = `${loc.name}, ${loc.country}`;
    els.geoMeta.textContent = `Lat ${loc.latitude.toFixed(3)} • Lon ${loc.longitude.toFixed(3)}`;

    els.badgeIcon.textContent = glyph.icon;
    els.badgeText.textContent = glyph.label;

    els.bigTemp.textContent = `${Math.round(temperatureC)}°C`;

    els.metricHumidity.textContent = `${humidityPercent === null ? '—' : Math.round(humidityPercent)}%`;
    els.metricWind.textContent = `${parsed.windKmH === null ? '—' : Math.round(parsed.windKmH)} km/h`;
    els.metricFeels.textContent = `${feelsLikeC === null ? '—' : Math.round(feelsLikeC)} °C`;

    // Render details card
    els.tempValue.textContent = `${Math.round(temperatureC)}°C`;
    els.humidityValue.textContent = humidityPercent === null ? '—' : `${Math.round(humidityPercent)}`;
    els.windValue.textContent = parsed.windKmH === null ? '—' : `${Math.round(parsed.windKmH)}`;
    els.feelsLikeValue.textContent = feelsLikeC === null ? '—' : `${Math.round(feelsLikeC)}`;
    els.conditionText.textContent = glyph.label;
    els.updatedText.textContent = updatedLocal;

    // Create nested JSON preview
    const nested = buildNestedJSONForPreview({
      query,
      lat: parsed.lat,
      lon: parsed.lon,
      temperatureC: parsed.temperatureC,
      feelsLikeC: parsed.feelsLikeC,
      humidityPercent: parsed.humidityPercent,
      windKmH: parsed.windKmH,
      weatherCode: parsed.weatherCode,
      conditionLabel: parsed.conditionLabel,
      icon: parsed.icon,
      updatedLocal: parsed.updatedLocal,
      updatedRaw: parsed.updatedRaw,
    });

    els.jsonPre.textContent = JSON.stringify(nested, null, 2);

    // Forecast next hour-ish points from hourly arrays
    const hourly = data?.hourly;
    if (hourly?.time && Array.isArray(hourly.time)) {
      const len = hourly.time.length;
      const points = [];
      for (let i = 0; i < len && points.length < 8; i++) {
        points.push({
          time: hourly.time[i],
          temperature: hourly.temperature_2m[i],
          humidity: hourly.relative_humidity_2m?.[i],
          wind_speed: hourly.wind_speed_10m?.[i],
          weather_code: hourly.weather_code?.[i],
        });
      }
      updateForecastCards(points);
    } else {
      els.forecastGrid.innerHTML = '';
    }

    setStatus('Live data loaded');
  } catch (err) {
    const msg = (err && err.message) ? err.message : 'Unknown error while fetching weather.';
    showError(msg);
    setStatus('Error');
  } finally {
    hideLoading();
  }
}

async function getWeatherByGeo(lat, lon) {
  if (state.aborter) state.aborter.abort();
  state.aborter = new AbortController();

  setStatus('Fetching from coordinates…');
  showLoading();

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature` +
      `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&timezone=auto`;

    const data = await fetchJSON(url, { signal: state.aborter.signal });

    const current = data?.current;
    if (!current) throw new Error('Weather data missing in response.');

    const temperatureC = safeNumber(current.temperature_2m);
    const humidityPercent = safeNumber(current.relative_humidity_2m);
    const windSpeed = safeNumber(current.wind_speed_10m);
    const weatherCode = safeNumber(current.weather_code);
    const apparent = safeNumber(current.apparent_temperature);

    const feelsLikeC = apparent !== null ? apparent : computeFeelsLike({ temperature: temperatureC, wind_speed: windSpeed, humidity: humidityPercent });
    if (temperatureC === null) throw new Error('Temperature value missing in response.');

    const glyph = getConditionGlyph(weatherCode);
    const updatedRaw = current.time || null;
    const updatedLocal = updatedRaw ? formatTime(updatedRaw) : '—';

    // Best-effort reverse geocoding for display
    // Using Open-Meteo geocoding reverse endpoint.
    let locName = 'Your area';
    let country = '—';
    try {
      const revUrl = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&format=json`;
      const rev = await fetchJSON(revUrl, { signal: state.aborter.signal });
      const place = rev?.results?.[0];
      if (place?.name) locName = place.name;
      if (place?.country) country = place.country;
    } catch {
      // ignore display failure
    }

    const windKmH = windSpeed === null ? null : windSpeed * 3.6;

    els.cityTitle.textContent = `${locName}, ${country}`;
    els.geoMeta.textContent = `Lat ${lat.toFixed(3)} • Lon ${lon.toFixed(3)}`;
    els.badgeIcon.textContent = glyph.icon;
    els.badgeText.textContent = glyph.label;

    els.bigTemp.textContent = `${Math.round(temperatureC)}°C`;

    els.metricHumidity.textContent = `${humidityPercent === null ? '—' : Math.round(humidityPercent)}%`;
    els.metricWind.textContent = `${windKmH === null ? '—' : Math.round(windKmH)} km/h`;
    els.metricFeels.textContent = `${feelsLikeC === null ? '—' : Math.round(feelsLikeC)} °C`;

    // Details card
    els.tempValue.textContent = `${Math.round(temperatureC)}°C`;
    els.humidityValue.textContent = humidityPercent === null ? '—' : `${Math.round(humidityPercent)}`;
    els.windValue.textContent = windKmH === null ? '—' : `${Math.round(windKmH)}`;
    els.feelsLikeValue.textContent = feelsLikeC === null ? '—' : `${Math.round(feelsLikeC)}`;
    els.conditionText.textContent = glyph.label;
    els.updatedText.textContent = updatedLocal;

    const nested = buildNestedJSONForPreview({
      query: 'coordinates',
      lat,
      lon,
      temperatureC,
      feelsLikeC,
      humidityPercent,
      windKmH,
      weatherCode,
      conditionLabel: glyph.label,
      icon: glyph.icon,
      updatedLocal,
      updatedRaw,
    });

    els.jsonPre.textContent = JSON.stringify(nested, null, 2);

    // Forecast cards
    const hourly = data?.hourly;
    if (hourly?.time && Array.isArray(hourly.time)) {
      const len = hourly.time.length;
      const points = [];
      for (let i = 0; i < len && points.length < 8; i++) {
        points.push({
          time: hourly.time[i],
          temperature: hourly.temperature_2m[i],
          humidity: hourly.relative_humidity_2m?.[i],
          wind_speed: hourly.wind_speed_10m?.[i],
          weather_code: hourly.weather_code?.[i],
        });
      }
      updateForecastCards(points);
    } else {
      els.forecastGrid.innerHTML = '';
    }

    setStatus('Live data loaded');
  } catch (err) {
    showError(err?.message || 'Unknown error while fetching weather.');
    setStatus('Error');
  } finally {
    hideLoading();
  }
}

function bindEvents() {
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    getWeatherByCity(els.cityInput.value);
  });

  els.quickCityButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      els.cityInput.value = btn.getAttribute('data-city') || '';
      getWeatherByCity(els.cityInput.value);
    });
  });

  els.useMyLocationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showError('Geolocation is not supported by this browser.');
      return;
    }

    showLoading();
    setStatus('Getting your location…');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        await getWeatherByGeo(latitude, longitude);
      },
      (err) => {
        hideLoading();
        showError(err?.message || 'Location permission denied or unavailable.');
        setStatus('Error');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}

function init() {
  bindEvents();
  setStatus('Ready');

  // Optional: prefill with a city without being annoying.
  els.cityInput.value = 'London';
}

init();

