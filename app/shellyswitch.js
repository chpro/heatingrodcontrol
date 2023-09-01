const axios = require('axios');

const ShellySwitch = {
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

function getSwitch(id, host) {
    let o = Object.create(ShellySwitch);
    o.id = id;
    o.host = host
    return o;
};

module.exports = {getSwitch}