const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({ origin: '*' }));

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

app.get('/api/solar', async (req, res) => {
    const axiosConfig = {
        headers: { 'User-Agent': 'Mozilla/5.0 Sentinel-Dashboard/1.0' },
        timeout: 8000 
    };

    try {
        const [kpRes, sfiRes, windRes, flareRes, xrayRes, scalesRes] = await Promise.all([
            axios.get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', axiosConfig).catch(() => null),
            axios.get('https://services.swpc.noaa.gov/products/10cm-flux-30-day.json', axiosConfig).catch(() => null),
            axios.get('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json', axiosConfig).catch(() => null),
            axios.get('https://services.swpc.noaa.gov/json/solar_probabilities.json', axiosConfig).catch(() => null),
            axios.get('https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json', axiosConfig).catch(() => null),
            // Używamy widocznego na liście pliku noaa-scales.json
            axios.get('https://services.swpc.noaa.gov/products/noaa-scales.json', axiosConfig).catch(() => null)
        ]);

        // --- KP INDEX ---
        let historyKp = new Array(24).fill(0);
        let currentKp = "---";
        if (kpRes?.data?.length > 1) {
            const dataRows = kpRes.data.slice(1);
            historyKp = dataRows.slice(-24).map(row => parseFloat(row[1]) || 0);
            currentKp = historyKp[historyKp.length - 1].toFixed(1);
        }

        // --- SFI ---
        let currentSfi = "---";
        if (sfiRes?.data?.length > 1) {
            const lastRow = sfiRes.data[sfiRes.data.length - 1];
            currentSfi = parseFloat(lastRow[1]).toFixed(1);
        }

        // --- SOLAR WIND ---
        let wind = "---";
        if (windRes?.data) {
            wind = windRes.data.WindSpeed || windRes.data.wind_speed || "---";
        }

        // --- FLARE PROBABILITY ---
        let flareProb = "0";
        if (flareRes?.data?.length > 0) {
            flareProb = flareRes.data[0].m_class_1_day || "0";
        }

        // --- PROTON FLUX (z noaa-scales.json) ---
        let protonValue = "0.10"; 
        if (scalesRes?.data && scalesRes.data.s) {
            // Skala S (Solar Radiation) informuje o poziomie burzy protonowej (0-5)
            // Jeśli S0, to strumień jest w normie (poniżej 10 pfu)
            const sScale = parseInt(scalesRes.data.s.current);
            // Mapujemy skalę na przybliżone wartości pfu dla dashboardu
            const pfuMapping = ["0.15", "10", "100", "1000", "10000", "100000"];
            protonValue = pfuMapping[sScale] || "0.15";
        }

        // --- X-RAY FLUX ---
        let xrayHistory = [];
        if (xrayRes && xrayRes.data && Array.isArray(xrayRes.data)) {
            xrayHistory = xrayRes.data
                .filter(d => d && d.energy === '0.1-0.8nm')
                .slice(-60)
                .map(d => ({
                    time: d.time_tag,
                    val: d.flux
                }));
        }

        res.json({
            kp: currentKp,
            historyKp: historyKp,
            sfi: currentSfi,
            flare: flareProb,
            wind: wind,
            proton: protonValue, // To przesyłamy do frontendu
            xrayHistory: xrayHistory
        });

    } catch (e) {
        console.error("SENTINEL FETCH ERROR:", e.message);
        res.status(500).json({ error: "NOAA API Connection Failed" });
    }
});
// server.js
app.get('/api/moon', async (req, res) => {
    try {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const formatDate = (d) => d.toISOString().split('T')[0];

        // ZMIANA: Dodajemy '1' do QUANTITIES. To nam da stały układ kolumn.
        const nasaUrl = `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='301'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='coord@399'&SITE_COORD='20.93,52.4,0.1'&STEP_SIZE='1h'&QUANTITIES='1,4,9,20'&START_TIME='${formatDate(now)}'&STOP_TIME='${formatDate(tomorrow)}'`;
        
        const response = await axios.get(nasaUrl);
        res.json(response.data); 
    } catch (error) {
        console.error("NASA ERROR:", error.message);
        res.status(500).json({ error: "NASA OFFLINE" });
    }
});

app.listen(PORT, () => {
    console.log(`SENTINEL CORE ONLINE ON PORT ${PORT}`);
});
