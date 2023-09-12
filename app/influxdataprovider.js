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

const INFLUX_REQUEST_HEADER = {"Authorization" : "Token " + CONFIG.influxToken};

const CurrentStatusValues = {
    wattGridUsageMean: null,
    wattGridUsageLast: null,
    currentWaterTemperature: null,
    switchOn: false,
    boilerStatus: null,
    forecast: null,
}

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

function getCurrentStatusValues(callback) {
    let o = Object.create(CurrentStatusValues);
    axios.all([
        axios.get(INFLUX_GRID_USAGE_LAST, {headers: INFLUX_REQUEST_HEADER}),
        axios.get(INFLUX_GRID_USAGE_MEAN, {headers: INFLUX_REQUEST_HEADER}),
        axios.get(INFLUX_WATER_TEMPERATURE_LAST, {headers: INFLUX_REQUEST_HEADER}),
        axios.get(INFLUX_FORECAST_PRODUCTION_LAST(), {headers: INFLUX_REQUEST_HEADER}),
        axios.get(INFLUX_BOILER_STATUS, {headers: INFLUX_REQUEST_HEADER}),
    ]).then(axios.spread((gridLastRes, gridMeanRes, waterTemperatureRes, forecastRes, boilerStatusRes) => {
        o.wattGridUsageLast = getValue(gridLastRes.data);
        o.wattGridUsageMean = getValue(gridMeanRes.data);
        o.currentWaterTemperature = getValue(waterTemperatureRes.data);
        o.boilerStatus = getValue(boilerStatusRes.data);
        o.forecast = {value: getValue(forecastRes.data), time: getTimestamp(forecastRes.data)},
        callback(o);
    })).catch(err => {
        console.log(new Date(), err);
        callback(o);
    });
}

function getStatusValues(wattGridUsageMean = null, wattGridUsageLast = null, currentWaterTemperature = null, switchOn = null, forecastValue = null, forecastTime = null, boilerStatus = null) {
    let o = Object.create(CurrentStatusValues);
    o.wattGridUsageMean = wattGridUsageMean;
    o.wattGridUsageLast = wattGridUsageLast;
    o.currentWaterTemperature = currentWaterTemperature;
    o.switchOn = switchOn;
    o.boilerStatus = boilerStatus;
    o.forecast = {value: forecastValue, time: forecastTime}
    return o;
}

module.exports = {getCurrentStatusValues, getStatusValues}