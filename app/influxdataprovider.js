const axios = require('axios');
const CONFIG = require('./config').CONFIG


const INFLUX_WATER_TEMPERATURE_LAST = `${CONFIG.influxBaseUrl}/query?pretty=true&db=prometheus&q=SELECT last("value") FROM "autogen"."eta_buffer_temperature_sensor_top_celsius" WHERE time >= now() - 5m and time <= now()`;
const INFLUX_GRID_USAGE_LAST = `${CONFIG.influxBaseUrl}/query?pretty=true&db=inverter&q=SELECT last("P_Grid") FROM "autogen"."powerflow" WHERE time >= now() - 5m and time <= now()`;
const INFLUX_GRID_USAGE_MEAN = `${CONFIG.influxBaseUrl}/query?pretty=true&db=inverter&q=SELECT mean("P_Grid") FROM "autogen"."powerflow" WHERE time >= now() - 10m and time <= now()`;
const INFLUX_BOILER_STATUS = `${CONFIG.influxBaseUrl}/query?pretty=true&db=prometheus&q=SELECT last("value") FROM "eta_boiler_status"`;
const INFLUX_BATTERY_CHARGE_LAST = `${CONFIG.influxBaseUrl}/query?pretty=true&db=inverter&q=SELECT last("StateOfCharge_Relative") FROM "autogen"."storage"`;
const INVERTER_POWER_FLOW = CONFIG.inverterPowerFlowUrl


const INFLUX_REQUEST_HEADER = {"Authorization" : "Token " + CONFIG.influxToken};

/**
 * 
 * @param {JSON} result The json where to get value from 
 * @returns The value which should be a number or null if an error occurs
 */
function getValue(result) {
    if (result === null) {
        console.log(new Date(), "Could not get value from null result")
        return null;
    }
    try {
        return result.results[0].series[0].values[0][1];
    } catch (error) {
        console.log(new Date(), "Could not get value from JSON", result);
        return null;
    }
}

function transformWattpilotResponse(response) {
    var retVal = {power: 0}
    // parse wattpilot_power{host="wattpilot.localdomain",serial="91036822"} 0 1718021949741
    var regex = /^ *wattpilot_power\{.*\} ([0-9\.]*) .*$/gm;
    var res = regex.exec(response)
    if (res !==  null && res[1]) {
        retVal.power = Number(res[1])
    }
    return retVal;
}

function useNull(error) {
    console.log(new Date(), "Could not get response", error);
    return {data: null};
}

function getCurrentStatusValues(switchOn, callback) {
    axios.all([
        axios.get(INFLUX_GRID_USAGE_LAST, {headers: INFLUX_REQUEST_HEADER}).catch(useNull),
        axios.get(INFLUX_GRID_USAGE_MEAN, {headers: INFLUX_REQUEST_HEADER}).catch(useNull),
        axios.get(INFLUX_WATER_TEMPERATURE_LAST, {headers: INFLUX_REQUEST_HEADER}).catch(useNull),
        axios.get(INFLUX_BOILER_STATUS, {headers: INFLUX_REQUEST_HEADER}).catch(useNull),
        axios.get(INFLUX_BATTERY_CHARGE_LAST, {headers: INFLUX_REQUEST_HEADER}).catch(useNull),
        axios.get(INVERTER_POWER_FLOW).catch(useNull),
        axios.get(CONFIG.wattpilotMetricsUrl, {transformResponse: transformWattpilotResponse}).catch(useNull)
    ]).then(axios.spread((gridLastRes, gridMeanRes, waterTemperatureRes, boilerStatusRes, batteryChargeRes, inverterPowerFlowRes, wattpilotRes) => {
        callback(getStatusValues(
                    getValue(gridMeanRes.data),
                    getValue(gridLastRes.data),
                    getValue(waterTemperatureRes.data),
                    switchOn,
                    getValue(boilerStatusRes.data),
                    getValue(batteryChargeRes.data),
                    inverterPowerFlowRes.data === null ? null : inverterPowerFlowRes.data.site,
                    wattpilotRes.data));
    })).catch(err => {
        console.log(new Date(), err);
        callback(processStatusValues(null));
    });
}

function getStatusValues(wattGridUsageMean = null, wattGridUsageLast = null, currentWaterTemperature = null, switchOn = null, boilerStatus = null, batteryCharge = null, inverterPowerFlow = null, wattpilot = {power: 0}) {
    let o = {};
    o.wattGridUsageMean = wattGridUsageMean;
    o.wattGridUsageLast = wattGridUsageLast;
    o.currentWaterTemperature = currentWaterTemperature;
    o.switchOn = switchOn;
    o.boilerStatus = boilerStatus;
    o.batteryCharge = batteryCharge
    o.inverterPowerFlow = inverterPowerFlow
    o.wattpilot = wattpilot
    console.log(new Date(), "Raw status values: ", o)
    return processStatusValues(o);
}

function processStatusValues(currentStatusValues) {
    let statusValues = {}

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

    var wattGridUsage = null
    if (currentStatusValues.inverterPowerFlow !== null) {
        // the usage is calculated without power flow to battery and wattpilot usage
        var offset = currentStatusValues.currentWaterTemperature >= CONFIG.maxWaterTemperatureFallback ? 0 : currentStatusValues.wattpilot.power;
        console.log(new Date(), "WattGridUsage is calculated from inverterPowerFlow and offset ", offset);
        wattGridUsage = (currentStatusValues.inverterPowerFlow.P_PV + offset - Math.abs(currentStatusValues.inverterPowerFlow.P_Load)) * -1
    } else {// fallback and also used for test cases
        console.log(new Date(), "WattGridUsage is calculated from wattGridUsageMean/Max");
        wattGridUsage = currentStatusValues.switchOn ? currentStatusValues.wattGridUsageLast : Math.max(currentStatusValues.wattGridUsageMean, currentStatusValues.wattGridUsageLast);
    }

    // apply offsets and map grid usage to range unsigned int
    if (currentStatusValues.wattGridUsageMean === null || currentStatusValues.wattGridUsageLast === null) {
        // we got no information about grid usage fallback will be applied
        statusValues.availableEnergy = null;
    } else if (wattGridUsage >= 0 && wattGridUsage <= CONFIG.wattZeroGridUsageOffset) { // offset is applied to consumed energy
        statusValues.availableEnergy = CONFIG.wattZeroGridUsageOffset;
    } else if (wattGridUsage >= 0) { // consume energy from grid
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

module.exports = {getCurrentStatusValues, getStatusValues}