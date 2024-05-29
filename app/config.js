const MINUTE = 1000*60;
const CONFIG = {
    offWhenPrimarySourceActive: process.env.OFF_WHEN_PRIMARY_SOURCE_ACTIVE !== undefined && process.env.OFF_WHEN_PRIMARY_SOURCE_ACTIVE.toLowerCase() === "true",
    wattThresholdToSwitchOn: Number(process.env.WATT_THRESHOLD_TO_SWITCH_ON) || 3000,
    wattThresholdToSwitchOff: Number(process.env.WATT_THRESHOLD_TO_SWITCH_OFF) || 0,
    wattZeroGridUsageOffset: Number(process.env.WATT_GRID_USAGE_IN_OFFSET) || 0,
    minBatteryCharge: Number(process.env.MIN_BATTERY_CHARGE) || 0, // set to 0 do deactivate check
    minBatteryChargeDelta: Number(process.env.MIN_BATTERY_CHARGE_DELTA) || 10,
    availableEnergyOffsetFallback: Number(process.env.AVAILABLE_ENERGY_OFFSET_FALLBACK) || 1000, // should be wattThresholdToSwitchOn * energy sell / energy buy
    minWaterTemperature: Number(process.env.MIN_WATER_TEMPERATURE) || 40,
    maxWaterTemperature: Number(process.env.MAX_WATER_TEMPERATURE) || 70,
    maxWaterTemperatureFallback: Number(process.env.MAX_WATER_TEMPERATURE_FALLBACK) || 60,
    maxWaterTemperatureDelta: Number(process.env.MAX_WATER_TEMPERATURE_DELTA) || 5,
    // the time span which normal operation is permitted
    startHour: Number(process.env.START_HOUR) || 6,
    endHour: Number(process.env.END_HOUR) || 19,

    // the time span which fallback operation is permitted
    startHourFallback: Number(process.env.START_HOUR_FALLBACK) || 13,
    endHourFallback: Number(process.env.END_HOUR_FALLBACK) || 17,

    // INFLUX host and tokens
    influxHost: process.env.INFLUX_HOST || "tig",
    influxBaseUrl: process.env.INFLUX_BASE_URL || "http://tig:8086",
    influxToken: process.env.INFLUX_TOKEN,
    inverterPowerFlowUrl: process.env.INVERTER_POWER_FLOW_URL || "http://inverter.localdomain/status/powerflow",

    // shelly switch
    switch0Host: process.env.SWITCH0_HOST || "heatingrod.localdomain",

    // timer periods are given in milliseconds
    timerPeriodOnFallback: Number(process.env.TIMER_PERIOD_ON_FALLBACK) || MINUTE / 2,
    timerPeriodOnLowTemperature: Number(process.env.TIMER_PERIOD_ON_LOW_TEMPERATURE) || 30 * MINUTE,
    timerPeriodOnEnergy: Number(process.env.TIMER_PERIOD_ON_ENERGY) || MINUTE / 2,
    timerPeriodOffLowEnergy: Number(process.env.TIMER_PERIOD_OFF_LOW_ENERGY) || 10 * MINUTE,
    timerPeriodOffHighTemperature: Number(process.env.TIMER_PERIOD_OFF_HIGH_TEMPERATURE) || 10 * MINUTE,
    timerPeriodOffNight: Number(process.env.TIMER_PERIOD_OFF_NIGHT) || 60 * MINUTE,
    timerPeriodManually: Number(process.env.TIMER_PERIOD_MANUALLY) || 60 * MINUTE,
    timerPeriodOffFallback: Number(process.env.TIMER_PERIOD_OFF_FALLBACK) || 10 * MINUTE,
    timerPeriodOffPrimarySourceActive: Number(process.env.TIMER_PERIOD_OFF_PRIMARY_SOURCE_ACTIVE) || 12 * 60 * MINUTE,
    timerPeriodOffLowBatteryCharge: Number(process.env.TIMER_PERIOD_OFF_LOW_BATTERY_CHARGE) || 10 * MINUTE,
};

module.exports = {CONFIG}