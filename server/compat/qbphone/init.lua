local compatConvar = GetConvar('sd_phone_qbphonecompat', 'true')
if compatConvar == 'false' or compatConvar == '0' then return end

---Whether a started resource named qb-phone is an sd-phone name-holder stub rather than the real one.
---@return boolean
local function isShimQbPhone()
    return GetResourceMetadata('qb-phone', 'sd_phone_shim', 0) == 'yes'
end

---Whether a REAL resource named qb-phone exists on this server. sd-phone holds the name through
---`provide`, so a GetResourceState check alone would find itself; the resource list is enumerated.
---@return boolean
local function hasRealQbPhone()
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == 'qb-phone' then return not isShimQbPhone() end
    end
    return false
end

if hasRealQbPhone() then
    local state = GetResourceState('qb-phone')
    if state == 'started' or state == 'starting' then
        print('^3[sd-phone]^0 qb-phone compat: the real qb-phone resource is running, so the compat layer is NOT answering its events and exports. Stop or remove qb-phone to let sd-phone answer for it.')
        return
    end
end

---@type table Shared shim helpers (server.compat.qbphone.shared): mid-session deregistration.
local shim = require 'server.compat.qbphone.shared'

---Hands every event and export back when the real qb-phone starts mid-session.
AddEventHandler('onResourceStart', function(resource)
    if resource ~= 'qb-phone' or isShimQbPhone() then return end
    shim.deregisterAll()
    print('^3[sd-phone]^0 qb-phone compat: the REAL qb-phone resource just started, so the compat layer deregistered its event and export handlers. Restart sd-phone after removing qb-phone to hand them back.')
end)

-- Loaded for side effects: each domain file registers its slice of qb-phone's server surface, the
-- official resource's and the Renewed fork's, on require.
require 'server.compat.qbphone.mail'
require 'server.compat.qbphone.contacts'
require 'server.compat.qbphone.billing'
require 'server.compat.qbphone.employment'
require 'server.compat.qbphone.groups'
require 'server.compat.qbphone.crypto'
require 'server.compat.qbphone.misc'
