const hrc = require('./heatingrodcontrol');
let wattThreshold = hrc.CONFIG.wattThresholdSwitchOn;
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

console.log("test max water temperature")
assert(excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature + 1, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyThreshold, hrc.CONFIG.maxWaterTemperature, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyUnderThreshold, hrc.CONFIG.maxWaterTemperature, hrc.SWITCH_STATUS.OFF_HIGH_TEMPERATURE);
assert(excessEnergyOverThreshold, hrc.CONFIG.maxWaterTemperature - 1, hrc.SWITCH_STATUS.ON_ENERGY);
assert(excessEnergyUnderThreshold, hrc.CONFIG.maxWaterTemperature - 1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY);
console.log("test min water temperature")
assert(0, minWaterTemperature, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, minWaterTemperature -1, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(1000, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(-1000, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(excessEnergyUnderThreshold, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(excessEnergyOverThreshold, 0, hrc.SWITCH_STATUS.ON_LOW_TEMPERATURE)
assert(0, minWaterTemperature +1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY)
console.log("test watt threshold")
assert(excessEnergyUnderThreshold, minWaterTemperature +1, hrc.SWITCH_STATUS.OFF_LOW_ENERGY)
assert(excessEnergyOverThreshold, minWaterTemperature +1, hrc.SWITCH_STATUS.ON_ENERGY)
assert(excessEnergyThreshold, minWaterTemperature +10, hrc.SWITCH_STATUS.ON_ENERGY)
// this is also the the test for query fallBackValues
assert(null, minWaterTemperature +10, hrc.SWITCH_STATUS.ON_FALLBACK)

// check logic when switch is on
assert(excessEnergyUnderThreshold, minWaterTemperature +1, hrc.SWITCH_STATUS.ON_ENERGY, true)
assert(excessEnergyOverThreshold, minWaterTemperature +1, hrc.SWITCH_STATUS.ON_ENERGY, true)


function assert(wattGridUsage, currentWaterTemperature, expectedResult, switchOn = false) {
    result = hrc.determineNewSwitchStatus(wattGridUsage, currentWaterTemperature, switchOn)
    // this is necessary because in night hours we get different result
    assertSwitchStatus(result, defaultStatus ? defaultStatus : expectedResult);
}

function assertSwitchStatus(result, expected) {
    console.assert(result == expected, "Expected: " + JSON.stringify(expected) + " but got " + JSON.stringify(result));
}