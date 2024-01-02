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
const CONFIG = require('./config').CONFIG
const SWITCH_STATUS = require('./switchstatus').SWITCH_STATUS
const ShellySwitch = require('./shellyswitch')
const dataProvider = require('./influxdataprovider')

console.log(new Date(), "CONFIG: ", CONFIG)

let switch0 = ShellySwitch.getSwitch(0, CONFIG.switch0Host);

// holds the handle for the recurring timer to clear it when new one is scheduled
let executionTimer;

/**
 *  this is the entry point  which calls the switch status change
 */
function update() {
    switch0.get(function(switchOn) {
        dataProvider.getCurrentStatusValues(function(currentStatusValues) {
            currentStatusValues.switchOn = switchOn;
            let switchStatus = determineNewSwitchStatus(currentStatusValues);
            setNewSwitchStatus(switchStatus);
        });
    });
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
 * @param {Object} CurrentStatusValues
 * @returns The SWITCH_STATUS which was determined due to the passed values
 */
function determineNewSwitchStatus(currentStatusValues) {
    console.log(new Date(), "Determine switch status with: ", currentStatusValues)
    
    if(currentStatusValues.boilerStatus && currentStatusValues.boilerStatus !== 0) {
        return SWITCH_STATUS.OFF_PRIMARY_SOURCE_ACTIVE;
    }
    
    if (!isWithinNormalOperatingHours()) {
        return SWITCH_STATUS.OFF_NIGHT;
    }

    // check water temperature
    if (currentStatusValues.currentWaterTemperature !== null) {
        if (isWaterTemperatureToHigh(currentStatusValues, CONFIG.maxWaterTemperature, CONFIG.maxWaterTemperatureDelta)) {
            return SWITCH_STATUS.OFF_HIGH_TEMPERATURE;
        }

        // turn on if water is too cold
        if (currentStatusValues.currentWaterTemperature <= CONFIG.minWaterTemperature) {
            return SWITCH_STATUS.ON_LOW_TEMPERATURE;
        }
    }

    // turn on if no information about energy production is available only within fallback operation hours
    if ((currentStatusValues.wattGridUsageMean === null || currentStatusValues.wattGridUsageLast === null)) {
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
    if (currentStatusValues.wattGridUsageLast < CONFIG.wattThresholdToSwitchOff && currentStatusValues.switchOn && 
            Math.abs(currentStatusValues.wattGridUsageLast) >= CONFIG.wattThresholdToSwitchOff) {
        // as long some energy is feed in keep it on
        return onStatusFunction(currentStatusValues);
    } else if (currentStatusValues.wattGridUsageLast < CONFIG.wattThresholdToSwitchOff && !currentStatusValues.switchOn &&
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
    if (currentStatusValues.forecast && currentStatusValues.forecast.value && currentStatusValues.forecast.time &&
        currentStatusValues.forecast.value <= CONFIG.wattThresholdToSwitchOn && 
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

module.exports = {update, determineNewSwitchStatus, setNewSwitchStatus, switch0}
