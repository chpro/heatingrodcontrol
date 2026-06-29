const hrc = require('./control');
const dataProvider = require('./influxdataprovider');
const { CONFIG } = require('./config');
const { SWITCH_STATUS } = require('./switchstatus');
const { log, error } = require('./logger');
const express = require('express');
const cors = require('cors');
const ws = express();
const port = 3000;

var corsOptions = {
    origin: /https?:\/\/tig.*$/i,
    credentials: true,
};

ws.use(cors(corsOptions));

ws.get('/config', async (req, res) => {
    try {
        const switchOn = await hrc.switch0.get();
        const currentStatusValues = await dataProvider.getCurrentStatusValues(switchOn);
        res.json({ "values": currentStatusValues, "config": CONFIG, "status": SWITCH_STATUS });
    } catch (err) {
        error(err);
        res.status(500).send(err.message);
    }
});

ws.get('/switchStatus', async (req, res) => {
    try {
        const result = await hrc.switch0.get();
        res.json({ "Result": result });
    } catch (err) {
        error(err);
        res.status(500).send(err.message);
    }
});

ws.post('/reset', async (req, res) => {
    try {
        await hrc.update();
        res.send();
    } catch (err) {
        error(err);
        res.status(500).send(err.message);
    }
});

ws.post('/on', async (req, res) => {
    try {
        await hrc.setNewSwitchStatus(SWITCH_STATUS.ON_MANUALLY);
        res.send();
    } catch (err) {
        error(err);
        res.status(500).send(err.message);
    }
});

ws.post('/off', async (req, res) => {
    try {
        await hrc.setNewSwitchStatus(SWITCH_STATUS.OFF_MANUALLY);
        res.send();
    } catch (err) {
        error(err);
        res.status(500).send(err.message);
    }
});

ws.listen(port, () => {
    log(`Heatingrod webserver is listening on port ${port}`);
    // Start the control loop
    hrc.start();
});
