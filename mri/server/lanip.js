// LAN IPv4 of this machine, so a player on the same box as the server gets a QR code a phone can open.
(() => {
    const os = require('node:os');
    const register = typeof exports === 'function' ? exports : global.exports;

    register('mriLanAddress', () => {
        for (const list of Object.values(os.networkInterfaces())) {
            for (const entry of list || []) {
                if (entry.family === 'IPv4' && !entry.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) {
                    return entry.address;
                }
            }
        }
        return null;
    });
})();
