---@type table Framework detection (bridge.shared.framework): the qb-family job read for police alerts.
local framework = require 'bridge.shared.framework'
---@type table Client notify bridge (bridge.client.notify): the "no one nearby" toast.
local notify = require 'bridge.client.notify'

---Whether a started resource named qb-phone is an sd-phone name-holder stub rather than the real one.
---@return boolean
local function isShimQbPhone()
    return GetResourceMetadata('qb-phone', 'sd_phone_shim', 0) == 'yes'
end

---Whether the REAL qb-phone is running. sd-phone holds the name through `provide`, so a
---GetResourceState check alone would find itself; the resource list is enumerated instead.
---@return boolean
local function realIsRunning()
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == 'qb-phone' then
            if isShimQbPhone() then return false end
            local state = GetResourceState('qb-phone')
            return state == 'started' or state == 'starting'
        end
    end
    return false
end

local compatConvar = GetConvar('sd_phone_qbphonecompat', 'true')
if compatConvar == 'false' or compatConvar == '0' or realIsRunning() then return end

---@type table Self-export proxy for the sd-phone client surface.
local sd = exports['sd-phone']

---@type number Radius qb-phone gave "Give Contact Details", in metres.
local GIVE_RANGE = 2.5

---@type any[] AddEventHandler cookies for every event and export handler this half registered.
local cookies = {}

---@type table<string, number> Blips CreateBlipForGroup drew, by the name the caller gave them.
local groupBlips = {}

---@type table<string, boolean> Warn keys that already printed.
local warned = {}

---Prints one console breadcrumb the first time `key` is hit.
---@param key string
---@param msg string
local function warnOnce(key, msg)
    if warned[key] then return end
    warned[key] = true
    print(('^3[sd-phone]^0 qb-phone compat: %s'):format(msg))
end

---Registers a handler for one of qb-phone's client events.
---@param name string
---@param fn function
local function on(name, fn)
    RegisterNetEvent(name)
    cookies[#cookies + 1] = AddEventHandler(name, fn)
end

---Registers a client export under the qb-phone resource name.
---@param name string
---@param fn function
local function export(name, fn)
    cookies[#cookies + 1] = AddEventHandler(('__cfx_export_qb-phone_%s'):format(name), function(setCB)
        setCB(fn)
    end)
end

---A caller value as display text with qb-phone's HTML tags dropped.
---@param v any
---@return string
local function text(v)
    if type(v) == 'number' then return tostring(v) end
    if type(v) ~= 'string' then return '' end
    local s = v:gsub('<%s*[Bb][Rr]%s*/?%s*>', '\n'):gsub('<[^>]*>', '')
    return (s:gsub('^%s+', ''):gsub('%s+$', ''))
end

---@type { [1]: string, [2]: string }[] Font Awesome icon fragments -> the sd-phone app whose icon a
---banner wears. qb-phone callers name an icon rather than an app.
local ICON_APPS <const> = {
    { 'university', 'bank' }, { 'dollar', 'bank' }, { 'money', 'bank' }, { 'credit', 'bank' },
    { 'envelope', 'mail' }, { 'twitter', 'birdy' }, { 'house', 'homes' }, { 'home', 'homes' },
    { 'car', 'garages' }, { 'flag-checkered', 'racing' }, { 'users', 'groups' },
    { 'chart', 'stocks' }, { 'briefcase', 'services' },
}

---The sd-phone app whose icon suits a qb-phone Font Awesome icon class.
---@param icon any
---@return string
local function appForIcon(icon)
    if type(icon) == 'string' then
        for _, pair in ipairs(ICON_APPS) do
            if icon:find(pair[1], 1, true) then return pair[2] end
        end
    end
    return 'phone'
end

---Shows a phone banner, only to a player who carries a phone, as sd-phone's own banners are.
---@param data { app: string, title: any, body?: any, bodyKey?: string, bodyVars?: table }
local function banner(data)
    local title, body = text(data.title), text(data.body)
    if title == '' then title, body = body, '' end
    if title == '' then return end
    if not lib.callback.await('sd-phone:server:carriesPhone', false) then return end
    sd:showNotification({
        app = data.app, appId = data.app, title = title,
        body = body ~= '' and body or nil, bodyKey = data.bodyKey, bodyVars = data.bodyVars,
    })
end

---The player's qb-family job table, nil off the qb family or before they have loaded.
---@return table|nil
local function qbJob()
    local ok, data = false, nil
    if framework.name == 'qbx' then
        ok, data = pcall(function() return exports.qbx_core:GetPlayerData() end)
    elseif framework.qb and framework.core then
        ok, data = pcall(function() return framework.core.Functions.GetPlayerData() end)
    end
    return ok and type(data) == 'table' and data.job or nil
end

-- Inbound: the events scripts trigger at the phone on this side.

---CustomNotification(title, text, icon, color, timeout): the banner scripts send from anywhere.
---Renewed's CustomNotification2 adds accept and deny buttons a banner cannot carry.
for _, name in ipairs({ 'qb-phone:client:CustomNotification', 'qb-phone:client:CustomNotification2' }) do
    on(name, function(title, message, icon)
        banner({ app = appForIcon(icon), title = title, body = message })
    end)
end

---RaceNotify(message): qb-lapraces' race banner.
on('qb-phone:client:RaceNotify', function(message)
    banner({ app = 'racing', title = 'Racing', body = message })
end)

---BankNotify(text): the bank banner of the qb-phone-new fork.
on('qb-phone-new:client:BankNotify', function(message)
    banner({ app = 'bank', title = 'Bank', body = message })
end)

---RemoveBankMoney(amount): the bank debit banner qb-core fires on every bank removal.
on('qb-phone:client:RemoveBankMoney', function(amount)
    local n = tonumber(amount)
    if not n or n <= 0 then return end
    local shown = '$' .. lib.math.groupdigits(math.floor(n), ',')
    banner({
        app = 'bank', title = 'Bank',
        bodyKey = 'qbphone.bankMoneyRemoved', body = ('%s has been removed from your balance.'):format(shown),
        bodyVars = { amount = shown },
    })
end)

---AddTransaction(player, data, message, title): qb-crypto's transaction banner.
on('qb-phone:client:AddTransaction', function(_, _, message)
    banner({ app = 'stocks', title = 'Crypto', body = message })
end)

---NewMailNotify(mailData): a new-mail banner fired directly at the client.
on('qb-phone:client:NewMailNotify', function(mailData)
    local sender = type(mailData) == 'table' and text(mailData.sender) or ''
    banner({
        app = 'mail', title = 'Mail',
        bodyKey = 'qbphone.newMailFrom', body = ('You received a new mail from %s.'):format(sender),
        bodyVars = { sender = sender },
    })
end)

---addPoliceAlert(alertData): an alert for on-duty police. Some scripts broadcast it to every
---player, so the job check is what keeps it off everyone else's phone, as it was in qb-phone.
on('qb-phone:client:addPoliceAlert', function(alert)
    if type(alert) ~= 'table' then return end
    local job = qbJob()
    if not job or job.onduty ~= true or (job.type ~= 'leo' and job.name ~= 'police') then return end

    local body = text(alert.description)
    local coords = alert.coords
    if type(coords) == 'table' or type(coords) == 'vector3' then
        local hash = GetStreetNameAtCoord(coords.x + 0.0, coords.y + 0.0, (coords.z or 0) + 0.0)
        local street = GetStreetNameFromHashKey(hash)
        if street and street ~= '' then
            body = body ~= '' and ('%s\n%s'):format(body, street) or street
        end
    end

    banner({ app = 'mdt', title = alert.title or 'Police Alert', body = body })
end)

---GiveContactDetails(): the radial menu's "Give Contact Details", offered to the closest player.
on('qb-phone:client:GiveContactDetails', function()
    local target = lib.getClosestPlayer(GetEntityCoords(cache.ped), GIVE_RANGE, false)
    if not target then
        notify.show('No one nearby', 'error')
        return
    end
    TriggerServerEvent('qb-phone:server:GiveContactDetails', GetPlayerServerId(target))
end)

---AcceptorDenyInvoice and RefreshPhone follow a script writing a phone_invoices row; the server
---imports it into the Wallet's invoices.
for _, name in ipairs({ 'qb-phone:client:AcceptorDenyInvoice', 'qb-phone:RefreshPhone' }) do
    on(name, function()
        TriggerServerEvent('sd-phone:server:compat:qb:invoices')
    end)
end

---UpdateLapraces(): qb-lapraces drives its races through qb-phone's own Racing app.
on('qb-phone:client:UpdateLapraces', function()
    warnOnce('UpdateLapraces', 'qb-lapraces runs its races through qb-phone\'s own Racing app, which sd-phone does not have; race with sd-phone\'s Racing app instead')
end)

-- Group blips for Renewed's CreateBlipForGroup, drawn the way its client drew them.

---Removes a group blip by name.
---@param name any
local function removeGroupBlip(name)
    local blip = groupBlips[tostring(name)]
    if not blip then return end
    SetBlipRoute(blip, false)
    RemoveBlip(blip)
    groupBlips[tostring(name)] = nil
end

---Server push: draw a blip for every member of a group.
on('sd-phone:client:compat:qb:groupBlip', function(name, data)
    if type(data) ~= 'table' then return end
    removeGroupBlip(name)

    local blip
    if data.entity then
        blip = AddBlipForEntity(data.entity)
    elseif data.netId then
        blip = AddBlipForEntity(NetworkGetEntityFromNetworkId(data.netId))
    elseif data.radius and data.coords then
        blip = AddBlipForRadius(data.coords.x + 0.0, data.coords.y + 0.0, data.coords.z + 0.0, data.radius + 0.0)
    elseif data.coords then
        blip = AddBlipForCoord(data.coords.x + 0.0, data.coords.y + 0.0, data.coords.z + 0.0)
    end
    if not blip then return end

    if not data.radius then
        SetBlipSprite(blip, data.sprite or 1)
        SetBlipScale(blip, (data.scale or 0.7) + 0.0)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(text(data.label) ~= '' and text(data.label) or 'Group')
        EndTextCommandSetBlipName(blip)
    end
    SetBlipColour(blip, data.color or 1)
    SetBlipAlpha(blip, data.alpha or 255)
    if data.route then
        SetBlipRoute(blip, true)
        SetBlipRouteColour(blip, data.routeColor or data.color or 1)
    end
    groupBlips[tostring(name)] = blip
end)

---Server push: remove a group blip.
on('sd-phone:client:compat:qb:groupBlipRemove', removeGroupBlip)

-- Exports Renewed's fork gave client scripts.

---hasPhone(): whether the player carries a phone.
export('hasPhone', function()
    return lib.callback.await('sd-phone:server:carriesPhone', false) == true
end)

---PhoneNotification(title, text, icon, color, timeout, accept, deny): a banner, or with accept and
---deny labels a question the player answers, returning true or false as the fork did.
export('PhoneNotification', function(title, message, icon, _, _, accept, deny)
    if accept == nil and deny == nil then
        banner({ app = appForIcon(icon), title = title, body = message })
        return nil
    end
    local answer = lib.alertDialog({
        header = text(title) ~= '' and text(title) or 'Phone',
        content = text(message),
        centered = true,
        cancel = true,
        labels = {
            confirm = text(accept) ~= '' and text(accept) or nil,
            cancel = text(deny) ~= '' and text(deny) or nil,
        },
    })
    return answer == 'confirm'
end)

---Hands every handler back when the real qb-phone starts mid-session.
AddEventHandler('onClientResourceStart', function(resource)
    if resource ~= 'qb-phone' or isShimQbPhone() then return end
    for i = 1, #cookies do RemoveEventHandler(cookies[i]) end
    cookies = {}
    for name in pairs(groupBlips) do removeGroupBlip(name) end
    print('^3[sd-phone]^0 qb-phone compat: the REAL qb-phone resource just started, so the compat layer deregistered its client handlers.')
end)
