const axios = require('axios');
const { log, error } = require('./logger');

class ShellySwitch {
    constructor(id, host, apiVersion = 2) {
        this.id = id;
        this.host = host;
        this.apiVersion = apiVersion;
    }

    async turnOn() {
        return this.set(true);
    }

    async turnOff() {
        return this.set(false);
    }

    async set(on) {
        const url = this.apiVersion === 1 
            ? `http://${this.host}/relay/${this.id}?turn=${on ? "on" : "off"}`
            : `http://${this.host}/rpc/Switch.Set?id=${this.id}&on=${on}`;

        log(`Setting switch ${url}`);
        try {
            await axios.get(url);
        } catch (err) {
            error(`Error setting switch ${url}:`, err.message);
        }
    }

    async get() {
        const url = this.apiVersion === 1
            ? `http://${this.host}/relay/${this.id}`
            : `http://${this.host}/rpc/Switch.GetStatus?id=${this.id}`;

        log(`Getting switch status: ${url}`);
        try {
            const result = await axios.get(url);
            
            if (!result || result.data === null || result.data === undefined) {
                log(`Invalid response from switch ${url}: result or data is null/undefined`);
                return null;
            }
            
            return this.apiVersion === 1 
                ? result.data.ison === true 
                : result.data.output === true;
        } catch (err) {
            error(`Error getting switch status ${url}:`, err.message);
            return null;
        }
    }
}

function getSwitch(id, host, apiVersion = 2) {
    return new ShellySwitch(id, host, apiVersion);
}

module.exports = { getSwitch };