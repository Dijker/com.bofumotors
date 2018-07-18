'use strict';

const Homey = require('homey');
const RFDriver = require('homey-rfdriver');
const util = RFDriver.util;

module.exports = class BofuDriver extends RFDriver.Driver {

    onRFInit() {
        const myFlowAction = new Homey.FlowCardAction('my_bofu').register()
            .registerRunListener( (args, state) => {
                args.device.send({cmd: 'my', windowcoverings_state: 'idle'});
            });
    }
};
