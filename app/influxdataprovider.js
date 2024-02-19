const axios = require('axios');
const CONFIG = require('./config').CONFIG


const INFLUX_FORECAST_PRODUCTION_LAST = function() {
    let start = new Date();
    start.setHours(0,0,0,0);
    let end = new Date();
    end.setHours(23, 59, 59, 999)
    return `${CONFIG.influxBaseUrl}/query?pretty=true&db=pvforecast&q=SELECT max("value") FROM "autogen"."pv_forecast_watts" WHERE time >= '${start.toISOString()}' and time <= '${end.toISOString()}'`
}
const INFLUX_WATER_TEMPERATURE_LAST = `${CONFIG.influxBaseUrl}/query?pretty=true&db=prometheus&q=SELECT last("value") FROM "autogen"."eta_buffer_temperature_sensor_top_celsius" WHERE time >= now() - 5m and time <= now()`;
const INFLUX_GRID_USAGE_LAST = `${CONFIG.influxBaseUrl}/query?pretty=true&db=inverter&q=SELECT last("P_Grid") FROM "autogen"."powerflow" WHERE time >= now() - 5m and time <= now()`;
const INFLUX_GRID_USAGE_MEAN = `${CONFIG.influxBaseUrl}/query?pretty=true&db=inverter&q=SELECT mean("P_Grid") FROM "autogen"."powerflow" WHERE time >= now() - 10m and time <= now()`;
const INFLUX_BOILER_STATUS = `${CONFIG.influxBaseUrl}/query?pretty=true&db=prometheus&q=SELECT last("value") FROM "eta_boiler_status"`;
const INFLUX_BATTERY_CHARGE_LAST = `${CONFIG.influxBaseUrl}/query?pretty=true&db=inverter&q=SELECT last("StateOfCharge_Relative") FROM "autogen"."storage"`;



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

/**
 * 
 * @param {JSON} result The json where to get timestamp from 
 * @returns The parsed timestamp which should be a Date or null if an error occurs
 */
function getTimestamp(result) {
    if (result === null) {
        console.log(new Date(), "Could not get timestamp from null result")
        return null;
    }
    try {
        return new Date(result.results[0].series[0].values[0][0]);
    } catch (error) {
        console.log(new Date(), "Could not get timestamp from JSON", result);
        return null;
    }
}

function getCurrentStatusValues(switchOn, callback) {
    axios.all([
        axios.get(INFLUX_GRID_USAGE_LAST, {headers: INFLUX_REQUEST_HEADER}),
        axios.get(INFLUX_GRID_USAGE_MEAN, {headers: INFLUX_REQUEST_HEADER}),
        axios.get(INFLUX_WATER_TEMPERATURE_LAST, {headers: INFLUX_REQUEST_HEADER}),
        axios.get(INFLUX_FORECAST_PRODUCTION_LAST(), {headers: INFLUX_REQUEST_HEADER}),
        axios.get(INFLUX_BOILER_STATUS, {headers: INFLUX_REQUEST_HEADER}),
        axios.get(INFLUX_BATTERY_CHARGE_LAST, {headers: INFLUX_REQUEST_HEADER}),
    ]).then(axios.spread((gridLastRes, gridMeanRes, waterTemperatureRes, forecastRes, boilerStatusRes, batteryChargeRes) => {
        callback(getStatusValues(
                    getValue(gridMeanRes.data),
                    getValue(gridLastRes.data),
                    getValue(waterTemperatureRes.data),
                    switchOn,
                    getValue(forecastRes.data),
                    getTimestamp(forecastRes.data),
                    getValue(boilerStatusRes.data),
                    getValue(batteryChargeRes.data)));
    })).catch(err => {
        console.log(new Date(), err);
        callback(processStatusValues(null));
    });
}

function getStatusValues(wattGridUsageMean = null, wattGridUsageLast = null, currentWaterTemperature = null, switchOn = null, forecastValue = null, forecastTime = null, boilerStatus = null, batteryCharge = null) {
    let o = {};
    o.wattGridUsageMean = wattGridUsageMean;
    o.wattGridUsageLast = wattGridUsageLast;
    o.currentWaterTemperature = currentWaterTemperature;
    o.switchOn = switchOn;
    o.boilerStatus = boilerStatus;
    o.forecast = {value: forecastValue, time: forecastTime}
    o.batteryCharge = batteryCharge
    console.log(new Date(), "Raw status values: ", o)
    return processStatusValues(o);
}

function processStatusValues(currentStatusValues) {
    let statusValues = {}

    if (currentStatusValues === null) {
        statusValues.gridEnergy = null;
        statusValues.primarySourceActive = false;
        statusValues.forecast = null;
        statusValues.currentWaterTemperature = null;
        statusValues.availableEnergy = null;
        return statusValues;
    }

    statusValues.gridEnergy = 0;
    statusValues.switchOn = currentStatusValues.switchOn;
    statusValues.batteryCharge = currentStatusValues.batteryCharge;
    let wattGridUsage = currentStatusValues.switchOn ? currentStatusValues.wattGridUsageLast : Math.max(currentStatusValues.wattGridUsageMean, currentStatusValues.wattGridUsageLast);
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
    statusValues.forecast = currentStatusValues.forecast;
    statusValues.currentWaterTemperature = currentStatusValues.currentWaterTemperature;
    return statusValues;
}

module.exports = {getCurrentStatusValues, getStatusValues}