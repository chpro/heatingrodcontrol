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
    maxWaterTemperatureDelta: Number(process.env.MAX_WATER_TEMPERATURE_DELTA) || 2,
    // the time in which span
    startHour: Number(process.env.START_HOUR) || 6,
    endHour: Number(process.env.END_HOUR) || 19,

    // INFLUX host and tokens
    influxHost: process.env.INFLUX_HOST || "tig",
    influxBaseUrl: process.env.INFLUX_BASE_URL || "http://tig:8086",
    influxToken: process.env.INFLUX_TOKEN,

    // shelly switch
    switch0Host: process.env.SWITCH0_HOST || "heatingrod.localdomain",

    // timer periods are given in milliseconds
    timerPeriodOnFallback: Number(process.env.TIMER_PERIOD_ON_FALLBACK) || 10 * MINUTE,
    timerPeriodOnLowTemperature: Number(process.env.TIMER_PERIOD_ON_LOW_TEMPERATURE) || 30 * MINUTE,
    timerPeriodOnEnergy: Number(process.env.TIMER_PERIOD_ON_ENERGY) || MINUTE / 2,
    timerPeriodOffLowEnergy: Number(process.env.TIMER_PERIOD_OFF_LOW_ENERGY) || 10 * MINUTE,
    timerPeriodOffHighTemperature: Number(process.env.TIMER_PERIOD_OFF_HIGH_TEMPERATURE) || 10 * MINUTE,
    timerPeriodOffNight: Number(process.env.TIMER_PERIOD_OFF_NIGHT) || 60 * MINUTE,
    timerPeriodManually: Number(process.env.TIMER_PERIOD_MANUALLY) || 60 * MINUTE,
};

console.log(new Date(), "CONFIG: ", CONFIG)

const SWITCH_STATUS = {
    ON_MANUALLY: {position: true, status: 4, message: "On due to manual intervention", timerPeriod: CONFIG.timerPeriodManually},
    ON_FALLBACK: {position: true, status: 3, message: "On due to no value for energy production was available", timerPeriod: CONFIG.timerPeriodOnFallback},
    ON_LOW_TEMPERATURE: {position: true, status: 2, message: "On due to low water temperature", timerPeriod: CONFIG.timerPeriodOnLowTemperature},
    ON_ENERGY: {position: true, status: 1, message: "On due to excess energy", timerPeriod: CONFIG.timerPeriodOnEnergy},
    OFF_LOW_ENERGY: {position: false, status: 0, message: "Off due to not enough energy production", timerPeriod: CONFIG.timerPeriodOffLowEnergy},
    OFF_HIGH_TEMPERATURE: {position: false, status: -1, message: "Off due to high water temperature", timerPeriod: CONFIG.timerPeriodOffHighTemperature},
    OFF_NIGHT: {position: false, status: -2, message: "Off due to time resitrected to day hours", timerPeriod: CONFIG.timerPeriodOffNight},
    OFF_MANUALLY: {position: false, status: -3, message: "Off due to manual intervention", timerPeriod: CONFIG.timerPeriodManually},
};

const INFLUX_WATER_TEMPERATURE_LAST = {url: CONFIG.influxBaseUrl + '/query?pretty=true&db=prometheus&q=SELECT last("value") FROM "autogen"."eta_buffer_temperature_sensor_top_celsius" WHERE time >= now() - 5m and time <= now()'};
const INFLUX_GRID_USAGE_LAST = {url: CONFIG.influxBaseUrl + '/query?pretty=true&db=inverter&q=SELECT last("P_Grid") FROM "autogen"."powerflow" WHERE time >= now() - 5m and time <= now()'};
const INFLUX_GRID_USAGE_MEAN = {url: CONFIG.influxBaseUrl + '/query?pretty=true&db=inverter&q=SELECT mean("P_Grid") FROM "autogen"."powerflow" WHERE time >= now() - 10m and time <= now()'};
const INFLUX_REQUEST_HEADER = {"Authorization" : "Token " + CONFIG.influxToken};

const ShellySwitch = {
    turnOn: function () {
        set(true);
    },
    turnOff: function () {
        set(false);
    },
    set: function (position) {
        axios.get("http://" + this.host + "/rpc/Switch.Set?id=" + this.id + "&on=" + position)
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
            axios.get(INFLUX_GRID_USAGE_LAST.url, {headers: INFLUX_REQUEST_HEADER}),
            axios.get(INFLUX_GRID_USAGE_MEAN.url, {headers: INFLUX_REQUEST_HEADER}),
            axios.get(INFLUX_WATER_TEMPERATURE_LAST.url, {headers: INFLUX_REQUEST_HEADER}),
        ]).then(
            axios.spread((res1, res2, res3) => {
            let gridUsageLast = getValue(res1.data);
            let gridUsageMean = getValue(res2.data);
            let waterTemperature = getValue(res3.data);
            let switchStatus = determineNewSwitchStatus(gridUsageMean, gridUsageLast, waterTemperature, switchOn);
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
    switch0.set(switchStatus.position);
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
 * @returns The SWITCH_STATUS which was determined due to the passed values
 */
function determineNewSwitchStatus(wattGridUsageMean, wattGridUsageLast, currentWaterTemperature, switchOn) {
    console.log(new Date(), "Determine switch status with grid usage (mean / last) " + wattGridUsageMean + " W / " + wattGridUsageLast + " W, water temperature " + currentWaterTemperature + " °C and " + (switchOn ? " switch on " : " switch off "));
    if (isNight()) {
        return SWITCH_STATUS.OFF_NIGHT;
    }

    // check water temperature
    if (currentWaterTemperature !== null) {
        // turn off if maxWaterTemperature is reached
        if (switchOn && currentWaterTemperature >= CONFIG.maxWaterTemperature) {
            return SWITCH_STATUS.OFF_HIGH_TEMPERATURE;
        } 

        // keep turned off till the water cooled down by by maxWaterTemperatureDelta
        if (!switchOn && currentWaterTemperature >= CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta) {
            return SWITCH_STATUS.OFF_HIGH_TEMPERATURE;
        }

        // turn on if water is too cold
        if (currentWaterTemperature <= CONFIG.minWaterTemperature) {
            return SWITCH_STATUS.ON_LOW_TEMPERATURE;
        }
    }

    // turn on if no information about energy production is available
    if (wattGridUsageMean === null || wattGridUsageLast === null) {
        return SWITCH_STATUS.ON_FALLBACK;
    }
    
    // check if enough solar power is available
    if (wattGridUsageLast < 0) { // feed power into grid. check if < 0 because of Math.abs logic
        if (switchOn && Math.abs(wattGridUsageLast) >= CONFIG.wattThresholdToSwitchOff) {
            // as long some energy is feed in keep it on
            return SWITCH_STATUS.ON_ENERGY;
        } else if (!switchOn && Math.abs(wattGridUsageLast) >= CONFIG.wattThresholdToSwitchOn && Math.abs(wattGridUsageMean) >= CONFIG.wattThresholdToSwitchOn) {
            // feed in power exceeds watt threshold
            return SWITCH_STATUS.ON_ENERGY;
        } else {
            return SWITCH_STATUS.OFF_LOW_ENERGY;
        }
    } else { // no power feed to grid 
        return SWITCH_STATUS.OFF_LOW_ENERGY;
    }
}

/**
 * 
 * @returns Returns true if the hours between the configured hours else false
 */
function isDay() {
    const now = new Date();
    const currentHour = now.getHours();
    //console.log(new Date(), {currentHour: currentHour, config: CONFIG});
    return currentHour >= CONFIG.startHour && currentHour < CONFIG.endHour;
}

/**
 * 
 * @returns not isDay()
 */
function isNight() {
    return !isDay();
}

// start the initial loop
if (RUN_WITH_TIMER) {
    setImmediate(update);
} else {
    console.log(new Date(), "Dry run. not starting initial loop");
}


module.exports = {update, determineNewSwitchStatus, setNewSwitchStatus, CONFIG, SWITCH_STATUS, isDay, isNight, setSwitch, switch0}
