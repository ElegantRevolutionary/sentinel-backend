const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

// Usprawniony CORS
app.use(cors());

// Dynamiczny import node-fetch dla Render (jeśli używasz starszego Node)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// --- ENDPOINT INFO (Radar + Prognoza) ---
app.get('/api/map/info', async (req, res) => {
    try {
        const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await response.json();
        
        const past = data.radar.past.map(f => f.time);
        const forecast = data.radar.forecast.map(f => f.time);
        
        res.json({ 
            radarFrames: [...past, ...forecast],
            forecastStartIndex: past.length,
            status: "ok" 
        });
    } catch (err) {
        console.error("Radar Info Error:", err);
        res.status(500).json({ error: "Nie udało się pobrać danych radaru" });
    }
});

// --- PROXY DLA KAFELKÓW (Naprawione URL) ---
app.get('/api/map/:type/:ts/:z/:x/:y', async (req, res) => {
    const { type, ts, z, x, y } = req.params;
    let url = "";

    if (type === 'radar') {
        url = `https://tilecache.rainviewer.com/v2/radar/${ts}/256/${z}/${x}/${y}/2/1_1.png`;
    } else if (type === 'clouds') {
        // NAPRAWIONE: ${y} zamiast {y}
        url = `https://tilecache.rainviewer.com/v2/satellite/${ts}/256/${z}/${x}/${y}/0/0_0.png`;
    } else if (type === 'temp' || type === 'clouds_owm') {
        const API_KEY = "86667635417f91e6f0f60c2215abc2c9";
        const layerType = type === 'temp' ? 'temp_new' : 'clouds_new';
        url = `https://tile.openweathermap.org/map/${layerType}/${z}/${x}/${y}.png?appid=${API_KEY}`;
    }

    if (!url) return res.status(400).send("Invalid type");

    try {
        const response = await fetch(url, { timeout: 7000 });
        if (!response.ok) throw new Error('Source error');

        const arrayBuffer = await response.arrayBuffer();
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=1800'); // 30 min cache - odciąży Twój serwer
        res.send(Buffer.from(arrayBuffer));
    } catch (e) {
        // Przezroczysty pixel 1x1 w razie błędu
        res.set('Content-Type', 'image/png');
        res.send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
    }
});

// --- METEO PROXY (Z poprawką 502) ---
app.get('/api/meteo', async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: "Missing lat/lon" });

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,apparent_temperature,dew_point_2m,uv_index,cloud_cover,precipitation,snowfall&hourly=temperature_2m,surface_pressure,relative_humidity_2m&daily=precipitation_sum,snowfall_sum&timezone=auto&forecast_days=3`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: "Meteo service down" });
    }
});

// ... Twoje api/solar i reszta ...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sentinel Backend active on port ${PORT}`));
