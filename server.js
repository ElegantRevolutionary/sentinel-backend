const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());

app.get('/api/solar', async (req, res) => {
   try {
    const [indices, kp, flares, wind, xray] = await Promise.all([
        axios.get('https://services.swpc.noaa.gov/json/solar-indices.json').catch(() => ({data:[]})),
        axios.get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').catch(() => ({data:[]})),
        axios.get('https://services.swpc.noaa.gov/products/json/flare-probabilities.json').catch(() => ({data:[]})),
        axios.get('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json').catch(() => ({data:{}})),
        // NOWE: Dane X-Ray z ostatnich 2 godzin
        axios.get('https://services.swpc.noaa.gov/json/goes/primary/xrays-1-minute.json').catch(() => ({data:[]}))
    ]);

    // Wyciągamy ostatnie 30 odczytów dla wykresu
    const xrayHistory = xray.data
        .filter(d => d.energy === "0.1-0.8nm")
        .slice(-30)
        ..map(d => ({
        time: d.time_tag,
        val: d.flux || 0.00000001 // Zabezpieczenie przed zerem (logarytm!)
    }));

    res.json({
        sfi: indices.data.length ? indices.data[indices.data.length - 1].sfi : "---",
        kp: kpRows.length ? parseFloat(kpRows[kpRows.length - 1][1]).toFixed(1) : "---",
        historyKp: kpRows.slice(-24).map(r => parseFloat(r[1])),
        flare: flares.data.length ? flares.data[0]['m_class_1_day'] + "%" : "---",
        wind: wind.data.WindSpeed || wind.data.wind_speed || "---",
        // NOWE:
        xray: xrayHistory.length ? xrayHistory[xrayHistory.length - 1].val : null,
        xrayFull: xrayHistory
    });
},

app.get('/api/pkp/:id', async (req, res) => {
    try {
        const url = `https://v6.db.transport.rest/stops/${req.params.id}/departures?duration=240&results=15`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (e) {
        res.status(503).json({ error: "PKP Offline" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sentinel Backend on ${PORT}`));
