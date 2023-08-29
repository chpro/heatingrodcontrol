const hrc = require('./control')
const express = require('express')
const cors = require('cors')
const ws = express()
const port = 3000


var corsOptions = {
    origin: 'http://tig:3000',
    credentials: true,
}
ws.use(cors(corsOptions))

ws.get('/config', (req, res) => {
    res.json({"config": hrc.CONFIG, "status": hrc.SWITCH_STATUS})
})

ws.get('/switchStatus', (req, res) => {
    hrc.switch0.get(function(result) {
        res.json({"Result": result})
    });
})

ws.post('/reset', (req, res) => {
    hrc.update()
    res.send()
})

ws.post('/on', (req, res) => {
    hrc.setNewSwitchStatus(hrc.SWITCH_STATUS.ON_MANUALLY)
    res.send()
})

ws.post('/off', (req, res) => {
    hrc.setNewSwitchStatus(hrc.SWITCH_STATUS.OFF_MANUALLY)
    res.send()
})

ws.listen(port, () => {
    console.log(new Date(), `Heatingrod webserver is listening on port ${port}`)
})

module.exports = {ws}