// Set environment variables before requiring control.js to prevent it from starting the loop
process.env.DRY_RUN = 'true';
process.env.RUN_WITH_TIMER = 'false';

const control = require('../app/control');
const { CONFIG } = require('../app/config');
const { SWITCH_STATUS } = require('../app/switchstatus');
const DataProvider = require('../app/influxdataprovider');
const axios = require('axios');

jest.mock('axios');
// Mock axios.get to return a Promise to prevent "Cannot read properties of undefined (reading 'then')"
axios.get.mockResolvedValue({ data: null });
axios.post.mockResolvedValue({ data: null });
axios.all.mockResolvedValue([]);
axios.spread.mockImplementation(callback => callback);

describe('Control Logic - determineNewSwitchStatus', () => {
    let originalConfig;
    let wattThreshold;
    let excessEnergyThreshold;
    let excessEnergyOverThreshold;
    let excessEnergyUnderThreshold;
    let minWaterTemperature;

    beforeAll(() => {
        // Save original config
        originalConfig = { ...CONFIG };
    });

    beforeEach(() => {
        // Reset config before each test
        Object.assign(CONFIG, originalConfig);
        
        // Default test values
        wattThreshold = CONFIG.wattThresholdToSwitchOn;
        excessEnergyThreshold = wattThreshold * -1;
        excessEnergyOverThreshold = excessEnergyThreshold - 1; // More excess energy (more negative)
        excessEnergyUnderThreshold = excessEnergyThreshold + 1; // Less excess energy (less negative)
        minWaterTemperature = CONFIG.minWaterTemperature;
    });

    afterAll(() => {
        Object.assign(CONFIG, originalConfig);
    });

    /**
     * Helper to run assertions with named parameters for better readability.
     * 
     * @param {Object} params
     * @param {number} [params.gridUsage] - Sets both mean and last grid usage if they are the same
     * @param {number} [params.gridUsageMean] - Specific mean grid usage
     * @param {number} [params.gridUsageLast] - Specific last grid usage
     * @param {number} params.waterTemperature - Current water temperature
     * @param {Object} params.expectedStatus - The expected SWITCH_STATUS object
     * @param {boolean} [params.switchOn=false] - Current state of the switch
     * @param {number} [params.boilerStatus=null] - Status of the primary boiler
     * @param {number} [params.batteryCharge=null] - Current battery charge percentage
     */
    const assertStatus = ({
        gridUsage,
        gridUsageMean,
        gridUsageLast,
        waterTemperature,
        expectedStatus,
        switchOn = false,
        boilerStatus = null,
        batteryCharge = null
    }) => {
        const usageMean = gridUsageMean !== undefined ? gridUsageMean : gridUsage;
        const usageLast = gridUsageLast !== undefined ? gridUsageLast : gridUsage;

        // Case 1: Direct Grid Usage
        const statusValuesDirect = DataProvider.getStatusValues(
            usageMean,
            usageLast,
            waterTemperature,
            switchOn,
            boilerStatus,
            batteryCharge
        );
        const resultDirect = control.determineNewSwitchStatus(statusValuesDirect);
        
        // Use toEqual for object comparison, checking specifically the message for clarity in failure logs
        if (resultDirect !== expectedStatus) {
             // Fallback for better error message if objects differ
             expect(resultDirect).toEqual(expectedStatus); 
        } else {
             expect(resultDirect).toBe(expectedStatus);
        }

        // Case 2: Inverter Power Flow
        // Calculate P_PV such that it results in the max of Mean/Last
        let maxUsage = usageLast;
        if (usageMean !== null && usageLast !== null) {
            maxUsage = Math.max(usageMean, usageLast);
        } else if (usageMean !== null) {
            maxUsage = usageMean;
        }
        
        if (maxUsage !== null && maxUsage !== undefined) {
            const statusValuesInverter = DataProvider.getStatusValues(
                usageMean,
                usageLast,
                waterTemperature,
                switchOn,
                boilerStatus,
                batteryCharge,
                { P_PV: maxUsage * -1, P_Load: 0 }
            );
            const resultInverter = control.determineNewSwitchStatus(statusValuesInverter);
            if (resultInverter !== expectedStatus) {
                expect(resultInverter).toEqual(expectedStatus);
            } else {
                expect(resultInverter).toBe(expectedStatus);
            }
        }
    };

    describe('Night Mode', () => {
        test('should return OFF_NIGHT when outside operating hours', () => {
            CONFIG.startHour = 24;
            CONFIG.endHour = 24;
            CONFIG.startHourFallback = -1;
            CONFIG.endHourFallback = 24;

            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: CONFIG.maxWaterTemperature + 1,
                expectedStatus: SWITCH_STATUS.OFF_NIGHT
            });
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: minWaterTemperature + 1,
                expectedStatus: SWITCH_STATUS.OFF_NIGHT
            });
        });
    });

    describe('Day Mode Tests', () => {
        beforeEach(() => {
            // Set operating hours to cover full day for these tests
            CONFIG.startHour = -1;
            CONFIG.endHour = 24;
            CONFIG.startHourFallback = -1;
            CONFIG.endHourFallback = 24;
        });

        test('Max Water Temperature Safety', () => {
            // Should turn OFF if temp is too high, regardless of energy
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: CONFIG.maxWaterTemperature + 1,
                expectedStatus: SWITCH_STATUS.OFF_HIGH_TEMPERATURE
            });
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: CONFIG.maxWaterTemperature,
                expectedStatus: SWITCH_STATUS.OFF_HIGH_TEMPERATURE
            });
            assertStatus({
                gridUsage: excessEnergyThreshold,
                waterTemperature: CONFIG.maxWaterTemperature,
                expectedStatus: SWITCH_STATUS.OFF_HIGH_TEMPERATURE
            });
            assertStatus({
                gridUsage: excessEnergyUnderThreshold,
                waterTemperature: CONFIG.maxWaterTemperature,
                expectedStatus: SWITCH_STATUS.OFF_HIGH_TEMPERATURE
            });
            
            // Should be ON_ENERGY if temp is low enough and enough energy
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });
            
            // Should be OFF_LOW_ENERGY if temp is low enough but NOT enough energy
            assertStatus({
                gridUsage: excessEnergyUnderThreshold,
                waterTemperature: CONFIG.maxWaterTemperature - CONFIG.maxWaterTemperatureDelta - 1,
                expectedStatus: SWITCH_STATUS.OFF_LOW_ENERGY
            });
        });

        test('Max Water Temperature Hysteresis (Delta)', () => {
            const tempHigh = CONFIG.maxWaterTemperature;
            const tempDelta = CONFIG.maxWaterTemperatureDelta;

            // Scenario: Switch is currently ON
            // It should stay ON until temp reaches max
            assertStatus({
                gridUsage: excessEnergyOverThreshold, // Enough energy
                gridUsageMean: -1, // Mock mean diff
                waterTemperature: tempHigh - tempDelta - 1,
                switchOn: true,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });
            
            // Still ON within delta range
            assertStatus({
                gridUsageLast: -1,
                gridUsageMean: excessEnergyOverThreshold,
                waterTemperature: tempHigh - tempDelta,
                switchOn: true,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });

            // Switch ON, temp below max -> False (Not too high) -> Check Energy -> ON
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: tempHigh - (tempDelta / 2),
                switchOn: true,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });

            // Not enough energy causes OFF
            assertStatus({
                gridUsage: 1, // Positive grid usage (consuming)
                waterTemperature: tempHigh - tempDelta,
                switchOn: true,
                expectedStatus: SWITCH_STATUS.OFF_LOW_ENERGY
            });

            // Reached Max Temp -> OFF
            assertStatus({
                gridUsage: 1,
                waterTemperature: tempHigh,
                switchOn: true,
                expectedStatus: SWITCH_STATUS.OFF_HIGH_TEMPERATURE
            });


            // Scenario: Switch is currently OFF
            // Needs to cool down by delta before allowing ON again
            
            // Temp in hysteresis zone (High - Delta < Temp < High) -> considered too high when OFF
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: tempHigh - (tempDelta / 2),
                switchOn: false,
                expectedStatus: SWITCH_STATUS.OFF_HIGH_TEMPERATURE
            });
            
            // Exactly at lower bound of hysteresis?
            // Logic: if !switchOn && current >= max - delta -> true (Too High)
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: tempHigh - tempDelta,
                switchOn: false,
                expectedStatus: SWITCH_STATUS.OFF_HIGH_TEMPERATURE
            });

            // Below hysteresis zone -> Not too high -> Check Energy -> ON
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: tempHigh - tempDelta - 1,
                switchOn: false,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });
        });

        test('Min Water Temperature (Safety Heating)', () => {
            // Should turn ON regardless of energy if water is too cold
            assertStatus({
                gridUsage: 0,
                waterTemperature: minWaterTemperature,
                expectedStatus: SWITCH_STATUS.ON_LOW_TEMPERATURE
            });
            assertStatus({
                gridUsage: 1000, // Consuming grid energy
                waterTemperature: 0,
                expectedStatus: SWITCH_STATUS.ON_LOW_TEMPERATURE
            });
            assertStatus({
                gridUsage: -1000, // Feeding in
                waterTemperature: 0,
                expectedStatus: SWITCH_STATUS.ON_LOW_TEMPERATURE
            });
            
            // If just above min temp, reverts to energy logic
            assertStatus({
                gridUsage: 0,
                waterTemperature: minWaterTemperature + 1,
                expectedStatus: SWITCH_STATUS.OFF_LOW_ENERGY
            });
            assertStatus({
                gridUsage: excessEnergyThreshold,
                waterTemperature: minWaterTemperature + 10, // Safe temp
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });
        });

        test('Energy Thresholds', () => {
            // Not enough excess energy
            assertStatus({
                gridUsage: excessEnergyUnderThreshold,
                waterTemperature: minWaterTemperature + 1,
                expectedStatus: SWITCH_STATUS.OFF_LOW_ENERGY
            });
            
            // Enough excess energy
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: minWaterTemperature + 1,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });
            
            // Exactly on threshold
            assertStatus({
                gridUsage: excessEnergyThreshold,
                waterTemperature: minWaterTemperature + 10,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });
        });

        test('Fallback Status (Missing Data)', () => {
            // No energy info provided (null)
            assertStatus({
                gridUsage: null,
                waterTemperature: minWaterTemperature + 10,
                expectedStatus: SWITCH_STATUS.ON_FALLBACK
            });
            
            // Missing energy info implies ON_FALLBACK if within fallback hours
            // One value missing
            assertStatus({
                gridUsageMean: null,
                gridUsageLast: 0,
                waterTemperature: minWaterTemperature + 1,
                switchOn: true,
                expectedStatus: SWITCH_STATUS.ON_FALLBACK
            });
             assertStatus({
                gridUsageMean: 0,
                gridUsageLast: null,
                waterTemperature: minWaterTemperature + 1,
                switchOn: true,
                expectedStatus: SWITCH_STATUS.ON_FALLBACK
            });
            
            // Fallback limits based on temperature
            assertStatus({
                gridUsage: null,
                waterTemperature: CONFIG.maxWaterTemperatureFallback + 1,
                switchOn: false,
                expectedStatus: SWITCH_STATUS.OFF_FALLBACK // Temp too high for fallback
            });
            assertStatus({
                gridUsage: null,
                waterTemperature: CONFIG.maxWaterTemperatureFallback - 1,
                switchOn: true,
                expectedStatus: SWITCH_STATUS.ON_FALLBACK
            });
        });

        test('Grid Usage Offset Configuration', () => {
            CONFIG.wattZeroGridUsageOffset = 100;
            // Logic: if wattGridUsage >= 0 && wattGridUsage <= offset
            // availableEnergy = offset.
            
            // Feed in (-101) -> ON
            assertStatus({
                gridUsage: -101,
                waterTemperature: minWaterTemperature + 1,
                switchOn: true,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });
            
            // Drawing energy (99) <= 100 offset -> Treated as available energy -> ON
            assertStatus({
                gridUsage: 99,
                waterTemperature: minWaterTemperature + 1,
                switchOn: true,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });
            
            // Drawing energy (100) == 100 offset -> ON
            assertStatus({
                gridUsage: 100,
                waterTemperature: minWaterTemperature + 1,
                switchOn: true,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });
            
            // Drawing energy (101) > 100 offset -> OFF
            assertStatus({
                gridUsage: 101,
                waterTemperature: minWaterTemperature + 1,
                switchOn: true,
                expectedStatus: SWITCH_STATUS.OFF_LOW_ENERGY
            });
        });

        test('Primary Boiler Active Interlock', () => {
            CONFIG.offWhenPrimarySourceActive = true;
            
            // Boiler is OFF (0) -> Normal Operation (ON_ENERGY)
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: CONFIG.maxWaterTemperature - 10,
                switchOn: true,
                boilerStatus: 0,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });
            
            // Boiler is ON (1) -> Force OFF
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: CONFIG.maxWaterTemperature - 10,
                switchOn: true,
                boilerStatus: 1,
                expectedStatus: SWITCH_STATUS.OFF_PRIMARY_SOURCE_ACTIVE
            });
            
            // Boiler is ON (2) -> Force OFF
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: CONFIG.maxWaterTemperature - 10,
                switchOn: true,
                boilerStatus: 2,
                expectedStatus: SWITCH_STATUS.OFF_PRIMARY_SOURCE_ACTIVE
            });
        });

        test('Battery Charge Constraints', () => {
            CONFIG.minBatteryCharge = 25;
            
            // Charge (12.6) < Min (25) -> Force OFF
            assertStatus({
                gridUsage: excessEnergyOverThreshold, // Even with excess energy
                waterTemperature: CONFIG.maxWaterTemperature - 10,
                switchOn: true,
                batteryCharge: 12.6,
                expectedStatus: SWITCH_STATUS.OFF_LOW_BATTERY_CHARGE
            });
            
            // Charge (25) >= Min (25) -> Normal Operation
            assertStatus({
                gridUsage: excessEnergyOverThreshold,
                waterTemperature: CONFIG.maxWaterTemperature - 10,
                switchOn: true,
                batteryCharge: 25,
                expectedStatus: SWITCH_STATUS.ON_ENERGY
            });
        });
        
        test('High Battery Charge Discharge Logic', () => {
            CONFIG.minBatteryCharge = 80;
            CONFIG.minBatteryChargeDelta = 10;
            
            // Charge (91) > Min (80) + Delta (10) -> Discharge allowed
            // Even if grid usage is high (999 consuming), we use battery
            assertStatus({
                gridUsage: 999,
                waterTemperature: CONFIG.maxWaterTemperature - 10,
                switchOn: true,
                batteryCharge: 91,
                expectedStatus: SWITCH_STATUS.ON_HIGH_BATTERY_CHARGE
            });
            
            // Charge (79) < Min (80) -> Force OFF (Low Battery)
            assertStatus({
                gridUsage: excessEnergyUnderThreshold,
                waterTemperature: CONFIG.maxWaterTemperature - 10,
                switchOn: true,
                batteryCharge: 79,
                expectedStatus: SWITCH_STATUS.OFF_LOW_BATTERY_CHARGE
            });
        });
    });
});