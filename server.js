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
            // Zmieniamy na stabilniejszy endpoint 3-dniowy
            axios.get('https://services.swpc.noaa.gov/json/goes/primary/xrays-3-day.json').catch(() => ({data:[]}))
        ]);

        const latestIndices = indices.data.length ? indices.data[indices.data.length - 1] : {sfi: "---"};
        const kpRows = kp.data.filter(r => r && !isNaN(parseFloat(r[1])));
        
        // Stabilniejsze filtrowanie X-Ray
        const xrayHistory = (xray.data || [])
            .filter(d => d.energy === "0.1-0.8nm")
            .slice(-40) // Ostatnie 40 odczytów
            .map(d => ({
                time: d.time_tag,
                val: d.flux || 0.00000001
            }));

        res.json({
            sfi: latestIndices.sfi || "---",
            kp: kpRows.length ? parseFloat(kpRows[kpRows.length - 1][1]).toFixed(1) : "---",
            historyKp: kpRows.slice(-24).map(r => parseFloat(r[1])),
            flare: flares.data.length ? flares.data[0]['m_class_1_day'] + "%" : "---",
            wind: wind.data.WindSpeed || wind.data.wind_speed || "---",
            xrayFull: xrayHistory
        });
    } catch (e) {
        console.error("Backend Error:", e);
        res.status(500).json({ error: "Internal Server Error" });
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
