DRY_RUN = true;

const hrc = require('./heatingrodcontrol');
let wattThreshold = hrc.CONFIG.wattThresholdToSwitchOn;
let excessEnergyThreshold = wattThreshold * -1;
let excessEnergyOverThreshold = excessEnergyThreshold - 1;
let excessEnergyUnderThreshold   = excessEnergyThreshold + 1;
let minWaterTemperature = hrc.CONFIG.minWaterTemperature;

let defaultStatus = null;
if (hrc.isNight()) {
    console.log("It is night all combinations return ", hrc.SWITCH_STATUS.OFF_NIGHT)
    assert(excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_NIGHT);
    assert(excessEnergyOverThreshold, minWaterTemperature +1, hrc.SWITCH_STATUS.OFF_NIGHT)
    defaultStatus = hrc.SWITCH_STATUS.OFF_NIGHT;
}

console.log("test switch off")
console.log("test max water temperature")
assert(excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyThreshold, hrc.CONFIG.maxWaterTemperature, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyUnderThreshold, hrc.CONFIG.maxWaterTemperature, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature - 1, hrc.SWITCH_STATUS.ON_ENERGY);
assert(excessEnergyUnderThreshold, hrc.CONFIG.maxWaterTemperature - 1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY);
console.log("test min water temperature")
assert(0, minWaterTemperature, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, minWaterTemperature - 1, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(1000, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(-1000, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(excessEnergyUnderThreshold, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(excessEnergyOverThreshold, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, minWaterTemperature +1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY)
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
    console.assert(result === null);
});

function assert(wattGridUsage, currentWaterTemperature, expectedResult, switchOn = false) {
    assertMeanLast(wattGridUsage, wattGridUsage, currentWaterTemperature, expectedResult, switchOn);
}

function assertMeanLast(wattGridUsageMean, wattGridUsageLast, currentWaterTemperature, expectedResult, switchOn) {
    result = hrc.determineNewSwitchStatus(wattGridUsageMean, wattGridUsageLast, currentWaterTemperature, switchOn)
    // this is necessary because in night hours we get different result
    assertSwitchStatus(result, defaultStatus ? defaultStatus : expectedResult);
}

function assertSwitchStatus(result, expected) {
    console.assert(result === expected, "Expected: " + JSON.stringify(expected) + " but got " + JSON.stringify(result));
}