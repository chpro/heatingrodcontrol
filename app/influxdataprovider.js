const axios = require('axios');
const { CONFIG } = require('./config');
const { log, error } = require('./logger');

const INFLUX_REQUEST_HEADER = { "Authorization": "Token " + CONFIG.influxToken };

/**
 * Helper to safely extract a value from InfluxDB query result
 */
function getValue(result) {
    if (result === null) {
        log("Could not get value from null result");
        return null;
    }
    try {
        if (result.results && result.results[0] && result.results[0].series && result.results[0].series[0]) {
            return result.results[0].series[0].values[0][1];
        }
        return null;
    } catch (err) {
        log("Could not get value from JSON", result);
        return null;
    }
}

function transformWattpilotResponse(response) {
    let retVal = { power: 0 };
    // parse wattpilot_power{host="wattpilot.localdomain",serial="91036822"} 0 1718021949741
    const regex = /^ *wattpilot_power\{.*\} ([0-9\.]*) .*$/gm;
    const res = regex.exec(response);
    if (res !== null && res[1]) {
        retVal.power = Number(res[1]);
    }
    return retVal;
}

function useNull(err) {
    log("Could not get response", err.message || err);
    return { data: null };
}

async function getCurrentStatusValues(switchOn) {
    const queries = [
        // Water Temp Last
        axios.get(`${CONFIG.influxBaseUrl}/query?pretty=true&db=prometheus&q=SELECT last("value") FROM "autogen"."eta_buffer_temperature_sensor_top_celsius" WHERE time >= now() - 5m and time <= now()`, { headers: INFLUX_REQUEST_HEADER }).catch(useNull),
        // Grid Usage Last
        axios.get(`${CONFIG.influxBaseUrl}/query?pretty=true&db=inverter&q=SELECT last("P_Grid") FROM "autogen"."powerflow" WHERE time >= now() - 5m and time <= now()`, { headers: INFLUX_REQUEST_HEADER }).catch(useNull),
        // Grid Usage Mean
        axios.get(`${CONFIG.influxBaseUrl}/query?pretty=true&db=inverter&q=SELECT mean("P_Grid") FROM "autogen"."powerflow" WHERE time >= now() - 10m and time <= now()`, { headers: INFLUX_REQUEST_HEADER }).catch(useNull),
        // Boiler Status
        axios.get(`${CONFIG.influxBaseUrl}/query?pretty=true&db=prometheus&q=SELECT last("value") FROM "eta_boiler_status"`, { headers: INFLUX_REQUEST_HEADER }).catch(useNull),
        // Battery Charge Last
        axios.get(`${CONFIG.influxBaseUrl}/query?pretty=true&db=inverter&q=SELECT last("StateOfCharge_Relative") FROM "autogen"."storage"`, { headers: INFLUX_REQUEST_HEADER }).catch(useNull),
        // Inverter Power Flow
        axios.get(CONFIG.inverterPowerFlowUrl).catch(useNull),
        // Wattpilot
        axios.get(CONFIG.wattpilotMetricsUrl, { transformResponse: transformWattpilotResponse }).catch(useNull)
    ];

    try {
        const [
            waterTemperatureRes,
            gridLastRes,
            gridMeanRes,
            boilerStatusRes,
            batteryChargeRes,
            inverterPowerFlowRes,
            wattpilotRes
        ] = await Promise.all(queries);

        return getStatusValues(
            getValue(gridMeanRes.data),
            getValue(gridLastRes.data),
            getValue(waterTemperatureRes.data),
            switchOn,
            getValue(boilerStatusRes.data),
            getValue(batteryChargeRes.data),
            inverterPowerFlowRes.data === null ? null : inverterPowerFlowRes.data.Body.Data.Site,
            wattpilotRes.data
        );
    } catch (err) {
        error(err);
        return processStatusValues(null);
    }
}

function getStatusValues(wattGridUsageMean = null, wattGridUsageLast = null, currentWaterTemperature = null, switchOn = null, boilerStatus = null, batteryCharge = null, inverterPowerFlow = null, wattpilot = { power: 0 }) {
    let o = {
        wattGridUsageMean,
        wattGridUsageLast,
        currentWaterTemperature,
        switchOn,
        boilerStatus,
        batteryCharge,
        inverterPowerFlow,
        wattpilot
    };
    log("Raw status values: ", o);
    return processStatusValues(o);
}

function processStatusValues(currentStatusValues) {
    let statusValues = {};

    if (currentStatusValues === null) {
        statusValues.gridEnergy = null;
        statusValues.primarySourceActive = false;
        statusValues.currentWaterTemperature = null;
        statusValues.availableEnergy = null;
        return statusValues;
    }

    statusValues.gridEnergy = 0;
    statusValues.availableEnergy = null; // fallback is enabled
    statusValues.switchOn = currentStatusValues.switchOn;
    statusValues.batteryCharge = currentStatusValues.batteryCharge;

    var wattGridUsage = null;
    if (currentStatusValues.inverterPowerFlow !== null) {
        // the usage is calculated without power flow to battery and wattpilot usage
        var offset = currentStatusValues.currentWaterTemperature >= CONFIG.maxWaterTemperatureFallback ? 0 : currentStatusValues.wattpilot.power;
        log("WattGridUsage is calculated from inverterPowerFlow and offset ", offset);
        wattGridUsage = (currentStatusValues.inverterPowerFlow.P_PV + offset - Math.abs(currentStatusValues.inverterPowerFlow.P_Load)) * -1;
    } else {
        // fallback and also used for test cases
        log("WattGridUsage is calculated from wattGridUsageMean/Max");
        wattGridUsage = currentStatusValues.switchOn ? currentStatusValues.wattGridUsageLast : Math.max(currentStatusValues.wattGridUsageMean, currentStatusValues.wattGridUsageLast);
    }

    // apply offsets and map grid usage to range unsigned int
    if (currentStatusValues.wattGridUsageMean === null || currentStatusValues.wattGridUsageLast === null) {
        // we got no information about grid usage fallback will be applied
        statusValues.availableEnergy = null;
    } else if (wattGridUsage >= 0 && wattGridUsage <= CONFIG.wattZeroGridUsageOffset) {
        // offset is applied to consumed energy
        statusValues.availableEnergy = CONFIG.wattZeroGridUsageOffset;
    } else if (wattGridUsage >= 0) {
        // consume energy from grid
        statusValues.availableEnergy = 0;
        statusValues.gridEnergy = wattGridUsage;
    } else {
        // as long as engergy usage is within defined limits (feed in or maybe low consumption) pass 0 for consumation and positve value for feed-in
        statusValues.availableEnergy = Math.abs(wattGridUsage);
    }

    statusValues.primarySourceActive = CONFIG.offWhenPrimarySourceActive && currentStatusValues.boilerStatus && currentStatusValues.boilerStatus !== 0;
    statusValues.currentWaterTemperature = currentStatusValues.currentWaterTemperature;
    return statusValues;
}

module.exports = { getCurrentStatusValues, getStatusValues };
