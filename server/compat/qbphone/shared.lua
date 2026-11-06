---@type table Player bridge (bridge.server.player): character and acting-identity lookups.
local player = require 'bridge.server.player'

---@type table Shared helpers for the qb-phone compat shim; the table returned at end of file.
local shim = {}

---@type table<string, boolean> Warn keys that already printed.
local warned = {}

---@type any[] AddEventHandler cookies for every export and event handler the shim registered.
local cookies = {}

---@type boolean Set once the real qb-phone took its name back; background work checks it to stop.
shim.stopped = false

---Registers a function on the server export registry under the qb-phone resource name. The handler
---cookie is collected for later deregistration.
---@param name string qb-phone export name, verbatim including its casing
---@param fn function implementation
function shim.registerExport(name, fn)
    cookies[#cookies + 1] = AddEventHandler(('__cfx_export_qb-phone_%s'):format(name), function(setCB)
        setCB(fn)
    end)
end

---Registers a handler for one of qb-phone's server events, reachable from clients when `net` is
---true. The cookie is collected so a real qb-phone starting later takes the event back.
---@param name string event name, spelled exactly as qb-phone registers it
---@param fn function handler
---@param net boolean whether a client may trigger it
function shim.onEvent(name, fn, net)
    if net then RegisterNetEvent(name) end
    cookies[#cookies + 1] = AddEventHandler(name, fn)
end

---Removes every export and event handler the shim registered. Idempotent.
function shim.deregisterAll()
    for i = 1, #cookies do
        RemoveEventHandler(cookies[i])
    end
    cookies = {}
    shim.stopped = true
end

---Prints one console breadcrumb the first time `key` is hit; subsequent hits are silent.
---@param key string dedupe key
---@param msg string message printed after the '[sd-phone] qb-phone compat:' prefix
function shim.warnOnce(key, msg)
    if warned[key] then return end
    warned[key] = true
    print(('^3[sd-phone]^0 qb-phone compat: %s'):format(msg))
end

---The resource that called into the shim, for warnings.
---@return string
function shim.invoker()
    return GetInvokingResource() or 'unknown'
end

---Whether the event being handled came from a server-side trigger rather than a player's client.
---@param src any the ambient event source
---@return boolean
function shim.fromServer(src)
    local n = tonumber(src) or 0
    return n <= 0 or GetPlayerName(n) == nil
end

---A live player's server id from anything a caller might pass as a source; nil when offline.
---@param source any
---@return number|nil
function shim.source(source)
    local src = tonumber(source)
    if not src or not GetPlayerName(src) then return nil end
    return src
end

---A caller value as display text: strings pass through, numbers are formatted, anything else is ''.
---@param v any
---@return string
function shim.text(v)
    if type(v) == 'number' then return tostring(v) end
    return type(v) == 'string' and v or ''
end

---Plain text from qb-phone's HTML mail bodies: line breaks kept, tags dropped, common entities
---decoded.
---@param v any
---@return string
function shim.htmlToText(v)
    local s = shim.text(v)
    if s == '' then return s end
    s = s:gsub('<%s*[Bb][Rr]%s*/?%s*>', '\n')
    s = s:gsub('</%s*[Pp]%s*>', '\n\n'):gsub('</%s*[Dd][Ii][Vv]%s*>', '\n')
    s = s:gsub('<[^>]*>', '')
    s = s:gsub('&nbsp;', ' '):gsub('&lt;', '<'):gsub('&gt;', '>'):gsub('&quot;', '"'):gsub('&#39;', "'")
    s = s:gsub('&amp;', '&')
    s = s:gsub('\n\n\n+', '\n\n')
    return (s:gsub('^%s+', ''):gsub('%s+$', ''))
end

---The data identity phone content for a character lands under: the phone they are holding while
---online, the citizenid itself otherwise. The two only differ with unique phones on.
---@param citizenid string framework character id
---@return string identity
---@return number|nil source the character's server id when online
function shim.identityOf(citizenid)
    local src = player.getSourceByRealIdentifier(citizenid)
    return (src and player.getIdentifier(src)) or citizenid, src
end

return shim
