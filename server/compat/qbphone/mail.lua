---@type table Shared shim helpers (server.compat.qbphone.shared): registration, guards, text.
local shim = require 'server.compat.qbphone.shared'
---@type table Authoritative mail handlers (server.mail.actions): delivery to a character's mailbox.
local actions = require 'server.mail.actions'
---@type table Player bridge (bridge.server.player): the caller's character id.
local player = require 'bridge.server.player'
---@type table Shared server helpers (server.util): the per-character send budget.
local util = require 'server.util'

---@type integer Rolling window, in ms, over the mails one player's client may send themselves.
local SELF_WINDOW = 60000
---@type integer Mails one player's client may send themselves per window. Job scripts send one per
---step, so this only bites a flood.
local SELF_MAX = 12

---@type table Mail module; the table returned at end of file.
local mail = {}

---Converts a qb-phone mail table into an sd-phone system mail. Its button becomes a one-shot action
---when it names an event; an empty `button = {}`, which qb-cityhall sends, carries none.
---@param mailData table { sender, subject, message, button? = { enabled?, buttonEvent, buttonData } }
---@return table
local function payloadOf(mailData)
    local button = type(mailData.button) == 'table' and mailData.button or nil
    local event = button and button.enabled ~= false and shim.text(button.buttonEvent) or ''
    return {
        subject = shim.htmlToText(mailData.subject),
        body    = shim.htmlToText(mailData.message),
        from    = { name = shim.htmlToText(mailData.sender) },
        action  = (button and event ~= '') and { event = event, data = button.buttonData } or nil,
    }
end

---Delivers a qb-phone mail to a character, holding it until they set Mail up when they have no
---mailbox.
---@param citizenid any framework character id
---@param mailData any qb-phone mail table
---@return boolean sent true when delivered or held
function mail.send(citizenid, mailData)
    if type(mailData) ~= 'table' then return false end
    local cid = shim.text(citizenid)
    if cid == '' then return false end
    return actions.sendToCitizen((shim.identityOf(cid)), payloadOf(mailData)).success == true
end

---The qb-phone mail every job script fires from the client: it lands in the triggering player's own
---mailbox. Renewed's fork added a citizenid second argument, honoured only from the server: from a
---client it would let any player write into any mailbox.
shim.onEvent('qb-phone:server:sendNewMail', function(mailData, citizenid)
    local src = source
    if shim.fromServer(src) then
        if citizenid == nil then
            shim.warnOnce('sendNewMail.server', ('qb-phone:server:sendNewMail was triggered server-side by %s without a citizenid, so it had no recipient'):format(shim.invoker()))
            return
        end
        mail.send(citizenid, mailData)
        return
    end

    local cid = player.getRealIdentifier(src)
    if not cid then return end
    if citizenid ~= nil and citizenid ~= cid then
        shim.warnOnce('sendNewMail.citizenid', 'qb-phone:server:sendNewMail was triggered by a client with another player\'s citizenid; it went to the sender instead, since a client must not pick the mailbox')
    end
    if not util.rateLimit(cid, 'qbphone:sendNewMail', SELF_WINDOW, SELF_MAX) then return end
    mail.send(cid, mailData)
end, true)

---Mail to a named character, which qb-phone registered as a net event. A client origin is refused:
---the payload names its own mailbox and sender, and a button on it would fire on the victim's client.
shim.onEvent('qb-phone:server:sendNewEventMail', function(citizenid, mailData)
    if not shim.fromServer(source) then
        shim.warnOnce('sendNewEventMail.client', 'qb-phone:server:sendNewEventMail was triggered by a player\'s client and refused: it names its own recipient, so trigger it from a server script')
        return
    end
    mail.send(citizenid, mailData)
end, true)

---The event spelling of sendNewMailToOffline, which qbx_vehiclesales triggers server-side.
shim.onEvent('qb-phone:server:sendNewMailToOffline', function(citizenid, mailData)
    if not shim.fromServer(source) then
        shim.warnOnce('sendNewMailToOffline.client', 'qb-phone:server:sendNewMailToOffline was triggered by a player\'s client and refused: it names its own recipient, so trigger it from a server script')
        return
    end
    mail.send(citizenid, mailData)
end, true)

---sendNewMailToOffline(citizenid, mailData): despite the name qb-phone delivers to online players
---too, so both cases take the ordinary path.
shim.registerExport('sendNewMailToOffline', function(citizenid, mailData)
    return mail.send(citizenid, mailData)
end)

return mail
