const CONFIG = require('./config').CONFIG

const SWITCH_STATUS = {
    ON_HIGH_BATTERY_CHARGE: {on: true, status: 6, message: "On high battery charge is used to cover low production", get timerPeriod() { return CONFIG.timerPeriodOnEnergy }},
    ON_FALLBACK: {on: true, status: 4, message: "On due to no value for energy production was available and time within fallback operating hours", get timerPeriod() { return CONFIG.timerPeriodOnFallback }},
    ON_MANUALLY: {on: true, status: 3, message: "On due to manual intervention", get timerPeriod() { return CONFIG.timerPeriodManually }},
    ON_LOW_TEMPERATURE: {on: true, status: 2, message: "On due to low water temperature", get timerPeriod() { return CONFIG.timerPeriodOnLowTemperature }},
    ON_ENERGY: {on: true, status: 1, message: "On due to excess energy", get timerPeriod() { return CONFIG.timerPeriodOnEnergy }},
    OFF_LOW_ENERGY: {on: false, status: 0, message: "Off due to not enough energy production", get timerPeriod() { return CONFIG.timerPeriodOffLowEnergy }},
    OFF_HIGH_TEMPERATURE: {on: false, status: -1, message: "Off due to high water temperature", get timerPeriod() { return CONFIG.timerPeriodOffHighTemperature }},
    OFF_NIGHT: {on: false, status: -2, message: "Off due time outside normal operation hours", get timerPeriod() { return CONFIG.timerPeriodOffNight }},
    OFF_MANUALLY: {on: false, status: -3, message: "Off due to manual intervention", get timerPeriod() { return CONFIG.timerPeriodManually }},
    OFF_FALLBACK: {on: false, status: -4, message: "Off due to no value for energy production was available and time outside fallback operating hours", get timerPeriod() { return CONFIG.timerPeriodOffFallback }},
    OFF_PRIMARY_SOURCE_ACTIVE: {on: false, status: -6, message: "Off due to too another appliance is enabled and producing hot water", get timerPeriod() { return CONFIG.timerPeriodOffPrimarySourceActive }},
    OFF_LOW_BATTERY_CHARGE: {on: false, status: -7, message: "Off due to too low battery charge", get timerPeriod() { return CONFIG.timerPeriodOffLowBatteryCharge }},
};

module.exports = {SWITCH_STATUS}