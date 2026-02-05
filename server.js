const express = require('express');
const axios = require('axios');
const app = express();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const cors = require('cors');
app.use(cors({
    origin: '*', // Po testach usunąć
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.get('/api/solar', async (req, res) => {
    try {
        const [report, kp, wind, xray] = await Promise.all([
            axios.get('https://services.swpc.noaa.gov/text/daily-solar-indices.txt').catch(() => ({data: ""})),
            axios.get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').catch(() => ({data: []})),
            axios.get('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json').catch(() => ({data: {}})),
            axios.get('https://services.swpc.noaa.gov/json/goes/primary/xrays-3-day.json').catch(() => ({data: []}))
        ]);

        // 1. PARSER SFI
        let sfi = "---";
        if (report.data && typeof report.data === 'string') {
            const lines = report.data.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            const parts = lastLine.trim().split(/\s+/);
            if (parts.length > 3) sfi = parts[3]; 
        }

        // 2. LOGIKA FLARE MAX 24H + RECENT ALERT
        let maxVal = 0;
        let maxTime = null;
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
        
        const xrayData = xray.data || [];
        const last24hData = xrayData.filter(d => {
            const dTime = new Date(d.time_tag);
            return d.energy === "0.1-0.8nm" && dTime > oneDayAgo;
        });

        last24hData.forEach(d => {
            const f = parseFloat(d.flux);
            if (f > maxVal) {
                maxVal = f;
                maxTime = new Date(d.time_tag);
            }
        });

        let flareDisplay = "A 0.0";
        if (maxVal > 0) {
            let label = "A";
            let val = maxVal / 0.00000001;
            
            if (maxVal >= 0.0001) { label = "X"; val = maxVal / 0.0001; }
            else if (maxVal >= 0.00001) { label = "M"; val = maxVal / 0.00001; }
            else if (maxVal >= 0.000001) { label = "C"; val = maxVal / 0.000001; }
            else if (maxVal >= 0.0000001) { label = "B"; val = maxVal / 0.0000001; }
            
            flareDisplay = `${label} ${val.toFixed(1)}`;
            
            if (maxTime && maxTime > oneHourAgo) {
                flareDisplay += " [RECENT]";
            }
        }

        // 3. DANE DO WYKRESU (40 punktów)
        const xrayHistory = last24hData.slice(-40).map(d => ({
            time: d.time_tag,
            val: d.flux || 0.00000001
        }));

        res.json({
            sfi: sfi,
            kp: (kp.data && kp.data.length > 0) ? parseFloat(kp.data[kp.data.length-1][1]).toFixed(1) : "---",
            historyKp: (kp.data || []).slice(-24).map(r => parseFloat(r[1])),
            flare: `Max 24h: ${flareDisplay}`,
            wind: wind.data.WindSpeed || wind.data.wind_speed || "---",
            xrayFull: xrayHistory
        });
    } catch (e) {
        console.error("Backend Error:", e);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/api/map/info', async (req, res) => {
    try {
        const response = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 3000
        });
        const data = await response.json();
        res.json({ 
            radarTs: data.radar.past[data.radar.past.length - 1].time, 
            satelliteTs: data.satellite.past[data.satellite.past.length - 1].time,
            status: "ok" 
        });
    } catch (e) {
        const now = Math.floor(Date.now() / 1000);
        const calibratedTs = (now - (now % 600)) - 1200; 
        res.json({ 
            radarTs: calibratedTs, 
            satelliteTs: calibratedTs, 
            status: "fallback_calculated" 
        });
    }
});

// --- TO MUSI BYĆ DRUGIE ---
app.get('/api/map/:type/:ts/:z/:x/:y', async (req, res) => {
    const { type, ts, z, x, y } = req.params;
    let url = ""; // inicjalizacja pustym stringiem

    if (type === 'radar') {
        url = `https://tilecache.rainviewer.com/v2/radar/${ts}/256/${z}/${x}/${y}/2/1_1.png`;
    } else if (type === 'clouds') {
        url = `https://tilecache.rainviewer.com/v2/satellite/${ts}/256/${z}/${x}/${y}/0/0_0.png`;
    } else if (type === 'temp') {
        const API_KEY = "86667635417f91e6f0f60c2215abc2c9";
        url = `https://tile.openweathermap.org/map/temp_new/${z}/${x}/${y}.png?appid=${API_KEY}`;
    }

    // DODAJ TO: Zabezpieczenie przed pustym URL
    if (!url) {
        return res.status(400).json({ error: "Invalid map type" });
    }

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000 // Dodajemy timeout, żeby Render nie wisiał
        });

        if (!response.ok) throw new Error('Source status: ' + response.status);

        const arrayBuffer = await response.arrayBuffer();
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=600'); // Cache na 10 min, odciąży serwer
        res.send(Buffer.from(arrayBuffer));
    } catch (e) {
        // Przezroczysty pixel w razie błędu
        const transparentPixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        res.set('Content-Type', 'image/png');
        res.send(transparentPixel);
    }
});

app.get('/api/meteo', async (req, res) => {
    const { lat, lon } = req.query;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,apparent_temperature,dew_point_2m,uv_index,cloud_cover,precipitation,snowfall&hourly=temperature_2m,surface_pressure,relative_humidity_2m&daily=precipitation_sum,snowfall_sum&timezone=auto&forecast_days=3&models=icon_seamless`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: "Meteo Proxy Failed" });
    }
});

app.get('/api/pkp/:stationId', (req, res) => {
    // Nie robimy fetch, po prostu od razu odpowiadamy
    res.json({ status: "offline", message: "Blokada regionalna PKP" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sentinel Backend active on port ${PORT}`));
