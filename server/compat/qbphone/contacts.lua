---@type table Shared shim helpers (server.compat.qbphone.shared): registration and guards.
local shim = require 'server.compat.qbphone.shared'
---@type table Authoritative contact handlers (server.contacts.actions): the AirShare card offer.
local contacts = require 'server.contacts.actions'
---@type table Settings persistence layer (server.settings.store): the giver's own number.
local settings = require 'server.settings.store'
---@type table Player bridge (bridge.server.player): identity and name of the giver.
local player = require 'bridge.server.player'

---Phone banner to the giver about how the offer went.
---@param src number
---@param data table notification fields
local function tell(src, data)
    data.app, data.appId, data.time = 'phone', 'phone', 'now'
    TriggerClientEvent('sd-phone:client:notify', src, data)
end

---Offers the giver's name and number to the player they faced, the radial menu's "Give Contact
---Details". The recipient accepts through AirShare, and may do so with their phone put away.
shim.onEvent('qb-phone:server:GiveContactDetails', function(target)
    local src = source
    if shim.fromServer(src) then return end

    local tsrc = shim.source(target)
    if not tsrc or tsrc == src then return end
    if not exports[GetCurrentResourceName()]:hasPhone(tsrc) then
        tell(src, { title = 'Phone', bodyKey = 'qbphone.theyHaveNoPhone', body = 'They do not have a phone.' })
        return
    end

    local identity = player.getIdentifier(src)
    local number = identity and settings.getPhoneNumber(identity)
    if not number then
        tell(src, { title = 'Phone', bodyKey = 'qbphone.noNumberToShare', body = 'Your phone has no number to share.' })
        return
    end

    local result = contacts.requestShare(src, tsrc, { name = player.getName(src), phone = number }, { pocketed = true })
    if result.success then
        tell(src, { title = 'Phone', bodyKey = 'qbphone.contactDetailsOffered', body = 'Contact details offered.' })
    else
        tell(src, { title = 'Phone', body = result.message or 'Could not share your contact details.' })
    end
end, true)
