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

// --- ENDPOINT: SOLAR (Tu była dziura) ---
app.get('/api/solar', async (req, res) => {
    try {
        // Pobieramy dane o Kp, wietrze słonecznym i SFI jednocześnie
        const [kpRes, windRes, sfiRes] = await Promise.all([
            axios.get('https://services.swpc.noaa.gov/products/noaa-estimated-planetary-k-index-1-minute.json'),
            axios.get('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json'),
            axios.get('https://services.swpc.noaa.gov/products/summary/10cm-radio-flux.json')
        ]);

        // 1. Obróbka Kp Index (ostatnie 24 odczyty)
        // Omijamy nagłówek (slice(1)) i bierzemy ostatnie 24 rekordy
        const rawKp = kpRes.data.slice(1);
        const historyKp = rawKp.slice(-24).map(item => parseFloat(item[1]));
        const currentKp = historyKp[historyKp.length - 1] || 0;

        // 2. Obróbka SFI (Solar Flux Index)
        const currentSfi = sfiRes.data.flux || "---";

        // 3. Wiatr słoneczny
        const solarWind = windRes.data.wind_speed || "---";

        // 4. Flare Probability (Prawdopodobieństwo rozbłysków - demo)
        const flareProb = Math.floor(Math.random() * (20 - 5) + 5);

        res.json({
            kp: currentKp.toFixed(1),
            historyKp: historyKp,
            sfi: currentSfi,
            flare: flareProb,
            wind: solarWind
        });

    } catch (e) {
        console.error("SOLAR FETCH ERROR:", e.message);
        // Zwracamy bezpieczne dane, żeby frontend się nie zawiesił
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
