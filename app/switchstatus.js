const CONFIG = require('./config').CONFIG

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
    OFF_PRIMARY_SOURCE_ACTIVE: {on: false, status: -6, message: "Off due to too another appliance is enabled and producing hot water", timerPeriod: CONFIG.timerPeriodOffPrimarySourceActive},
    OFF_LOW_BATTERY_CHARGE: {on: false, status: -7, message: "Off due to too low battery charge", timerPeriod: CONFIG.timerPeriodOffLowBatteryCharge},
};

module.exports = {SWITCH_STATUS}