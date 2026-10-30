// IPv4 adapters of this machine, so the player picks the one the phone can reach.
(() => {
    const os = require('node:os');
    const register = typeof exports === 'function' ? exports : global.exports;
    const isPrivate = address => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
    const isVirtual = name => /vethernet|wsl|hyper-v|virtualbox|vmware|docker|loopback|bluetooth/i.test(name);

    register('mriLanAddresses', () => {
        const found = [];
        for (const [name, list] of Object.entries(os.networkInterfaces())) {
            for (const entry of list || []) {
                if (entry.family === 'IPv4' && !entry.internal) found.push({ name, address: entry.address });
            }
        }
        const rank = item => (isPrivate(item.address) ? 0 : 2) + (isVirtual(item.name) ? 1 : 0);
        return found.sort((a, b) => rank(a) - rank(b));
    });
})();
