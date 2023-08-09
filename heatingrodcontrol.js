if (typeof DRY_RUN === 'undefined') {
    DRY_RUN = false;
} else {
    DRY_RUN ? console.log(new Date(), "Executing dry run ... No switch status will be set. No timers will be scheduled.") : "";
}

const http = require('node:http');

const TIG_HOST = "tig";
const INFLUX_BASE_URL = "http://" + TIG_HOST + ":8086"
const INFLUX_TOKEN = process.env.INFLUX_TOKEN;

const MINUTE = 1000*60;
const SWITCH_STATUS = {
    ON_FALLBACK: {position: true, status: 3, message: "On due to no value for energy production was available", timerPeriod: 60 * MINUTE},
    ON_LOW_TEMPERATURE: {position: true, status: 2, message: "On due to low water temperature", timerPeriod: 60 * MINUTE},
    ON_ENERGY: {position: true, status: 1, message: "On due to excess energy", timerPeriod: MINUTE / 2},
    OFF_LOW_ENERGY: {position: false, status: 0, message: "Off due to not enough energy production", timerPeriod: 10 * MINUTE},
    OFF_HIGH_TEMPERATURE: {position: false, status: -1, message: "Off due to high water temperature", timerPeriod: 60 * MINUTE},
    OFF_NIGHT: {position: false, status: -2, message: "Off due to time resitrected to day hours", timerPeriod: 60 * MINUTE},
};

const CONFIG = {
    wattThresholdToSwitchOn: 3000,
    wattThresholdToSwitchOff: 0,
    minWaterTemperature: 45,
    maxWaterTemperature: 70,
    // the time in which span
    startHour: 6,
    endHour: 19,
};

// the fallbackValues simulate a standard operation mode with enough energy availabel and water temperature in a range where heating is permitted
const INFLUX_WATER_TEMPERATURE_LAST = {url: INFLUX_BASE_URL + '/query?pretty=true&db=prometheus&q=SELECT last("value") FROM "autogen"."eta_buffer_temperature_sensor_top_celsius" WHERE time >= now() - 5m and time <= now()', fallBackValue: CONFIG.minWaterTemperature + 10};
const INFLUX_GRID_USAGE_LAST = {url: INFLUX_BASE_URL + '/query?pretty=true&db=inverter&q=SELECT last("P_Grid") FROM "autogen"."powerflow" WHERE time >= now() - 5m and time <= now()', fallBackValue: null};
const INFLUX_GRID_USAGE_MEAN = {url: INFLUX_BASE_URL + '/query?pretty=true&db=inverter&q=SELECT mean("P_Grid") FROM "autogen"."powerflow" WHERE time >= now() - 10m and time <= now()', fallBackValue: null};
const INFLUX_REQUEST_HEADER = {"Authorization" : "Token " + INFLUX_TOKEN};

const ShellySwitch = {
    turnOn: function () {
        set(true);
    },
    turnOff: function () {
        set(false);
    },
    set: function (position) {
        HTTP.get("http://" + this.host + "/rpc/Switch.Set?id=" + this.id + "&on=" + position);
    },
    get: function(callback) {
        // console.log(new Date(), "Getting switch status: http://" + this.host + "/rpc/Switch.GetStatus?id=" + this.id);
        HTTP.get("http://" + this.host + "/rpc/Switch.GetStatus?id=" + this.id, null, (result) => {
            callback(result === null ? null : result.output === true);
        });
    },
};


const HTTP = {
    get: function(url, header, callback) {
        http.get(url, {headers: header}, (res) => {
        const { statusCode } = res;
        const contentType = res.headers['content-type'];

        let error;
        // Any 2xx status code signals a successful response but
        // here we're only checking for 200.
        if (statusCode !== 200) {
            error = new Error('Request Failed.\n' +
                            `Status Code: ${statusCode}`);
        }
        if (error) {
            console.error(new Date(), `Got error: ${error.message}`);
            // Consume response data to free up memory
            res.resume();
            if (callback) {
                callback(null);
            }
            return;
        }

        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
            try {
                const parsedData = JSON.parse(rawData);
                if (callback) {
                    callback(parsedData);
                }
            } catch (e) {
                console.error(new Date(), `Got error: ${e.message}`);
                if (callback) {
                    callback(null);
                }
            }
        });
        }).on('error', (e) => {
            console.error(new Date(), `Got error: ${e.message}`);
            if (callback) {
                callback(null);
            }
        });
    }
};


function getSwitch(id) {
    let o = Object.create(ShellySwitch);
    o.id = id;
    o.host = "heatingrod.localdomain"
    return o;
};

let switch0 = getSwitch(0);

// holds the handle for the recurring timer to clear it when new one is scheduled
let executionTimer;

/**
 *  this is the entry point  which calls the switch status change
 */
function update() {
    switch0.get(function(switchOn) {
        HTTP.get(INFLUX_GRID_USAGE_LAST.url, INFLUX_REQUEST_HEADER, function(result) {
            let gridUsageLast = getValue(result, INFLUX_GRID_USAGE_LAST.fallBackValue);
            HTTP.get(INFLUX_GRID_USAGE_MEAN.url, INFLUX_REQUEST_HEADER, function(result) {
                let gridUsageMean = getValue(result, INFLUX_GRID_USAGE_MEAN.fallBackValue);
                HTTP.get(INFLUX_WATER_TEMPERATURE_LAST.url, INFLUX_REQUEST_HEADER, function(result) {
                    let waterTemperature = getValue(result, INFLUX_WATER_TEMPERATURE_LAST.fallBackValue);
                    let switchStatus = determineNewSwitchStatus(gridUsageMean, gridUsageLast, waterTemperature, switchOn);
                    sendStatusChange(switchStatus);
                    setSwitch(switchStatus);
                    updateTimer(switchStatus);
                });
            });
        });
    });
}

/**
 * 
 * @param {JSON} result The json where to get value from 
 * @param {Number} fallBackValue 
 * @returns The value which should be a number
 */
function getValue(result, fallBackValue) {
    if (result === null) {
        console.log(new Date(), "Using fallback value " + fallBackValue)
        return fallBackValue;
    }
    try {
        return result.results[0].series[0].values[0][1];
    } catch (error) {
        console.log(new Date(), "Could not get value from JSON", result);
        return fallBackValue;
    }
}

/**
 * Sets a new interval timer and clears the old one
 * @param {SWITCH_STATUS} switchStatus the new status of the switch which holds also the delay for the interval timer
 */
function updateTimer(switchStatus) {
    if (executionTimer) {
        clearInterval(executionTimer);
    }
    if (!DRY_RUN) {
        executionTimer = setInterval(update, switchStatus.timerPeriod);
    }
}

/**
 * Calls remote function to switch on/off switch
 * @param {SWITCH_STATUS} switchStatus the new status of the switch which holds also the new swicht postion
 */
function setSwitch(switchStatus) {
    console.log(new Date(), "New switchs status: " , switchStatus);
    if (!DRY_RUN) {
        switch0.set(switchStatus.position);
    }
}

/**
 * Sends a status update to telegraf to write it into influx db
 * @param {SWITCH_STATUS} switchStatus the new status of the switch which is transmitted as json to influx db
 */
function sendStatusChange(switchStatus) {
    const jsonDataString = JSON.stringify(switchStatus);

    // HTTP request options
    const options = {
        hostname: TIG_HOST,
        port: 9001,
        path: '/telegraf',
        method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(jsonDataString)
            }
    };

    // Create the HTTP request
    const request = http.request(options, (response) => {
    let data = '';

    response.on('data', (chunk) => {
        data += chunk;
    });

    response.on('end', () => {
        console.log(new Date(), 'Response:', data);
    });
    });

    // Handle errors
    request.on('error', (error) => {
        console.error(new Date(), 'Error:', error);
    });

    // Send the JSON data in the request body
    request.write(jsonDataString);

    // Finish the request
    request.end();
}

/**
 * 
 * @param {Number} wattGridUsageMean 
 * @param {Number} wattGridUsageLast 
 * @param {Number} currentWaterTemperature 
 * @param {boolean} switchOn 
 * @returns The SWITCH_STATUS which was determined due to the passed values
 */
function determineNewSwitchStatus(wattGridUsageMean, wattGridUsageLast, currentWaterTemperature, switchOn) {
    console.log(new Date(), "Determine switch status with grid usage (mean / last) " + wattGridUsageMean + " W / " + wattGridUsageLast + " W, water temperature " + currentWaterTemperature + " °C and " + (switchOn ? " switch on " : " switch off "));
    if (isNight()) {
        return SWITCH_STATUS.OFF_NIGHT;
    }

    if (currentWaterTemperature >= CONFIG.maxWaterTemperature) {
        return SWITCH_STATUS.OFF_HIGH_TEMPERATURE;
    }
    
    if (currentWaterTemperature <= CONFIG.minWaterTemperature) {
        return SWITCH_STATUS.ON_LOW_TEMPERATURE;
    }

    if (wattGridUsageMean === null || wattGridUsageLast === null) {
        return SWITCH_STATUS.ON_FALLBACK;
    }
    
    // check if enough solar power is available
    if (wattGridUsageLast < 0) { // feed power into grid
        if (switchOn && Math.abs(wattGridUsageLast) >= CONFIG.wattThresholdToSwitchOff) {
            // as long some energy is feed in keep it on
            return SWITCH_STATUS.ON_ENERGY;
        } else if (!switchOn && Math.abs(wattGridUsageLast) >= CONFIG.wattThresholdToSwitchOn && Math.abs(wattGridUsageMean) >= CONFIG.wattThresholdToSwitchOn) {
            // feed in power exceeds watt threshold
            return SWITCH_STATUS.ON_ENERGY;
        } else {
            return SWITCH_STATUS.OFF_LOW_ENERGY;
        }
    } else {
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
if (!DRY_RUN) {
    setImmediate(update);
}


module.exports = {determineNewSwitchStatus, CONFIG, SWITCH_STATUS, isDay, isNight, setSwitch, HTTP, switch0}
