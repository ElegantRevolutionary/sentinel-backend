const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());

app.get('/api/solar', async (req, res) => {
    try {
        const [indices, kp] = await Promise.all([
            axios.get('https://services.swpc.noaa.gov/json/solar-indices.json').catch(() => ({data:[]})),
            axios.get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').catch(() => ({data:[]}))
        ]);
        
        const latestIndices = indices.data.length ? indices.data[indices.data.length - 1] : {sfi: "---"};
        const kpRows = kp.data.filter(r => r && !isNaN(parseFloat(r[1])));
        
        res.json({
            sfi: latestIndices.sfi || "---",
            kp: kpRows.length ? parseFloat(kpRows[kpRows.length - 1][1]).toFixed(1) : "---",
            historyKp: kpRows.slice(-24).map(r => parseFloat(r[1]))
        });
    } catch (e) {
        res.status(500).json({ error: "Server Error" });
    }
});

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
