'use strict';

const Homey = require('homey');
const util = require('homey-rfdriver').util;
const path = require('path');

const commandToStateMap = new Map([
    [0xC, 'up'],
    [0x1, 'down'],
    [0x5, 'idle'],
    [0x4, 'confirm'],
    [0x2, 'set_limit'],
]);
const stateToCommandMap = new Map([...commandToStateMap].map(entry => entry.reverse()));

module.exports = RFDevice => class BofuDevice extends RFDevice {

    onRFInit() {
        super.onRFInit();
        this.clearFromEmptySendObject = ['tilt', 'direction', 'cmd'];
    }

    sendProgramSignal() {
        return this.send({ cmd: 'idle' });
    }

    onSend(data, payload, frame) {
        // This "Hack" is needed for now to fix the animation in the pair wizard
        if (this.isPairInstance) {
            if (data.windowcoverings_state) {
                Object.assign(
                    frame,
                    this.getEmptyCapabilitiesObject(),
                    {
                        windowcoverings_state: data.windowcoverings_state,
                        tilt: undefined,
                    },
                    data.windowcoverings_state === 'idle' ? { cmd: 'idle' } : { direction: data.windowcoverings_state }
                );
            } else if (data.windowcoverings_tilt_up || data.windowcoverings_tilt_down) {
                Object.assign(
                    frame,
                    {
                        tilt: data.windowcoverings_tilt_up ? 'up' : 'down',
                    }
                );
            }
        }
        super.onSend(data, payload, frame);
    }

    assembleDeviceObject() {
        const deviceObject = super.assembleDeviceObject();
        if (!deviceObject) return deviceObject;

        deviceObject.name = Homey.__('device.name');
        deviceObject.icon = `/app/${Homey.manifest.id}/drivers/${this.driver.id}/assets/icons/covering_icon.svg`;
        return deviceObject;
    }

    parseIncomingData(data) {
        if (this.isPairInstance) {
            if (data.windowcoverings_state && data.windowcoverings_state !== 'idle') {
                data.direction = data.windowcoverings_state;
            }
            if (data.windowcoverings_tilt_up || data.windowcoverings_tilt_down) {
                data.tilt = data.windowcoverings_tilt_up ? 'up' : 'down';
            }
        }

        // If the rotated setting is set we invert the up/down axis of all incoming data
        if (this.getSetting('rotated') === '180') {
            if (data.cmd === 'up' || data.cmd === 'down') {
                data.cmd = data.cmd === 'up' ? 'down' : 'up';
            }
            if (data.windowcoverings_state === 'up' || data.windowcoverings_state === 'down') {
                const virtualDirection = data.windowcoverings_state === 'up' ? 'down' : 'up';
                data = Object.assign({}, data, { windowcoverings_state: virtualDirection, direction: virtualDirection });
            }
            if (data.windowcoverings_tilt_up) {
                data = Object.assign({}, data, {
                    windowcoverings_tilt_down: true,
                    windowcoverings_tilt_up: undefined,
                    tilt: 'down',
                });
            } else if (data.windowcoverings_tilt_down) {
                data = Object.assign({}, data, {
                    windowcoverings_tilt_up: true,
                    windowcoverings_tilt_down: undefined,
                    tilt: 'up',
                });
            }
        }

        if (this.getSetting('invert_tilt')) {
            if (data.windowcoverings_tilt_up) {
                data = Object.assign({}, data, {
                    windowcoverings_tilt_down: true,
                    windowcoverings_tilt_up: undefined,
                    tilt: 'down',
                });
            } else if (data.windowcoverings_tilt_down) {
                data = Object.assign({}, data, {
                    windowcoverings_tilt_up: true,
                    windowcoverings_tilt_down: undefined,
                    tilt: 'up',
                });
            }
        }
        return data;
    }

    parseOutgoingData(data) {
        if (data.cmd === 'my') {
            data.windowcoverings_state = 'idle';
            delete data.cmd;
        }

        // If the rotated setting is set we invert the up/down axis of all outgoing data.
        if (!this.isPairInstance && this.getSetting('rotated') === '180') {
            if (data.cmd === 'up' || data.cmd === 'down') {
                data = Object.assign({}, data, { cmd: data.cmd === 'up' ? 'down' : 'up' });
            } else if (data.cmd === 'deep_up' || data.cmd === 'deep_down') {
                data = Object.assign({}, data, { cmd: data.cmd === 'deep_up' ? 'deep_down' : 'deep_up' });
            }

            if ((data.windowcoverings_state === 'up' || data.windowcoverings_state === 'down')) {
                data = Object.assign({}, data, { windowcoverings_state: data.windowcoverings_state === 'up' ? 'down' : 'up' });
            }
            if (!this.getSetting('invert_tilt')) {
                if (data.windowcoverings_tilt_up) {
                    data = Object.assign({}, data, { windowcoverings_tilt_down: true, windowcoverings_tilt_up: undefined });
                } else if (data.windowcoverings_tilt_down) {
                    data = Object.assign({}, data, { windowcoverings_tilt_up: true, windowcoverings_tilt_down: undefined });
                }
            }
        } else if (this.getSetting('invert_tilt')) {
            if (data.windowcoverings_tilt_up) {
                data = Object.assign({}, data, { windowcoverings_tilt_down: true, windowcoverings_tilt_up: undefined });
            } else if (data.windowcoverings_tilt_down) {
                data = Object.assign({}, data, { windowcoverings_tilt_up: true, windowcoverings_tilt_down: undefined });
            }
        }

        return data;
    }

    static payloadToData(payload) { // Convert received data to usable variables
        const bytes = BofuDevice.payloadToByteArray(payload);

        if (BofuDevice.checkByteArrayChecksum(bytes) && commandToStateMap.has(bytes[2] >> 4)) {
            const data = {
                address: bytes[0] << 8 | bytes[1],
                unit: bytes[2] & 0xF,
                group: bytes[2] & 0xF === 0,
                cmd: commandToStateMap.get(bytes[2] >> 4),
            };

            if (data.cmd === 'up' || data.cmd === 'down') {
                if (bytes[3] >> 4 === 0x1) {
                    data.tilt = data.cmd;
                    data[`windowcoverings_tilt_${data.cmd}`] = true;
                } else {
                    data.direction = data.cmd;
                    data.windowcoverings_state = data.cmd;
                }
            } else if (data.cmd === 'idle') {
                data.windowcoverings_state = data.cmd;
            }

            data.id = data.address << 4 | data.unit;
            return data;
        }
        return null;
    }

    static dataToPayload(data) { // Convert a data object to a bit array to be send
        if (
            data &&
            data.hasOwnProperty('address')
        ) {
            let command;
            const isTiltCommand = data.windowcoverings_tilt_up || data.windowcoverings_tilt_down;
            if (isTiltCommand) {
                command = stateToCommandMap.get(data.windowcoverings_tilt_up ? 'up' : 'down');
            } else {
                command = stateToCommandMap.get(data.cmd || data.windowcoverings_state);
            }
            if (command) {
                const bytes = [
                    data.address >> 8 & 0xFF,
                    data.address & 0xFF,
                    (command << 4 | data.unit ) & 0xFF,
                    isTiltCommand ? 0x10 : 0x00,
                ];

                return bytes.concat(BofuDevice.getChecksumForByteArray(bytes))
                    .reduce(
                        (bitArray, byte) =>
                            bitArray.concat(byte.toString(2).padStart(8, 0).split('').map(Number).reverse()),
                        []
                    );
            }
        }
        return null;
    }

    static payloadToByteArray(payload) {
        return payload.reduce((res, bit, index) => {
            const byteIndex = Math.floor(index / 8);
            // Append bit in reverse order for each byte
            res[byteIndex] = [bit].concat(res[byteIndex] || []);
            return res;
        }, []).map(byte => parseInt(byte.join(''), 2));
    }

    static checkByteArrayChecksum(bytes) {
        return BofuDevice.getChecksumForByteArray(bytes.slice(0, -1)) === bytes.slice(-1)[0];
    }

    static getChecksumForByteArray(bytes) {
        return bytes.reduce((result, byte) => ((0x100 | result) - byte) & 0xFF, 0x1);
    }

    // This function is called to receive the deviceState object that is used to create a new device (Homey.addDevice)
    get deviceState() {
        const state = super.deviceState;
        // Delete "cmd" from device data object to prevent it from being used as "default value" when sending signals
        delete state.data.cmd;
        return state;
    }

    assembleSendData(sendData) {
        return Object.assign({}, super.assembleSendData(sendData), { cmd: sendData.cmd ? sendData.cmd : undefined });
    }
};