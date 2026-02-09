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
    const axiosConfig = {
        headers: { 'User-Agent': 'Mozilla/5.0 Sentinel-Dashboard/1.0' }
    };

    try {
        const [kpRes, sfiRes, windRes, flareRes] = await Promise.all([
            axios.get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', axiosConfig),
            axios.get('https://services.swpc.noaa.gov/products/10cm-flux-30-day.json', axiosConfig),
            axios.get('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json', axiosConfig).catch(() => null),
            axios.get('https://services.swpc.noaa.gov/json/solar_probabilities.json', axiosConfig).catch(() => null)
        ]);

        // --- OBSŁUGA KP (Twoje źródło) ---
        let historyKp = new Array(24).fill(0);
        let currentKp = "---";
        if (kpRes.data && kpRes.data.length > 1) {
            const dataRows = kpRes.data.slice(1);
            historyKp = dataRows.slice(-24).map(row => parseFloat(row[1]) || 0);
            currentKp = historyKp[historyKp.length - 1].toFixed(1);
        }

        // --- OBSŁUGA SFI (Twoje źródło) ---
        let currentSfi = "---";
        if (sfiRes.data && sfiRes.data.length > 1) {
            const lastRow = sfiRes.data[sfiRes.data.length - 1];
            currentSfi = parseFloat(lastRow[1]).toFixed(1);
        }

        // --- OBSŁUGA WIATRU ---
        let wind = "---";
        if (windRes && windRes.data) {
            wind = windRes.data.WindSpeed || windRes.data.wind_speed || "---";
        }

        // --- OBSŁUGA FLARE PROB (LIVE %) ---
        // Wyciągamy prawdopodobieństwo rozbłysku klasy M (najbardziej istotne dla RF)
        let flareProb = "0";
        if (flareRes && flareRes.data && flareRes.data.length > 0) {
            // NOAA podaje prognozy na dziś, jutro, pojutrze. Bierzemy 'dziś' (index 0)
            // Interesuje nas klasa M (M-class flare probability)
            flareProb = flareRes.data[0].m_class_1_day || "0";
        }

        res.json({
            kp: currentKp,
            historyKp: historyKp,
            sfi: currentSfi,
            flare: flareProb, // To zwróci samą liczbę, np. 25
            wind: wind
        });

    } catch (e) {
        console.error("SENTINEL FETCH ERROR:", e.message);
        res.status(500).json({ error: "Błąd połączenia z satelitami NOAA" });
    }
});

app.listen(PORT, () => {
    console.log(`SENTINEL CORE ONLINE ON PORT ${PORT}`);
});
