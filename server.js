const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

app.use(cors());

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

app.get('/api/map/:type/:ts?/:z/:x/:y', async (req, res) => {
    const { type, ts, z, x, y } = req.params;
    let url;

    if (type === 'radar') {
        url = `https://tilecache.rainviewer.com/v2/radar/${ts}/256/${z}/${x}/${y}/2/1_1.png`;
    } else if (type === 'clouds') {
        url = `https://tilecache.rainviewer.com/v2/satellite/${ts}/256/${z}/${x}/${y}/2/1_1.png`;
    } else if (type === 'temp') {
        const API_KEY = "86667635417f91e6f0f60c2215abc2c9";
        url = `https://tile.openweathermap.org/map/temp_new/${z}/${x}/${y}.png?appid=${API_KEY}`;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`External API status: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (error) {
        console.error(`Proxy Error [${type}]:`, error.message);
        res.status(500).json({ error: "Failed to fetch tile", details: error.message });
    }
});

app.get('/api/pkp/:id', async (req, res) => {
    try {
        const url = `https://v6.db.transport.rest/stops/${req.params.id}/departures?duration=240&results=15`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        res.status(503).json({ error: 'PKP Offline' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sentinel Backend active on port ${PORT}`));
