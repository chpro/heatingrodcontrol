const MINUTE = 1000 * 60;

const getNumber = (val, defaultVal) => {
    const num = Number(val);
    return !isNaN(num) ? num : defaultVal;
};

const getBool = (val, defaultVal = false) => {
    return val !== undefined ? String(val).toLowerCase() === "true" : defaultVal;
};

const CONFIG = {
    offWhenPrimarySourceActive: getBool(process.env.OFF_WHEN_PRIMARY_SOURCE_ACTIVE, false),
    wattThresholdToSwitchOn: getNumber(process.env.WATT_THRESHOLD_TO_SWITCH_ON, 3000),
    wattThresholdToSwitchOff: getNumber(process.env.WATT_THRESHOLD_TO_SWITCH_OFF, 0),
    wattZeroGridUsageOffset: getNumber(process.env.WATT_GRID_USAGE_IN_OFFSET, 0),
    minBatteryCharge: getNumber(process.env.MIN_BATTERY_CHARGE, 0), // set to 0 do deactivate check
    minBatteryChargeDelta: getNumber(process.env.MIN_BATTERY_CHARGE_DELTA, 10),
    availableEnergyOffsetFallback: getNumber(process.env.AVAILABLE_ENERGY_OFFSET_FALLBACK, 1000), // should be wattThresholdToSwitchOn * energy sell / energy buy
    minWaterTemperature: getNumber(process.env.MIN_WATER_TEMPERATURE, 40),
    maxWaterTemperature: getNumber(process.env.MAX_WATER_TEMPERATURE, 70),
    maxWaterTemperatureFallback: getNumber(process.env.MAX_WATER_TEMPERATURE_FALLBACK, 60),
    maxWaterTemperatureDelta: getNumber(process.env.MAX_WATER_TEMPERATURE_DELTA, 5),
    
    // the time span which normal operation is permitted
    startHour: getNumber(process.env.START_HOUR, 6),
    endHour: getNumber(process.env.END_HOUR, 19),

    // the time span which fallback operation is permitted
    startHourFallback: getNumber(process.env.START_HOUR_FALLBACK, 13),
    endHourFallback: getNumber(process.env.END_HOUR_FALLBACK, 17),

    // INFLUX host and tokens
    influxHost: process.env.INFLUX_HOST || "tig",
    influxBaseUrl: process.env.INFLUX_BASE_URL || "http://tig:8086",
    influxToken: process.env.INFLUX_TOKEN,
    influxSendStatus: getBool(process.env.INFLUX_SEND_STATUS, true),

    inverterPowerFlowUrl: process.env.INVERTER_POWER_FLOW_URL || "http://inverter.localdomain/solar_api/v1/GetPowerFlowRealtimeData.fcgi",
    wattpilotMetricsUrl: process.env.WATTPILOT_METRICS_URL || "http://microservices.localdomain:9101/metrics",

    // shelly switch
    switch0Host: process.env.SWITCH0_HOST || "heatingrod.localdomain",
    switch0ApiVersion: getNumber(process.env.SWITCH0_API_VERSION, 2),

    // timer periods are given in milliseconds
    timerPeriodOnFallback: getNumber(process.env.TIMER_PERIOD_ON_FALLBACK, MINUTE / 2),
    timerPeriodOnLowTemperature: getNumber(process.env.TIMER_PERIOD_ON_LOW_TEMPERATURE, 30 * MINUTE),
    timerPeriodOnEnergy: getNumber(process.env.TIMER_PERIOD_ON_ENERGY, MINUTE / 2),
    timerPeriodOffLowEnergy: getNumber(process.env.TIMER_PERIOD_OFF_LOW_ENERGY, 10 * MINUTE),
    timerPeriodOffHighTemperature: getNumber(process.env.TIMER_PERIOD_OFF_HIGH_TEMPERATURE, 10 * MINUTE),
    timerPeriodOffNight: getNumber(process.env.TIMER_PERIOD_OFF_NIGHT, 60 * MINUTE),
    timerPeriodManually: getNumber(process.env.TIMER_PERIOD_MANUALLY, 60 * MINUTE),
    timerPeriodOffFallback: getNumber(process.env.TIMER_PERIOD_OFF_FALLBACK, 10 * MINUTE),
    timerPeriodOffPrimarySourceActive: getNumber(process.env.TIMER_PERIOD_OFF_PRIMARY_SOURCE_ACTIVE, 12 * 60 * MINUTE),
    timerPeriodOffLowBatteryCharge: getNumber(process.env.TIMER_PERIOD_OFF_LOW_BATTERY_CHARGE, 10 * MINUTE),
};

module.exports = { CONFIG };
