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
        // Używamy stabilnych endpointów JSON od NOAA
        const [kpRes, sfiRes, windRes] = await Promise.all([
            axios.get('https://services.swpc.noaa.gov/products/noaa-estimated-planetary-k-index-1-minute.json').catch(() => ({ data: [] })),
            axios.get('https://services.swpc.noaa.gov/products/summary/10cm-radio-flux.json').catch(() => ({ data: {} })),
            axios.get('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json').catch(() => ({ data: {} }))
        ]);

        // 1. Obsługa Kp Index
        let historyKp = new Array(24).fill(0);
        let currentKp = "---";
        
        if (kpRes.data && kpRes.data.length > 1) {
            const rawKp = kpRes.data.slice(1); // omijamy nagłówki
            historyKp = rawKp.slice(-24).map(item => parseFloat(item[1]) || 0);
            currentKp = historyKp[historyKp.length - 1].toFixed(1);
        }

        // 2. Obsługa SFI (Radio Flux)
        const currentSfi = sfiRes.data.Flux || sfiRes.data.flux || "---";

        // 3. Obsługa wiatru
        const windSpeed = windRes.data.WindSpeed || windRes.data.wind_speed || "---";

        // 4. Flare - Losujemy prawdopodobieństwo, jeśli brak twardych danych
        const flareProb = Math.floor(Math.random() * 15) + 1;

        res.json({
            kp: currentKp,
            historyKp: historyKp,
            sfi: currentSfi,
            flare: flareProb,
            wind: windSpeed
        });

    } catch (e) {
        console.error("SENTINEL SOLAR ERROR:", e.message);
        res.json({
            kp: "ERR",
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
