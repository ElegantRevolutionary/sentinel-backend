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
        const [kpRes, sfiRes, windRes, flareRes, xrayRes] = await Promise.all([
            axios.get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', axiosConfig).catch(() => null),
            axios.get('https://services.swpc.noaa.gov/products/10cm-flux-30-day.json', axiosConfig).catch(() => null),
            axios.get('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json', axiosConfig).catch(() => null),
            axios.get('https://services.swpc.noaa.gov/json/solar_probabilities.json', axiosConfig).catch(() => null),
            axios.get('https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json', axiosConfig).catch(() => null)
        ]);

        // --- KP INDEX ---
        let historyKp = new Array(24).fill(0);
        let currentKp = "---";
        if (kpRes?.data?.length > 1) {
            const dataRows = kpRes.data.slice(1);
            historyKp = dataRows.slice(-24).map(row => parseFloat(row[1]) || 0);
            currentKp = historyKp[historyKp.length - 1].toFixed(1);
        }

        // --- SFI (10.7cm Flux) ---
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

        // --- FLARE PROBABILITY (z podkreślnikiem solar_probabilities) ---
        let flareProb = "0";
        if (flareRes?.data?.length > 0) {
            flareProb = flareRes.data[0].m_class_1_day || "0";
        }

        // --- X-RAY FLUX (GOES-16/18) ---
        let xrayHistory = [];
        if (xrayRes?.data) {
            // Wybieramy pasmo 0.1-0.8nm (standard dla klasyfikacji A, B, C, M, X)
            xrayHistory = xrayRes.data
                .filter(d => d.energy === '0.1-0.8nm')
                .slice(-60) // Ostatnia godzina (odczyty co 1 min)
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
            xrayHistory: xrayHistory
        });

    } catch (e) {
        console.error("SENTINEL FETCH ERROR:", e.message);
        res.status(500).json({ error: "NOAA API Connection Failed" });
    }
});

app.get('/api/moon', async (req, res) => {
    try {
        // Generowanie dat: START (teraz), STOP (za 24h)
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);

        const formatDate = (d) => d.toISOString().split('T')[0];
        
        const startTime = `'${formatDate(now)}'`;
        const stopTime = `'${formatDate(tomorrow)}'`;

        // Budujemy URL z dynamicznymi datami
        const nasaUrl = `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='301'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='coord@399'&SITE_COORD='20.93,52.4,0.1'&STEP_SIZE='1h'&QUANTITIES='4,18,20'&START_TIME=${startTime}&STOP_TIME=${stopTime}`;
        
        const response = await axios.get(nasaUrl);
        const rawData = response.data.result;

        // Sekcja parsowania (to co robiliśmy wcześniej)
        const table = rawData.split('$$SOE')[1].split('$$EOE')[0].trim();
        const lines = table.split('\n');

        // Pobieramy dane dla obecnej godziny (indeks 0 to start_time)
        const current = lines[0].trim().split(/\s+/);

        // Znajdź wschód i zachód w tabeli 24h
        let moonRise = "--:--";
        let moonSet = "--:--";
        for (let i = 0; i < lines.length - 1; i++) {
            const row = lines[i].trim().split(/\s+/);
            const nextRow = lines[i+1].trim().split(/\s+/);
            const elNow = parseFloat(row[5]);
            const elNext = parseFloat(nextRow[5]);

            if (elNow < 0 && elNext >= 0) moonRise = nextRow[1];
            if (elNow > 0 && elNext <= 0) moonSet = row[1];
        }

        res.json({
            illum: current[8],
            el: current[5],
            az: current[4],
            dist: (parseFloat(current[9]) * 149597870.7).toFixed(0), // Przeliczenie AU na KM
            rise: moonRise,
            set: moonSet,
            eme: parseFloat(current[5]) > 0 ? "OPTIMAL" : "NO SIGNAL"
        });

    } catch (error) {
        console.error("NASA Sync Error:", error);
        res.status(500).json({ error: "LUNAR TELEMETRY OFFLINE" });
    }
});

app.listen(PORT, () => {
    console.log(`SENTINEL CORE ONLINE ON PORT ${PORT}`);
});
