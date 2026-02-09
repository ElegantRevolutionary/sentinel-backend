const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*', // Pozwala na zapytania z każdego źródła (dla testów idealne)
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

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
