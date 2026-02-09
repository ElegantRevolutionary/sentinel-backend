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
