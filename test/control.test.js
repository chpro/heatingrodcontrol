DRY_RUN = true;

const assertlib = require('assert');
const CONFIG = require('../app/config').CONFIG
const SWITCH_STATUS = require('../app/switchstatus').SWITCH_STATUS;
const control = require('../app/control');
const DataProvider = require('../app/influxdataprovider');

let wattThreshold = CONFIG.wattThresholdToSwitchOn;
let excessEnergyThreshold = wattThreshold * -1;
let excessEnergyOverThreshold = excessEnergyThreshold - 1;
let excessEnergyUnderThreshold   = excessEnergyThreshold + 1;
let minWaterTemperature = CONFIG.minWaterTemperature;

// fallback to always on
CONFIG.startHourFallback = -1
CONFIG.endHourFallback = 24

// switch to always night
CONFIG.startHour = 24
CONFIG.endHour = 24

console.log("It is night all combinations return status OFF_NIGHT")
assert(excessEnergyOverThreshold, CONFIG.maxWaterTemperature + 1, SWITCH_STATUS.OFF_NIGHT);
assert(excessEnergyOverThreshold, minWaterTemperature +1, SWITCH_STATUS.OFF_NIGHT)


// switch to always day mode
CONFIG.startHour = -1
CONFIG.endHour = 24

var testCount = 0

console.log("test switch off")
console.log("test max water temperature")
testCount = 0
assert(excessEnergyOverThreshold, CONFIG.maxWaterTemperature + 1, SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyOverThreshold, CONFIG.maxWaterTemperature, SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyThreshold, CONFIG.maxWaterTemperature, SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyUnderThreshold, CONFIG.maxWaterTemperature, SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyOverThreshold, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.ON_ENERGY);
assert(excessEnergyUnderThreshold, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.OFF_LOW_ENERGY);
console.log("test max water temperature delta")
testCount = 0
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta, SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - (CONFIG.maxWaterTemperatureDelta/2), SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, +1, CONFIG.maxWaterTemperature - (CONFIG.maxWaterTemperatureDelta), SWITCH_STATUS.OFF_LOW_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, +1, CONFIG.maxWaterTemperature - (CONFIG.maxWaterTemperatureDelta/2), SWITCH_STATUS.OFF_LOW_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, +1, CONFIG.maxWaterTemperature, SWITCH_STATUS.OFF_HIGH_TEMPERATURE, true)

assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.OFF_LOW_ENERGY, false)
assertMeanLast(excessEnergyOverThreshold, excessEnergyOverThreshold, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.ON_ENERGY, false)
assertMeanLast(excessEnergyOverThreshold, +1, CONFIG.maxWaterTemperature, SWITCH_STATUS.OFF_HIGH_TEMPERATURE, false)
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta, SWITCH_STATUS.OFF_HIGH_TEMPERATURE, false)
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - (CONFIG.maxWaterTemperatureDelta/2), SWITCH_STATUS.OFF_HIGH_TEMPERATURE, false)
assertMeanLast(excessEnergyOverThreshold, +1, CONFIG.maxWaterTemperature - (CONFIG.maxWaterTemperatureDelta), SWITCH_STATUS.OFF_HIGH_TEMPERATURE, false)
assertMeanLast(excessEnergyOverThreshold, +1, CONFIG.maxWaterTemperature - (CONFIG.maxWaterTemperatureDelta/2), SWITCH_STATUS.OFF_HIGH_TEMPERATURE, false)


console.log("test min water temperature")
testCount = 0
assert(0, minWaterTemperature, SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, minWaterTemperature - 1, SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, 0, SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(1000, 0, SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(-1000, 0, SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(excessEnergyUnderThreshold, 0, SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(excessEnergyOverThreshold, 0, SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, minWaterTemperature +1, SWITCH_STATUS.OFF_LOW_ENERGY)
assert(excessEnergyThreshold, null, SWITCH_STATUS.ON_ENERGY)
assertMeanLast(null, null, minWaterTemperature - 1, SWITCH_STATUS.ON_LOW_TEMPERATURE, false)
console.log("test watt threshold")
testCount = 0
assert(excessEnergyUnderThreshold, minWaterTemperature + 1, SWITCH_STATUS.OFF_LOW_ENERGY, null)
assert(excessEnergyOverThreshold, minWaterTemperature + 1, SWITCH_STATUS.ON_ENERGY, null)
assert(excessEnergyUnderThreshold, minWaterTemperature + 1, SWITCH_STATUS.OFF_LOW_ENERGY)
assert(excessEnergyOverThreshold, minWaterTemperature + 1, SWITCH_STATUS.ON_ENERGY)
assert(excessEnergyThreshold, minWaterTemperature + 10, SWITCH_STATUS.ON_ENERGY)
// this is also the the test for query fallBackValues
assert(null, minWaterTemperature +10, SWITCH_STATUS.ON_FALLBACK)
assert(null, null, SWITCH_STATUS.OFF_FALLBACK)

// check logic when switch is on
console.log("test switch on")
testCount = 0
// test cases to be on and stay on
assert(excessEnergyUnderThreshold, minWaterTemperature + 1, SWITCH_STATUS.ON_ENERGY, true)
assert(excessEnergyOverThreshold, minWaterTemperature + 1, SWITCH_STATUS.ON_ENERGY, true)

// check where the mean and last watt grid usage values are different
console.log("different values for mean last");
testCount = 0
assertMeanLast(excessEnergyUnderThreshold, excessEnergyOverThreshold, minWaterTemperature + 1, SWITCH_STATUS.OFF_LOW_ENERGY, false)
assertMeanLast(excessEnergyOverThreshold, excessEnergyUnderThreshold, minWaterTemperature + 1, SWITCH_STATUS.OFF_LOW_ENERGY, false)
assertMeanLast(excessEnergyUnderThreshold, excessEnergyUnderThreshold, minWaterTemperature + 1, SWITCH_STATUS.OFF_LOW_ENERGY, false)
assertMeanLast(excessEnergyOverThreshold, excessEnergyOverThreshold, minWaterTemperature + 1, SWITCH_STATUS.ON_ENERGY, false)

assertMeanLast(excessEnergyUnderThreshold, excessEnergyUnderThreshold, minWaterTemperature + 1, SWITCH_STATUS.OFF_LOW_ENERGY, null)
assertMeanLast(excessEnergyOverThreshold, excessEnergyOverThreshold, minWaterTemperature + 1, SWITCH_STATUS.ON_ENERGY, null)

assertMeanLast(excessEnergyOverThreshold, -1, minWaterTemperature + 1, SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, + 1, minWaterTemperature + 1, SWITCH_STATUS.OFF_LOW_ENERGY, true)
assertMeanLast(-1, -1, minWaterTemperature + 1, SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(-1, 1, minWaterTemperature + 1, SWITCH_STATUS.OFF_LOW_ENERGY, true)

// check fallback status
console.log("test fallback status for no grid usage info")
testCount = 0
assertMeanLast(null, 0, minWaterTemperature + 1, SWITCH_STATUS.ON_FALLBACK, true)
assertMeanLast(0, null, minWaterTemperature + 1, SWITCH_STATUS.ON_FALLBACK, true)
assertMeanLast(null, 0, minWaterTemperature + 1, SWITCH_STATUS.ON_FALLBACK, false)
assertMeanLast(0, null, minWaterTemperature + 1, SWITCH_STATUS.ON_FALLBACK, false)
assertMeanLast(null, null, minWaterTemperature + 1, SWITCH_STATUS.ON_FALLBACK, false)

assertMeanLast(null, null, CONFIG.maxWaterTemperatureFallback + 1, SWITCH_STATUS.OFF_FALLBACK, false)
assertMeanLast(null, null, CONFIG.maxWaterTemperatureFallback - 1, SWITCH_STATUS.OFF_FALLBACK, false)
assertMeanLast(null, null, CONFIG.maxWaterTemperatureFallback - 1, SWITCH_STATUS.ON_FALLBACK, true)

// check modified CONFIG.wattZeroGridUsageOffset value
console.log("test wattZeroGridUsageOffset")
testCount = 0
CONFIG.wattZeroGridUsageOffset=100
assertMeanLast(-101, -101, minWaterTemperature +1, SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(-99, -99, minWaterTemperature +1, SWITCH_STATUS.ON_ENERGY, true)

// draw energy from grid
assertMeanLast(99, 99, minWaterTemperature +1, SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(100, 100, minWaterTemperature +1, SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(101, 101, minWaterTemperature +1, SWITCH_STATUS.OFF_LOW_ENERGY, true)

assertMeanLast(100, 100, minWaterTemperature +1, SWITCH_STATUS.OFF_LOW_ENERGY, false)
assertMeanLast(99, 99, minWaterTemperature +1, SWITCH_STATUS.OFF_LOW_ENERGY, false)
assertMeanLast(101, 101, minWaterTemperature +1, SWITCH_STATUS.OFF_LOW_ENERGY, false)
assertMeanLast(excessEnergyOverThreshold, excessEnergyOverThreshold, minWaterTemperature +1, SWITCH_STATUS.ON_ENERGY, false)

CONFIG.wattZeroGridUsageOffset=0

// fallback to always off
console.log("test fallback logic")
testCount = 0
CONFIG.startHourFallback = 24
CONFIG.endHourFallback = 24
assertMeanLast(null, null, minWaterTemperature + 1, SWITCH_STATUS.OFF_FALLBACK, false)

assertMeanLast(excessEnergyOverThreshold, excessEnergyOverThreshold, minWaterTemperature + 1, SWITCH_STATUS.ON_ENERGY, false, CONFIG.wattThresholdToSwitchOn - 10, new Date("2023-08-29T11:00:00Z"))

console.log("test other appliance is active")
CONFIG.offWhenPrimarySourceActive = true;
testCount = 0
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.ON_ENERGY, true, null, null, 0)
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.OFF_PRIMARY_SOURCE_ACTIVE, true, null, null, 1)
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.OFF_PRIMARY_SOURCE_ACTIVE, true, null, null, 2)
CONFIG.offWhenPrimarySourceActive = false;
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.ON_ENERGY, true, null, null, 0)
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.ON_ENERGY, true, null, null, 1)

console.log("test battery charge to low")
testCount = 0
CONFIG.minBatteryCharge = 25;
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.OFF_LOW_BATTERY_CHARGE, true, null, null, null, 12.6)
assertMeanLast(excessEnergyOverThreshold, -1, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.ON_ENERGY, true, null, null, null, 25)
assertMeanLast(excessEnergyOverThreshold, excessEnergyOverThreshold, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.OFF_LOW_BATTERY_CHARGE, false, null, null, null, 12.6)
assertMeanLast(excessEnergyOverThreshold, excessEnergyOverThreshold, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.ON_ENERGY, false, null, null, null, 25)
CONFIG.minBatteryCharge = 0;

console.log("test battery charge high enough to use some of it for heating water")
testCount = 0
CONFIG.minBatteryCharge = 80;
assertMeanLast(999, 999, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.ON_HIGH_BATTERY_CHARGE, true, null, null, null, 91)
assertMeanLast(excessEnergyUnderThreshold, excessEnergyUnderThreshold, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.OFF_LOW_BATTERY_CHARGE, true, null, null, null, 79)
assertMeanLast(99, 99, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.ON_HIGH_BATTERY_CHARGE, true, null, null, null, 80)
assertMeanLast(excessEnergyUnderThreshold, excessEnergyUnderThreshold, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.ON_HIGH_BATTERY_CHARGE, false, null, null, null, 91)
assertMeanLast(excessEnergyUnderThreshold, excessEnergyUnderThreshold, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.OFF_LOW_BATTERY_CHARGE, false, null, null, null, 79)
assertMeanLast(excessEnergyUnderThreshold, excessEnergyUnderThreshold, CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1, SWITCH_STATUS.OFF_LOW_ENERGY, false, null, null, null, 85)
CONFIG.minBatteryCharge = 0;

// check HTTP client
console.log("checking http get");
control.switch0.get(function(result) {
    assertlib.notEqual(result, null, "http get call failed");
});

console.log("execute an update");
control.update();

function assert(wattGridUsage, currentWaterTemperature, expectedResult, switchOn = false) {
    assertMeanLast(wattGridUsage, wattGridUsage, currentWaterTemperature, expectedResult, switchOn);
}

function assertMeanLast(wattGridUsageMean, wattGridUsageLast, currentWaterTemperature, expectedResult, switchOn, forecastValue = null, forecastTime = null, boilerStatus = null, batteryCharge = null) {
    testCount++;
    console.log("=".repeat(80))
    console.log("    => expected Result: " + expectedResult.message)
    result = control.determineNewSwitchStatus(DataProvider.getStatusValues(wattGridUsageMean, wattGridUsageLast, currentWaterTemperature, switchOn, boilerStatus, batteryCharge))
    assertlib.equal(result, expectedResult, "For mean/last -> Expected: " + JSON.stringify(expectedResult) + " but got " + JSON.stringify(result) + " in test nr.: " + testCount)
    console.log("-".repeat(80))
    result2 = control.determineNewSwitchStatus(DataProvider.getStatusValues(wattGridUsageMean, wattGridUsageLast, currentWaterTemperature, switchOn, boilerStatus, batteryCharge, {P_PV: Math.max(wattGridUsageLast, wattGridUsageMean) * -1, P_Load: 0}))
    assertlib.equal(result2, expectedResult, "For inverterPowerFlow -> Expected: " + JSON.stringify(expectedResult) + " but got " + JSON.stringify(result2) + " in test nr.: " + testCount)
}