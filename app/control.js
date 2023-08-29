if (process.env.DRY_RUN) {
    DRY_RUN = (process.env.DRY_RUN.toLowerCase() === "true");
}

if (typeof DRY_RUN === 'undefined') {
    DRY_RUN = false;
}

// timer disabling can only be done within a dry run
RUN_WITH_TIMER = true;
if (DRY_RUN) {
    if (process.env.RUN_WITH_TIMER) {
        RUN_WITH_TIMER = (process.env.RUN_WITH_TIMER.toLowerCase() === "true");
    } else {
        RUN_WITH_TIMER = false;
    }
    console.log(new Date(), "Executing dry run with timers " + (RUN_WITH_TIMER ? "enabled": "disabled"));
}

const axios = require('axios');

const MINUTE = 1000*60;
const CONFIG = {
    wattThresholdToSwitchOn: Number(process.env.WATT_THRESHOLD_TO_SWITCH_ON) || 3000,
    wattThresholdToSwitchOff: Number(process.env.WATT_THRESHOLD_TO_SWITCH_OFF) || 0,
    minWaterTemperature: Number(process.env.MIN_WATER_TEMPERATURE) || 40,
    maxWaterTemperature: Number(process.env.MAX_WATER_TEMPERATURE) || 70,
    maxWaterTemperatureFallback: Number(process.env.MAX_WATER_TEMPERATURE_FALLBACK) || 60,
    maxWaterTemperatureDelta: Number(process.env.MAX_WATER_TEMPERATURE_DELTA) || 5,
    // the time span which normal operation is permitted
    startHour: Number(process.env.START_HOUR) || 6,
    endHour: Number(process.env.END_HOUR) || 19,

    // the time span which fallback operation is permitted
    startHourFallback: Number(process.env.START_HOUR_FALLBACK) || 13,
    endHourFallback: Number(process.env.END_HOUR_FALLBACK) || 17,

    // INFLUX host and tokens
    influxHost: process.env.INFLUX_HOST || "tig",
    influxBaseUrl: process.env.INFLUX_BASE_URL || "http://tig:8086",
    influxToken: process.env.INFLUX_TOKEN,

    // shelly switch
    switch0Host: process.env.SWITCH0_HOST || "heatingrod.localdomain",

    // timer periods are given in milliseconds
    timerPeriodOnFallback: Number(process.env.TIMER_PERIOD_ON_FALLBACK) || MINUTE / 2,
    timerPeriodOnLowTemperature: Number(process.env.TIMER_PERIOD_ON_LOW_TEMPERATURE) || 30 * MINUTE,
    timerPeriodOnEnergy: Number(process.env.TIMER_PERIOD_ON_ENERGY) || MINUTE / 2,
    timerPeriodOffLowEnergy: Number(process.env.TIMER_PERIOD_OFF_LOW_ENERGY) || 10 * MINUTE,
    timerPeriodOffHighTemperature: Number(process.env.TIMER_PERIOD_OFF_HIGH_TEMPERATURE) || 10 * MINUTE,
    timerPeriodOffNight: Number(process.env.TIMER_PERIOD_OFF_NIGHT) || 60 * MINUTE,
    timerPeriodManually: Number(process.env.TIMER_PERIOD_MANUALLY) || 60 * MINUTE,
    timerPeriodOffFallback: Number(process.env.TIMER_PERIOD_OFF_FALLBACK) || 10 * MINUTE,
};

console.log(new Date(), "CONFIG: ", CONFIG)

const SWITCH_STATUS = {
    ON_FORECAST: {on: true, status: 5, message: "On due to forecast fallback operating mode", timerPeriod: CONFIG.timerPeriodOnFallback},
    ON_FALLBACK: {on: true, status: 4, message: "On due to no value for energy production was available and time within fallback operating hours", timerPeriod: CONFIG.timerPeriodOnFallback},
    ON_MANUALLY: {on: true, status: 3, message: "On due to manual intervention", timerPeriod: CONFIG.timerPeriodManually},
    ON_LOW_TEMPERATURE: {on: true, status: 2, message: "On due to low water temperature", timerPeriod: CONFIG.timerPeriodOnLowTemperature},
    ON_ENERGY: {on: true, status: 1, message: "On due to excess energy", timerPeriod: CONFIG.timerPeriodOnEnergy},
    OFF_LOW_ENERGY: {on: false, status: 0, message: "Off due to not enough energy production", timerPeriod: CONFIG.timerPeriodOffLowEnergy},
    OFF_HIGH_TEMPERATURE: {on: false, status: -1, message: "Off due to high water temperature", timerPeriod: CONFIG.timerPeriodOffHighTemperature},
    OFF_NIGHT: {on: false, status: -2, message: "Off due time outside normal operation hours", timerPeriod: CONFIG.timerPeriodOffNight},
    OFF_MANUALLY: {on: false, status: -3, message: "Off due to manual intervention", timerPeriod: CONFIG.timerPeriodManually},
    OFF_FALLBACK: {on: false, status: -4, message: "Off due to no value for energy production was available and time outside fallback operating hours", timerPeriod: CONFIG.timerPeriodOffFallback},
    OFF_FORECAST: {on: false, status: -5, message: "Off due to too low energy production within the forecast fallback operating mode", timerPeriod: CONFIG.timerPeriodOffFallback},
};

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
const INFLUX_REQUEST_HEADER = {"Authorization" : "Token " + CONFIG.influxToken};

const ShellySwitch = {
    turnOn: function () {
        set(true);
    },
    turnOff: function () {
        set(false);
    },
    set: function (on) {
        axios.get("http://" + this.host + "/rpc/Switch.Set?id=" + this.id + "&on=" + on)
        .catch(err => {
            console.log(new Date(), err);
        });
    },
    get: function(callback) {
        // console.log(new Date(), "Getting switch status: http://" + this.host + "/rpc/Switch.GetStatus?id=" + this.id);
        axios.get("http://" + this.host + "/rpc/Switch.GetStatus?id=" + this.id)
        .then(function(result) {callback(result.data === null ? null : result.data.output === true)})
        .catch(err => {
            console.log(new Date(), err);
        });
    },
};

function getSwitch(id, host) {
    let o = Object.create(ShellySwitch);
    o.id = id;
    o.host = host
    return o;
};

let switch0 = getSwitch(0, CONFIG.switch0Host);

// holds the handle for the recurring timer to clear it when new one is scheduled
let executionTimer;

/**
 *  this is the entry point  which calls the switch status change
 */
function update() {
    switch0.get(function(switchOn) {
        axios.all([
            axios.get(INFLUX_GRID_USAGE_LAST, {headers: INFLUX_REQUEST_HEADER}),
            axios.get(INFLUX_GRID_USAGE_MEAN, {headers: INFLUX_REQUEST_HEADER}),
            axios.get(INFLUX_WATER_TEMPERATURE_LAST, {headers: INFLUX_REQUEST_HEADER}),
            axios.get(INFLUX_FORECAST_PRODUCTION_LAST(), {headers: INFLUX_REQUEST_HEADER}),
        ]).then(
            axios.spread((gridLastRes, gridMeanRes, waterTemperatureRes, forecastRes) => {
            let gridUsageLast = getValue(gridLastRes.data);
            let gridUsageMean = getValue(gridMeanRes.data);
            let waterTemperature = getValue(waterTemperatureRes.data);
            let forecast = {value: getValue(forecastRes.data), time: getTimestamp(forecastRes.data) }
            let switchStatus = determineNewSwitchStatus(gridUsageMean, gridUsageLast, waterTemperature, switchOn, forecast);
            setNewSwitchStatus(switchStatus);
        })).catch(err => {
            console.log(new Date(), err);
        });
    });
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

/**
 * Sets a new interval timer and clears the old one
 * @param {SWITCH_STATUS} switchStatus the new status of the switch which holds also the delay for the interval timer
 */
function updateTimer(switchStatus) {
    if (!RUN_WITH_TIMER) {
        console.log(new Date(), "Dry run. not setting any timers")
        return;
    }
    if (executionTimer) {
        clearInterval(executionTimer);
    }
    executionTimer = setInterval(update, switchStatus.timerPeriod);
}

/**
 * Calls remote function to switch on/off switch
 * @param {SWITCH_STATUS} switchStatus the new status of the switch which holds also the new swicht postion
 */
function setSwitch(switchStatus) {
    if (DRY_RUN) {
        console.log(new Date(), "Dry run. not setting switch status", switchStatus)
        return;
    }
    console.log(new Date(), "New switchs status: " , switchStatus);
    switch0.set(switchStatus.on);
}

/**
 * Sends a status update to telegraf to write it into influx db
 * @param {SWITCH_STATUS} switchStatus the new status of the switch which is transmitted as json to influx db
 */
function sendStatusChange(switchStatus) {
    if(DRY_RUN) {
        console.log(new Date(), "Dry run. not sending status change", switchStatus);
        return;
    }

    axios.post(`http://${CONFIG.influxHost}:9001/telegraf`, switchStatus)
    .catch(err => {
        console.log(new Date(), err);
    });
}

/**
 * Sends a status update to telegraf to write it into influx db
 * @param {SWITCH_STATUS} switchStatus the new status to be set
 */
function setNewSwitchStatus(switchStatus) {
    sendStatusChange(switchStatus);
    setSwitch(switchStatus);
    updateTimer(switchStatus);
}

/**
 * 
 * @param {Number} wattGridUsageMean If null ON_FALLBACK will be activated durring day hours
 * @param {Number} wattGridUsageLast If null ON_FALLBACK will be activated durring day hours
 * @param {Number} currentWaterTemperature If null temperature dependency operation is deactivated only energy production would be taken in consideration
 * @param {boolean} switchOn 
 * @param {Object} the object which contains forecasted watts and the timestamp when this should occurr
 * @returns The SWITCH_STATUS which was determined due to the passed values
 */
function determineNewSwitchStatus(wattGridUsageMean, wattGridUsageLast, currentWaterTemperature, switchOn, forecast) {
    console.log(new Date(), `Determine switch status with grid usage (mean / last) ${wattGridUsageMean} W / ${wattGridUsageLast} W, water temperature ${currentWaterTemperature} °C, ` + (switchOn ? " switch on " : " switch off ") + "and forecast " + (forecast ? `${forecast.value} W at ${forecast.time}` : "null"));
    if (!isWithinNormalOperatingHours()) {
        return SWITCH_STATUS.OFF_NIGHT;
    }

    let currentStatusValues = {
        wattGridUsageMean: wattGridUsageMean,
        wattGridUsageLast: wattGridUsageLast,
        currentWaterTemperature: currentWaterTemperature,
        switchOn: switchOn,
        forecast: forecast,
    }

    // check water temperature
    if (currentWaterTemperature !== null) {
        if (isWaterTemperatureToHigh(currentStatusValues, CONFIG.maxWaterTemperature, CONFIG.maxWaterTemperatureDelta)) {
            return SWITCH_STATUS.OFF_HIGH_TEMPERATURE;
        }

        // turn on if water is too cold
        if (currentWaterTemperature <= CONFIG.minWaterTemperature) {
            return SWITCH_STATUS.ON_LOW_TEMPERATURE;
        }
    }

    // turn on if no information about energy production is available only within fallback operation hours
    if ((wattGridUsageMean === null || wattGridUsageLast === null)) {
        if (isWithinFallbackOperatingHours() && !isWaterTemperatureToHigh(currentStatusValues, CONFIG.maxWaterTemperatureFallback , CONFIG.maxWaterTemperatureDelta)) {
            return SWITCH_STATUS.ON_FALLBACK;
        } else {
            return SWITCH_STATUS.OFF_FALLBACK;
        }
    }

    // determinSwitchStatusByGridUsage calls the determineNewSwitchStatusByForecast for off status
    return determinSwitchStatusByGridUsage(currentStatusValues, function(){return SWITCH_STATUS.ON_ENERGY}, determineNewSwitchStatusByForecast);
}

/**
 * 
 * @param {Object} currentStatusValues
 * @param {Function} onStatusFunction a function which returns the switch status for on
 * @param {Function} offStatusFunction a function which returns the switch status for off
 * @returns The SWITCH_STATUS which was determined due to the passed values
 */
function determinSwitchStatusByGridUsage(currentStatusValues, onStatusFunction, offStatusFunction) {
    // check if enough solar power is available
    //console.log(new Date(), "Current status values", currentStatusValues)
    if (currentStatusValues.wattGridUsageLast < 0 && currentStatusValues.switchOn && 
            Math.abs(currentStatusValues.wattGridUsageLast) >= CONFIG.wattThresholdToSwitchOff) {
        // as long some energy is feed in keep it on
        return onStatusFunction(currentStatusValues);
    } else if (currentStatusValues.wattGridUsageLast < 0 && !currentStatusValues.switchOn &&
                Math.abs(currentStatusValues.wattGridUsageLast) >= CONFIG.wattThresholdToSwitchOn &&
                Math.abs(currentStatusValues.wattGridUsageMean) >= CONFIG.wattThresholdToSwitchOn) {
        // feed in power exceeds watt threshold
        return onStatusFunction(currentStatusValues);
    } else {
        return offStatusFunction(currentStatusValues);
    }
}

/**
 * The off status function to determine status by forecast in a second step
 * @param {Object} currentStatusValues
 * @returns The SWITCH_STATUS which was determined due to the passed values
 */
function determineNewSwitchStatusByForecast(currentStatusValues) {
    // check the forecast also take in cosideration current usage off net and a lower max watertemperature
    if (currentStatusValues.forecast && currentStatusValues.forecast.value <= CONFIG.wattThresholdToSwitchOn && 
        !isWaterTemperatureToHigh(currentStatusValues, CONFIG.maxWaterTemperatureFallback , CONFIG.maxWaterTemperatureDelta) &&
        isWithinOperatingHours(Math.min(currentStatusValues.forecast.time.getHours(), CONFIG.startHourFallback), CONFIG.endHourFallback)) {
        // shift the zero point to match the energy consumption of appliance
        currentStatusValues.wattGridUsageMean -= CONFIG.wattThresholdToSwitchOn
        currentStatusValues.wattGridUsageLast -= CONFIG.wattThresholdToSwitchOn
        return determinSwitchStatusByGridUsage(currentStatusValues, function(){return SWITCH_STATUS.ON_FORECAST}, function(){return SWITCH_STATUS.OFF_FORECAST});
    } else {
        return SWITCH_STATUS.OFF_LOW_ENERGY;
    }
}

/**
 * Checks if current water temperature is to high also implements temperature delta logic
 * @param {Object} currentStatusValues 
 * @param {Number} maxWaterTemperature 
 * @param {Number} maxWaterTemperatureDelta 
 * @returns 
 */
function isWaterTemperatureToHigh(currentStatusValues, maxWaterTemperature, maxWaterTemperatureDelta) {
    if (currentStatusValues.currentWaterTemperature === null) {
        return false;
    }

    // turn off if maxWaterTemperature is reached
    if (currentStatusValues.switchOn && currentStatusValues.currentWaterTemperature >= maxWaterTemperature) {
        return true
    } 

    // keep turned off till the water cooled down by by maxWaterTemperatureDelta
    if (!currentStatusValues.switchOn && currentStatusValues.currentWaterTemperature >= maxWaterTemperature - maxWaterTemperatureDelta) {
        return true
    }

    return false;
}

/**
 * @param {Number} startHour The number which represents the hour of the day where timeframe starts (inclusive)
 * @param {Number} endHour The number which represents the hour of the day where timeframe ends (exclusive)
 * @returns Returns true if current hour between the passed hours else false
 */
function isWithinOperatingHours(startHour, endHour) {
    const now = new Date();
    const currentHour = now.getHours();
    //console.log(new Date(), {currentHour: currentHour, config: CONFIG});
    return currentHour >= startHour && currentHour < endHour;
}

/**
 * 
 * @returns true if current hour is between CONFIG.startHour and CONFIG.endHour
 */
function isWithinNormalOperatingHours() {
    return isWithinOperatingHours(CONFIG.startHour, CONFIG.endHour);
}

/**
 * 
 * @returns true if current hour is between CONFIG.startHourFallback and CONFIG.endHourFallback
 */
function isWithinFallbackOperatingHours() {
    return isWithinOperatingHours(CONFIG.startHourFallback, CONFIG.endHourFallback);
}

if (RUN_WITH_TIMER) {
    console.log(new Date(), "starting the initial loop")
    setImmediate(update);
} else {
    console.log(new Date(), "Dry run. not starting initial loop");
}


module.exports = {update, determineNewSwitchStatus, setNewSwitchStatus, CONFIG, SWITCH_STATUS, switch0}
