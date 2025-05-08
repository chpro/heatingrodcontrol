const axios = require('axios');

const ShellySwitchV2 = {
    turnOn: function () {
        set(true);
    },
    turnOff: function () {
        set(false);
    },
    set: function (on) {
        axios.get("http://" + this.host + "/rpc/Switch.Set?id=" + this.id + "&on=" + on)
        .catch(err => {
            console.log(new Date(), err);
        });
    },
    get: function(callback) {
        // console.log(new Date(), "Getting switch status: http://" + this.host + "/rpc/Switch.GetStatus?id=" + this.id);
        axios.get("http://" + this.host + "/rpc/Switch.GetStatus?id=" + this.id)
        .then(function(result) {callback(result.data === null ? null : result.data.output === true)})
        .catch(err => {
            console.log(new Date(), err);
        });
    },
};

const ShellySwitchV1 = {
    turnOn: function () {
        set(true);
    },
    turnOff: function () {
        set(false);
    },

    // http://plug-01/relay/0?turn=on
    set: function (on) {
        console.log(new Date(), "Setting switch http://" + this.host + "/relay/" + this.id + "?turn=" + (on ? "on" : "off"));
        axios.get("http://" + this.host + "/relay/" + this.id + "?turn=" + (on ? "on" : "off"))
        .catch(err => {
            console.log(new Date(), err);
        });
    },
    get: function(callback) {
        // console.log(new Date(), "Getting switch status: http://" + this.host + "/relay/" + this.id);
        axios.get("http://" + this.host + "/relay/" + this.id)
        .then(function(result) {callback(result.data === null ? null : result.data.ison === true)})
        .catch(err => {
            console.log(new Date(), err);
        });
    },
};

function getSwitch(id, host, apiVersion = 2) {
    let o = Object.create(apiVersion == 1 ? ShellySwitchV1 : ShellySwitchV2);
    o.id = id;
    o.host = host
    return o;
};

module.exports = {getSwitch}