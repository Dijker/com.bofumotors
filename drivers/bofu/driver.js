'use strict';

const Homey = require('homey');
const RFDriver = require('homey-rfdriver');
const util = RFDriver.util;

module.exports = class BofuDriver extends RFDriver.Driver {

    onRFInit() {
        const tiltFlowAction = ((Homey.app.manifest.flow || {}).actions || [])
            .find(card =>
                card.id.startsWith('tilt') &&
                (card.args || []).some(arg =>
                    arg.type === 'device' && arg.filter && arg.filter.includes(`driver_id=${this.id}`)
                )
            );
        const myFlowAction = ((Homey.app.manifest.flow || {}).actions || [])
            .find(card =>
                card.id.startsWith('my') &&
                (card.args || []).some(arg =>
                    arg.type === 'device' && arg.filter && arg.filter.includes(`driver_id=${this.id}`)
                )
            );
        if (tiltFlowAction) {
            this.onTiltAction = new Homey.FlowCardAction(tiltFlowAction.id);
            this.onTiltAction
                .register()
                .registerRunListener((args, state) =>
                    this.triggerCapability(args.device, `windowcoverings_tilt_${args.direction}`, true, args.steps)
                );
        }
        if (myFlowAction) {
            this.onMyAction = new Homey.FlowCardAction(myFlowAction.id);
            this.onMyAction
                .register()
                .registerRunListener((args, state) =>
                    args.device.send({ cmd: 'my', windowcoverings_state: 'idle' })
                );
        }
    }

    triggerCapability(device, capability, value, times) {
        return (device.triggerCapabilityListener(capability, value) || new Promise(res => setTimeout(res, 500)))
            .then((res) => {
                times--;
                if (times) {
                    return this.triggerCapability(device, capability, value, times);
                }
                return res;
            });
    }
};
