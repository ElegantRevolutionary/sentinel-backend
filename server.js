const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// --- 1. SOLAR API ---
app.get('/api/solar', async (req, res) => {
    try {
        const config = { timeout: 8000 };
        const [report, kp, wind, xray] = await Promise.all([
            axios.get('https://services.swpc.noaa.gov/text/daily-solar-indices.txt', config).catch(() => ({data: ""})),
            axios.get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', config).catch(() => ({data: []})),
            axios.get('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json', config).catch(() => ({data: {}})),
            axios.get('https://services.swpc.noaa.gov/json/goes/primary/xrays-3-day.json', config).catch(() => ({data: []}))
        ]);

        let sfi = "---";
        if (report.data) {
            const lines = report.data.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            const parts = lastLine.trim().split(/\s+/);
            if (parts.length > 3) sfi = parts[3];
        }

        const xrayData = xray.data || [];
        const last24h = xrayData.filter(d => d.energy === "0.1-0.8nm").slice(-40);

        res.json({
            sfi: sfi,
            kp: kp.data.length > 0 ? kp.data[kp.data.length - 1][1] : "---",
            wind: wind.data.WindSpeed || wind.data.wind_speed || "---",
            xrayFull: last24h.map(d => ({ time: d.time_tag, val: d.flux })),
            status: "ok"
        });
    } catch (e) {
        console.error("Solar Error:", e.message);
        res.status(500).json({ error: "Solar data failed" });
    }
});

// --- 2. RADAR INFO ---
app.get('/api/map/info', async (req, res) => {
    try {
        const response = await axios.get('https://api.rainviewer.com/public/weather-maps.json', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Sentinel-Dashboard/1.0)' },
            timeout: 5000 
        });
        
        const data = response.data;
        if (!data || !data.radar) throw new Error("Błędny format danych RainViewer");

        const past = data.radar.past ? data.radar.past.map(f => f.time) : [];
        const forecast = data.radar.forecast ? data.radar.forecast.map(f => f.time) : [];
        
        res.json({ 
            radarFrames: [...past, ...forecast],
            forecastStartIndex: past.length,
            status: "ok" 
        });
    } catch (err) {
        console.error("Radar Error:", err.message);
        const now = Math.floor(Date.now() / 1000);
        const fallbackTs = now - (now % 600);
        res.json({ 
            radarFrames: [fallbackTs],
            forecastStartIndex: 1,
            status: "fallback" 
        });
    }
});

// --- 3. METEO PROXY ---
app.get('/api/meteo', async (req, res) => {
    const { lat, lon } = req.query;
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,apparent_temperature,dew_point_2m,uv_index,cloud_cover,precipitation,snowfall&hourly=temperature_2m,surface_pressure,relative_humidity_2m&daily=precipitation_sum,snowfall_sum&timezone=auto&forecast_days=3`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (e) {
        res.status(500).json({ error: "Meteo failed" });
    }
});

// --- 4. MAP TILES PROXY (NAPRAWIONE) ---
app.get('/api/map/:type/:ts/:z/:x/:y', async (req, res) => {
    const { type, ts, z, x, y } = req.params;
    let url = "";

    if (type === 'radar') {
        url = `https://tilecache.rainviewer.com/v2/radar/${ts}/256/${z}/${x}/${y}/2/1_1.png`;
    } else if (type === 'clouds') {
        url = `https://tilecache.rainviewer.com/v2/satellite/${ts}/256/${z}/${x}/${y}/0/0_0.png`;
    } else if (type === 'temp' || type === 'clouds_owm') {
        const layer = type === 'temp' ? 'temp_new' : 'clouds_new';
        url = `https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png?appid=86667635417f91e6f0f60c2215abc2c9`;
    }

    try {
        const response = await axios.get(url, { 
            responseType: 'arraybuffer', 
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
        });

        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
        });

        res.send(response.data);
    } catch (e) {
        // Zwracamy przeźroczysty piksel zamiast błędu
        const emptyPixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400' 
        });
        res.send(emptyPixel);
    }
});

// --- 5. PKP FALLBACK ---
app.get('/api/pkp/:id', (req, res) => {
    res.json({ status: "offline", message: "Service restricted" });
});

// --- 6. RADAR STATIC OVERLAY (Naprawiony pod kafelki RainViewer) ---
app.get('/api/map/radar_static/:ts.png', async (req, res) => {
    const { ts } = req.params;
    
    // RainViewer najlepiej radzi sobie z kafelkami. 
    // Zamiast jednego wielkiego obrazu, serwer pobierze konkretny kafelek 
    // pokrywający centralną Polskę (Zoom 6, X 35, Y 21 - okolice Wieliszewa)
    // To zagwarantuje status 200 OK dla historii i prognoz.
    const url = `https://tilecache.rainviewer.com/v2/radar/${ts}/256/6/35/21/2/1_1.png`;

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 7000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=300',
            'Access-Control-Allow-Origin': '*'
        });

        res.send(response.data);
    } catch (e) {
        console.error(`Radar Tile Error (${ts}):`, e.message);
        const emptyPixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        res.set('Content-Type', 'image/png');
        res.send(emptyPixel);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
