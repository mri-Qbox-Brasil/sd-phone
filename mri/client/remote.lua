-- Remote control from a real phone: the NUI side of the signaling (mri/server/remote.lua).

---@param host string
---@return boolean
local function isLoopback(host)
    return host == 'localhost' or host == '::1' or host:match('^127%.') ~= nil
end

---@param data table { path: string, base: string|nil, lan: string|nil }
---@return string|nil url the phone opens, nil when this client has no address to hand out
local function remoteUrl(data)
    if type(data.base) == 'string' and data.base ~= '' then return data.base .. data.path end

    local endpoint = GetCurrentServerEndpoint()
    if type(endpoint) ~= 'string' or endpoint == '' then return nil end

    local host, port = endpoint:match('^%[?([^%]]+)%]?:(%d+)$')
    if not host then return nil end
    if isLoopback(host) then
        if not data.lan then return nil end
        host = data.lan
    end
    return ('http://%s:%s%s'):format(host, port, data.path)
end

RegisterNUICallback('mri:remote:open', function(body, cb)
    local strings = type(body) == 'table' and body.strings or nil
    local res = lib.callback.await('mri_sdphone:remote:open', false, strings)
    if type(res) ~= 'table' or not res.success then
        return cb({ success = false, code = type(res) == 'table' and res.code or 'server' })
    end

    local url = remoteUrl(res.data)
    if not url then
        TriggerServerEvent('mri_sdphone:remote:cancel')
        return cb({ success = false, code = 'unavailable' })
    end
    cb({ success = true, data = { token = res.data.token, url = url, expiresIn = res.data.expiresIn } })
end)

RegisterNUICallback('mri:remote:answer', function(body, cb)
    if type(body) == 'table' and type(body.token) == 'string' and type(body.sdp) == 'string' then
        TriggerServerEvent('mri_sdphone:remote:answer', body.token, body.sdp)
    end
    cb({ success = true })
end)

RegisterNUICallback('mri:remote:cancel', function(_, cb)
    TriggerServerEvent('mri_sdphone:remote:cancel')
    cb({ success = true })
end)

RegisterNUICallback('mri:remote:toggle', function(_, cb)
    local resource = GetCurrentResourceName()
    if exports[resource]:isOpen() then
        exports[resource]:close()
    else
        exports[resource]:open()
    end
    cb({ success = true })
end)

RegisterNetEvent('mri_sdphone:remote:offer', function(token, sdp)
    SendNUIMessage({ action = 'mri:remote:offer', data = { token = token, sdp = sdp } })
end)
