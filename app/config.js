const MINUTE = 1000 * 60;

const getNumber = (val, defaultVal) => {
    const num = Number(val);
    return !isNaN(num) ? num : defaultVal;
};

const getBool = (val, defaultVal = false) => {
    return val !== undefined ? String(val).toLowerCase() === "true" : defaultVal;
};

const CONFIG = {};

const updateConfig = () => {
    const month = new Date().getMonth() + 1; // 1-12
    // winter is between october and march
    const season = (month >= 10 || month <= 3) ? 'WINTER' : 'SUMMER';

    const getVal = (envName, defaultVal, type = 'number') => {
        const envVal = process.env[`${envName}_${month}`] || process.env[`${envName}_${season}`] || process.env[envName];
        
        if (type === 'boolean') return getBool(envVal, defaultVal);
        if (type === 'number') return getNumber(envVal, defaultVal);
        return envVal || defaultVal;
    };

    Object.assign(CONFIG, {
        offWhenPrimarySourceActive: getVal('OFF_WHEN_PRIMARY_SOURCE_ACTIVE', false, 'boolean'),
        wattThresholdToSwitchOn: getVal('WATT_THRESHOLD_TO_SWITCH_ON', 3000),
        wattThresholdToSwitchOff: getVal('WATT_THRESHOLD_TO_SWITCH_OFF', 0),
        wattZeroGridUsageOffset: getVal('WATT_GRID_USAGE_IN_OFFSET', 0),
        minBatteryCharge: getVal('MIN_BATTERY_CHARGE', 0),
        minBatteryChargeDelta: getVal('MIN_BATTERY_CHARGE_DELTA', 10),
        availableEnergyOffsetFallback: getVal('AVAILABLE_ENERGY_OFFSET_FALLBACK', 1000),
        minWaterTemperature: getVal('MIN_WATER_TEMPERATURE', 40),
        maxWaterTemperature: getVal('MAX_WATER_TEMPERATURE', 70),
        maxWaterTemperatureFallback: getVal('MAX_WATER_TEMPERATURE_FALLBACK', 60),
        maxWaterTemperatureDelta: getVal('MAX_WATER_TEMPERATURE_DELTA', 5),
        
        startHour: getVal('START_HOUR', 6),
        endHour: getVal('END_HOUR', 19),

        startHourFallback: getVal('START_HOUR_FALLBACK', 13),
        endHourFallback: getVal('END_HOUR_FALLBACK', 17),

        influxHost: getVal('INFLUX_HOST', "tig", 'string'),
        influxBaseUrl: getVal('INFLUX_BASE_URL', "http://tig:8086", 'string'),
        influxToken: getVal('INFLUX_TOKEN', undefined, 'string'),
        influxSendStatus: getVal('INFLUX_SEND_STATUS', true, 'boolean'),

        inverterPowerFlowUrl: getVal('INVERTER_POWER_FLOW_URL', "http://inverter.localdomain/solar_api/v1/GetPowerFlowRealtimeData.fcgi", 'string'),
        wattpilotMetricsUrl: getVal('WATTPILOT_METRICS_URL', "http://microservices.localdomain:9101/metrics", 'string'),

        switch0Host: getVal('SWITCH0_HOST', "heatingrod.localdomain", 'string'),
        switch0ApiVersion: getVal('SWITCH0_API_VERSION', 2),

        timerPeriodOnFallback: getVal('TIMER_PERIOD_ON_FALLBACK', MINUTE / 2),
        timerPeriodOnLowTemperature: getVal('TIMER_PERIOD_ON_LOW_TEMPERATURE', 30 * MINUTE),
        timerPeriodOnEnergy: getVal('TIMER_PERIOD_ON_ENERGY', MINUTE / 2),
        timerPeriodOffLowEnergy: getVal('TIMER_PERIOD_OFF_LOW_ENERGY', 10 * MINUTE),
        timerPeriodOffHighTemperature: getVal('TIMER_PERIOD_OFF_HIGH_TEMPERATURE', 10 * MINUTE),
        timerPeriodOffNight: getVal('TIMER_PERIOD_OFF_NIGHT', 60 * MINUTE),
        timerPeriodManually: getVal('TIMER_PERIOD_MANUALLY', 60 * MINUTE),
        timerPeriodOffFallback: getVal('TIMER_PERIOD_OFF_FALLBACK', 10 * MINUTE),
        timerPeriodOffPrimarySourceActive: getVal('TIMER_PERIOD_OFF_PRIMARY_SOURCE_ACTIVE', 12 * 60 * MINUTE),
        timerPeriodOffLowBatteryCharge: getVal('TIMER_PERIOD_OFF_LOW_BATTERY_CHARGE', 10 * MINUTE),
    });
};

// Initial load
updateConfig();

// Refresh config regularly to handle month/season changes without restart
if (typeof setInterval !== 'undefined') {
    const interval = setInterval(updateConfig, 24 * 60 * MINUTE);
    if (interval.unref) {
        interval.unref();
    }
}

module.exports = { CONFIG };
