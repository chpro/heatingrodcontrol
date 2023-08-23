DRY_RUN = true;

const hrc = require('./heatingrodcontrol');
let wattThreshold = hrc.CONFIG.wattThresholdToSwitchOn;
let excessEnergyThreshold = wattThreshold * -1;
let excessEnergyOverThreshold = excessEnergyThreshold - 1;
let excessEnergyUnderThreshold   = excessEnergyThreshold + 1;
let minWaterTemperature = hrc.CONFIG.minWaterTemperature;

// siwtich to always night
hrc.CONFIG.startHour = 24
hrc.CONFIG.endHour = 24

console.log("It is night all combinations return status OFF_NIGHT")
assert(excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_NIGHT);
assert(excessEnergyOverThreshold, minWaterTemperature +1, hrc.SWITCH_STATUS.OFF_NIGHT)


// switch to always day mode
hrc.CONFIG.startHour = -1
hrc.CONFIG.endHour = 24

console.log("test switch off")
console.log("test max water temperature")
assert(excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyThreshold, hrc.CONFIG.maxWaterTemperature, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyUnderThreshold, hrc.CONFIG.maxWaterTemperature, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature - hrc.CONFIG.maxWaterTemperatureDelta - 1, hrc.SWITCH_STATUS.ON_ENERGY);
assert(excessEnergyUnderThreshold, hrc.CONFIG.maxWaterTemperature - hrc.CONFIG.maxWaterTemperatureDelta - 1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY);
console.log("test max water temperature delta")
assertMeanLast(excessEnergyOverThreshold, -1, hrc.CONFIG.maxWaterTemperature - hrc.CONFIG.maxWaterTemperatureDelta - 1, hrc.SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, -1, hrc.CONFIG.maxWaterTemperature - hrc.CONFIG.maxWaterTemperatureDelta, hrc.SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, -1, hrc.CONFIG.maxWaterTemperature - (hrc.CONFIG.maxWaterTemperatureDelta/2), hrc.SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, +1, hrc.CONFIG.maxWaterTemperature - (hrc.CONFIG.maxWaterTemperatureDelta), hrc.SWITCH_STATUS.OFF_LOW_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, +1, hrc.CONFIG.maxWaterTemperature - (hrc.CONFIG.maxWaterTemperatureDelta/2), hrc.SWITCH_STATUS.OFF_LOW_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, +1, hrc.CONFIG.maxWaterTemperature, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE, true)

assertMeanLast(excessEnergyOverThreshold, -1, hrc.CONFIG.maxWaterTemperature - hrc.CONFIG.maxWaterTemperatureDelta - 1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY, false)
assertMeanLast(excessEnergyOverThreshold, excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature - hrc.CONFIG.maxWaterTemperatureDelta - 1, hrc.SWITCH_STATUS.ON_ENERGY, false)
assertMeanLast(excessEnergyOverThreshold, +1, hrc.CONFIG.maxWaterTemperature, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE, false)
assertMeanLast(excessEnergyOverThreshold, -1, hrc.CONFIG.maxWaterTemperature - hrc.CONFIG.maxWaterTemperatureDelta, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE, false)
assertMeanLast(excessEnergyOverThreshold, -1, hrc.CONFIG.maxWaterTemperature - (hrc.CONFIG.maxWaterTemperatureDelta/2), hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE, false)
assertMeanLast(excessEnergyOverThreshold, +1, hrc.CONFIG.maxWaterTemperature - (hrc.CONFIG.maxWaterTemperatureDelta), hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE, false)
assertMeanLast(excessEnergyOverThreshold, +1, hrc.CONFIG.maxWaterTemperature - (hrc.CONFIG.maxWaterTemperatureDelta/2), hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE, false)


console.log("test min water temperature")
assert(0, minWaterTemperature, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, minWaterTemperature - 1, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(1000, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(-1000, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(excessEnergyUnderThreshold, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(excessEnergyOverThreshold, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, minWaterTemperature +1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY)
assert(null, null, hrc.SWITCH_STATUS.ON_FALLBACK)
assert(excessEnergyThreshold, null, hrc.SWITCH_STATUS.ON_ENERGY)
assertMeanLast(null, null, minWaterTemperature - 1, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE, false)
console.log("test watt threshold")
assert(excessEnergyUnderThreshold, minWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY)
assert(excessEnergyOverThreshold, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_ENERGY)
assert(excessEnergyThreshold, minWaterTemperature + 10, hrc.SWITCH_STATUS.ON_ENERGY)
// this is also the the test for query fallBackValues
assert(null, minWaterTemperature +10, hrc.SWITCH_STATUS.ON_FALLBACK)

// check logic when switch is on
console.log("test switch on")
// test cases to be on and stay on
assert(excessEnergyUnderThreshold, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_ENERGY, true)
assert(excessEnergyOverThreshold, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_ENERGY, true)

// check where the mean and last watt grid usage values are different
console.log("different values for mean last");
assertMeanLast(excessEnergyUnderThreshold, excessEnergyOverThreshold, minWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY, false)
assertMeanLast(excessEnergyOverThreshold, excessEnergyUnderThreshold, minWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY, false)
assertMeanLast(excessEnergyUnderThreshold, excessEnergyUnderThreshold, minWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY, false)
assertMeanLast(excessEnergyOverThreshold, excessEnergyOverThreshold, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_ENERGY, false)

assertMeanLast(excessEnergyUnderThreshold, excessEnergyUnderThreshold, minWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY, null)
assertMeanLast(excessEnergyOverThreshold, excessEnergyOverThreshold, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_ENERGY, null)

assertMeanLast(excessEnergyOverThreshold, -1, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(excessEnergyOverThreshold, + 1, minWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY, true)
assertMeanLast(-1, -1, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_ENERGY, true)
assertMeanLast(-1, 1, minWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY, true)

// check fallback status
assertMeanLast(null, 0, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_FALLBACK, true)
assertMeanLast(0, null, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_FALLBACK, true)
assertMeanLast(null, 0, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_FALLBACK, false)
assertMeanLast(0, null, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_FALLBACK, false)
assertMeanLast(null, null, minWaterTemperature + 1, hrc.SWITCH_STATUS.ON_FALLBACK, false)

// check HTTP client
console.log("checking http get");
hrc.switch0.get(function(result) {
    console.assert(result !== null, "http get call failed");
});

hrc.HTTP.get("http://tig:8086", null, function(result) {
    console.assert(result === null, "http get call failed");
});

console.log("execute an update");
hrc.update();

function assert(wattGridUsage, currentWaterTemperature, expectedResult, switchOn = false) {
    assertMeanLast(wattGridUsage, wattGridUsage, currentWaterTemperature, expectedResult, switchOn);
}

function assertMeanLast(wattGridUsageMean, wattGridUsageLast, currentWaterTemperature, expectedResult, switchOn) {
    result = hrc.determineNewSwitchStatus(wattGridUsageMean, wattGridUsageLast, currentWaterTemperature, switchOn)
    // this is necessary because in night hours we get different result
    console.assert(result === expectedResult, "Expected: " + JSON.stringify(expectedResult) + " but got " + JSON.stringify(result));
}