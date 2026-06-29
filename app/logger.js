const log = (...args) => {
    console.log(new Date(), ...args);
};

const error = (...args) => {
    console.error(new Date(), ...args);
};

module.exports = { log, error };
