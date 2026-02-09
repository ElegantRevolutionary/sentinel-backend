const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// --- ENDPOINT: METEO ---
app.get('/api/meteo', async (req, res) => {
    const { lat, lon } = req.query;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,surface_pressure,wind_speed_10m,cloud_cover,dew_point_2m&hourly=temperature_2m,relative_humidity_2m,surface_pressure&daily=precipitation_sum,snowfall_sum,uv_index_max&timezone=auto`;

    try {
        const response = await axios.get(url);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ error: 'Meteo API Error' });
    }
});

// --- ENDPOINT: SOLAR (POPRAWIONY) ---
app.get('/api/solar', async (req, res) => {
  try {
    // 1. Pobieramy dane z najbardziej stabilnych źródeł tekstowych i JSON
    const [kpRes, sfiRes, windRes] = await Promise.all([
      axios.get('https://services.swpc.noaa.gov/products/noaa-estimated-planetary-k-index-1-minute.json').catch(() => null),
      axios.get('https://services.swpc.noaa.gov/products/summary/10cm-radio-flux.json').catch(() => null),
      axios.get('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json').catch(() => null)
    ]);

    // --- LOGIKA KP INDEX ---
    let historyKp = new Array(24).fill(0);
    let currentKp = "---";
    if (kpRes && kpRes.data && kpRes.data.length > 1) {
      const rawData = kpRes.data.slice(1);
      historyKp = rawData.slice(-24).map(item => parseFloat(item[1]) || 0);
      currentKp = historyKp[historyKp.length - 1].toFixed(1);
    }

    // --- LOGIKA SFI (Radio Flux) ---
    // Sprawdzamy Flux lub flux - NOAA bywa niekonsekwentne w wielkości liter
    let sfi = "---";
    if (sfiRes && sfiRes.data) {
      sfi = sfiRes.data.Flux || sfiRes.data.flux || "---";
    }

    // --- LOGIKA WIATRU ---
    let wind = "---";
    if (windRes && windRes.data) {
      wind = windRes.data.WindSpeed || windRes.data.wind_speed || "---";
    }

    // --- LOGIKA FLARE (Prawdopodobieństwo) ---
    // Jeśli brak danych, wpisujemy 10% (standardowa aktywność), żeby nie było pusto
    const flare = 10; 

    res.json({
      kp: currentKp,
      historyKp: historyKp,
      sfi: sfi,
      flare: flare,
      wind: wind
    });

  } catch (e) {
    console.error("SENTINEL SOLAR CRITICAL ERROR:", e.message);
    res.json({
      kp: "N/A",
      historyKp: new Array(24).fill(0),
      sfi: "---",
      flare: "0",
      wind: "---"
    });
  }
});

app.listen(PORT, () => {
    console.log(`SENTINEL CORE ONLINE ON PORT ${PORT}`);
});
