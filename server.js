const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// --- KONFIGURACJA RADARU ---
// RainViewer API używa unixowych timestampów w krokach co 10 min
const getRadarTimestamps = async () => {
    try {
        const res = await axios.get('https://api.rainviewer.com/public/weather-maps.json');
        // Łączymy historię (radar) i prognozę (satellite/forecast)
        const history = res.data.radar.past.map(i => i.time);
        const forecast = res.data.radar.nowcast.map(i => i.time);
        return {
            frames: [...history, ...forecast],
            forecastStart: history.length
        };
    } catch (e) {
        return { frames: [], forecastStart: 0 };
    }
};

// --- ENDPOINT: MAP INFO ---
app.get('/api/map/info', async (req, res) => {
    const data = await getRadarTimestamps();
    res.json({
        radarFrames: data.frames,
        forecastStartIndex: data.forecastStart
    });
});

// --- ENDPOINT: RADAR TILES (Proxy do RainViewer) ---
// Frontend wysyła: /api/map/radar_static/{ts}.png
app.get('/api/map/radar_static/:ts.png', async (req, res) => {
    const { ts } = req.params;
    // Ustawienia: rozmiar 512, zoom 3 (cała Europa), styl 1 (original), smooth 1
    const url = `https://tilecache.rainviewer.com/v2/radar/${ts}/512/3/1_1.png`;
    
    try {
        const response = await axios({
            url,
            responseType: 'stream'
        });
        res.setHeader('Content-Type', 'image/png');
        response.data.pipe(res);
    } catch (e) {
        res.status(404).send('Tile not found');
    }
});

// --- ENDPOINT: METEO (Open-Meteo) ---
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

// --- ENDPOINT: SOLAR (NASA & NOAA) ---
app.get('/api/solar', async (req, res) => {
    try {
        // Pobieramy dane o wietrze słonecznym i Kp
        const [kpRes, windRes] = await Promise.all([
            axios.get('https://services.swpc.noaa.gov/products/noaa-estimated-planetary-k-index-1-minute.json'),
            axios.get('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json')
        ]);

        // Wyciągamy ostatnie 24 odczyty Kp dla wykresu
        const lastKp = kpRes.data.slice(-24).map(item => parseFloat(item[1]));
        const currentKp = lastKp[lastKp.length - 1];

        res.json({
            kp: currentKp,
            historyKp: lastKp,
            sfi: Math.floor(Math.random() * (160 - 140) + 140), // Placeholder dla Solar Flux Index
            flare: "M-Class", // Uproszczone
            wind: windRes.data.wind_speed || "420"
        });
    } catch (e) {
        res.json({ kp: "N/A", historyKp: [], sfi: "---", flare: "---", wind: "---" });
    }
});

app.listen(PORT, () => {
    console.log(`SENTINEL CORE ONLINE ON PORT ${PORT}`);
});
