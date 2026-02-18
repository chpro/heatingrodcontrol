const axios = require('axios');
const { CONFIG } = require('./config');
const { SWITCH_STATUS } = require('./switchstatus');
const ShellySwitch = require('./shellyswitch');
const dataProvider = require('./influxdataprovider');
const { log, error } = require('./logger');

const DRY_RUN = process.env.DRY_RUN ? (process.env.DRY_RUN.toLowerCase() === "true") : false;
let RUN_WITH_TIMER = true;

if (DRY_RUN) {
    if (process.env.RUN_WITH_TIMER) {
        RUN_WITH_TIMER = (process.env.RUN_WITH_TIMER.toLowerCase() === "true");
    } else {
        RUN_WITH_TIMER = false;
    }
    log(`Executing dry run with timers ${RUN_WITH_TIMER ? "enabled" : "disabled"}`);
}

log("CONFIG: ", CONFIG);

const switch0 = ShellySwitch.getSwitch(0, CONFIG.switch0Host, CONFIG.switch0ApiVersion);

// holds the handle for the recurring timer to clear it when new one is scheduled
let executionTimer;

/**
 *  this is the entry point which calls the switch status change
 */
async function update() {
    try {
        const switchOn = await switch0.get();
        if (switchOn === null) {
            log("Warning: Could not determine switch status (switchOn is null). Proceeding with null status.");
        }
        const currentStatusValues = await dataProvider.getCurrentStatusValues(switchOn);
        const switchStatus = determineNewSwitchStatus(currentStatusValues);
        await setNewSwitchStatus(switchStatus);
    } catch (err) {
        error("Error during update loop:", err);
    }
}

/**
 * Sets a new interval timer and clears the old one
 * @param {SWITCH_STATUS} switchStatus the new status of the switch which holds also the delay for the interval timer
 */
function updateTimer(switchStatus) {
    if (!RUN_WITH_TIMER) {
        log("Dry run. not setting any timers");
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
async function setSwitch(switchStatus) {
    if (DRY_RUN) {
        log("Dry run. not setting switch status", switchStatus);
        return;
    }
    log("New switch status: ", switchStatus);
    await switch0.set(switchStatus.on);
}

/**
 * Sends a status update to telegraf to write it into influx db
 * @param {SWITCH_STATUS} switchStatus the new status of the switch which is transmitted as json to influx db
 */
async function sendStatusChange(switchStatus) {
    if (DRY_RUN) {
        log("Dry run. not sending status change", switchStatus);
        return;
    }

    if (!CONFIG.influxSendStatus) {
        log("Not sending status change because disabled by config", switchStatus);
        return;
    }
    log("Sending status change");
    try {
        await axios.post(`http://${CONFIG.influxHost}:9001/telegraf`, switchStatus);
    } catch (err) {
        error("Error sending status change to influx:", err.message);
    }
}

/**
 * Sends a status update to telegraf to write it into influx db
 * @param {SWITCH_STATUS} switchStatus the new status to be set
 */
async function setNewSwitchStatus(switchStatus) {
    await sendStatusChange(switchStatus);
    await setSwitch(switchStatus);
    updateTimer(switchStatus);
}

/**
 * 
 * @param {Object} processedStatusValues
 * @returns The SWITCH_STATUS which was determined due to the passed values
 */
function determineNewSwitchStatus(processedStatusValues) {
    log("Determine switch status with processed status values: ", processedStatusValues);

    if (processedStatusValues.primarySourceActive) {
        return SWITCH_STATUS.OFF_PRIMARY_SOURCE_ACTIVE;
    }

    if (!isWithinNormalOperatingHours()) {
        return SWITCH_STATUS.OFF_NIGHT;
    }

    if (processedStatusValues.batteryCharge !== null && processedStatusValues.batteryCharge < CONFIG.minBatteryCharge) {
        return SWITCH_STATUS.OFF_LOW_BATTERY_CHARGE;
    }

    // check water temperature
    if (processedStatusValues.currentWaterTemperature !== null) {
        if (isWaterTemperatureToHigh(processedStatusValues, CONFIG.maxWaterTemperature, CONFIG.maxWaterTemperatureDelta)) {
            return SWITCH_STATUS.OFF_HIGH_TEMPERATURE;
        }

        // turn on if water is too cold
        if (processedStatusValues.currentWaterTemperature <= CONFIG.minWaterTemperature) {
            return SWITCH_STATUS.ON_LOW_TEMPERATURE;
        }
    }

    // turn on if no information about energy production is available only within fallback operation hours
    if (processedStatusValues.availableEnergy === null) {
        if (isWithinFallbackOperatingHours() && !isWaterTemperatureToHigh(processedStatusValues, CONFIG.maxWaterTemperatureFallback, CONFIG.maxWaterTemperatureDelta)) {
            return SWITCH_STATUS.ON_FALLBACK;
        } else {
            return SWITCH_STATUS.OFF_FALLBACK;
        }
    }

    // determinSwitchStatusByGriByGridUsage then determineNewSwitchStatusByCharge
    return determinSwitchStatusByGridUsage(processedStatusValues, function () { return SWITCH_STATUS.ON_ENERGY }, determineNewSwitchStatusByCharge);
}

/**
 * 
 * @param {Object} statusValues
 * @param {Function} onStatusFunction a function which returns the switch status for on
 * @param {Function} offStatusFunction a function which returns the switch status for off
 * @returns The SWITCH_STATUS which was determined due to the passed values
 */
function determinSwitchStatusByGridUsage(statusValues, onStatusFunction, offStatusFunction) {
    // check if enough solar power is available
    log("Determine switch status by grid usage with status values", statusValues);
    if (statusValues.switchOn && statusValues.availableEnergy > CONFIG.wattThresholdToSwitchOff) {
        return onStatusFunction(statusValues);
    } else if (!statusValues.switchOn && statusValues.availableEnergy >= CONFIG.wattThresholdToSwitchOn) {
        // feed in power exceeds watt threshold
        return onStatusFunction(statusValues);
    } else {
        return offStatusFunction(statusValues);
    }
}

/**
 * The off status function to determine status by battery charge in another step
 * @param {Object} statusValues
 * @returns The SWITCH_STATUS which was determined due to the passed values
 */
function determineNewSwitchStatusByCharge(statusValues) {
    if (CONFIG.minBatteryCharge !== 0 && canConsumeBatteryCharge(statusValues)) {
        log("Calling determine switch status by grid usage status values for battery charge");
        return determinSwitchStatusByGridUsage(shiftAvailableEnergy(statusValues), function () { return SWITCH_STATUS.ON_HIGH_BATTERY_CHARGE }, function () { return SWITCH_STATUS.OFF_LOW_ENERGY });
    } else {
        return SWITCH_STATUS.OFF_LOW_ENERGY;
    }
}

/**
 * shift available energy by part of the appliances watt usage except we already use energy from grid
 * @param {Object} statusValues 
 * @returns 
 */
function shiftAvailableEnergy(statusValues) {
    if (statusValues.shifted) return statusValues;
    if (statusValues.availableEnergy === 0) { // draw energy from grid, should not be more than availableEnergyOffsetFallback
        statusValues.availableEnergy = statusValues.gridEnergy >= CONFIG.availableEnergyOffsetFallback ? 0 : CONFIG.availableEnergyOffsetFallback - statusValues.gridEnergy;
    } else {
        statusValues.availableEnergy = statusValues.availableEnergy + CONFIG.availableEnergyOffsetFallback;
    }
    statusValues.shifted = true;
    return statusValues;
}

/**
 * Checks if current water temperature is to high also implements temperature delta logic
 * @param {Object} statusValues 
 * @param {Number} maxWaterTemperature 
 * @param {Number} maxWaterTemperatureDelta 
 * @returns 
 */
function isWaterTemperatureToHigh(statusValues, maxWaterTemperature, maxWaterTemperatureDelta) {
    if (statusValues.currentWaterTemperature === null) {
        return true;
    }

    // turn off if maxWaterTemperature is reached
    if (statusValues.switchOn && statusValues.currentWaterTemperature >= maxWaterTemperature) {
        return true
    }

    // keep turned off till the water cooled down by by maxWaterTemperatureDelta
    if (!statusValues.switchOn && statusValues.currentWaterTemperature >= maxWaterTemperature - maxWaterTemperatureDelta) {
        return true
    }

    return false;
}

/**
 * Checks if battery charge can be consumed
 * @param {Object} statusValues 
 * @returns 
 */
function canConsumeBatteryCharge(statusValues) {
    if (statusValues.batteryCharge === null) {
        return false;
    }

    if (statusValues.switchOn && statusValues.batteryCharge >= CONFIG.minBatteryCharge) {
        return true;
    }

    if (!statusValues.switchOn && statusValues.batteryCharge >= CONFIG.minBatteryCharge + CONFIG.minBatteryChargeDelta) {
        return true;
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

function start() {
    if (RUN_WITH_TIMER) {
        log("starting the initial loop");
        setImmediate(update);
    } else {
        log("Dry run. not starting initial loop");
    }
}

// Automatically start if run directly
if (require.main === module) {
    start();
}

module.exports = { update, determineNewSwitchStatus, setNewSwitchStatus, switch0, start };
