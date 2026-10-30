-- Remote control from a real phone: the NUI side of the signaling (mri/server/remote.lua).

---@param host string
---@return boolean
local function isLoopback(host)
    return host == 'localhost' or host == '::1' or host:match('^127%.') ~= nil
end

---@param data table { path: string, base: string|nil, lan: { name: string, address: string }[] }
---@return { id: string, name: string|nil, url: string }[] urls the phone can open, best guess first
local function remoteUrls(data)
    local urls, seen = {}, {}
    local function add(id, name, url)
        if seen[url] then return end
        seen[url] = true
        urls[#urls + 1] = { id = id, name = name, url = url }
    end

    if type(data.base) == 'string' and data.base ~= '' then add('custom', nil, data.base .. data.path) end

    local endpoint = GetCurrentServerEndpoint()
    if type(endpoint) ~= 'string' then return urls end
    local host, port = endpoint:match('^%[?([^%]]+)%]?:(%d+)$')
    if not host then return urls end

    if not isLoopback(host) then add('endpoint', nil, ('http://%s:%s%s'):format(host, port, data.path)) end
    for _, adapter in ipairs(type(data.lan) == 'table' and data.lan or {}) do
        add(adapter.address, adapter.name, ('http://%s:%s%s'):format(adapter.address, port, data.path))
    end
    return urls
end

RegisterNUICallback('mri:remote:open', function(body, cb)
    local strings = type(body) == 'table' and body.strings or nil
    local res = lib.callback.await('mri_sdphone:remote:open', false, strings)
    if type(res) ~= 'table' or not res.success then
        return cb({ success = false, code = type(res) == 'table' and res.code or 'server' })
    end

    local urls = remoteUrls(res.data)
    if #urls == 0 then
        TriggerServerEvent('mri_sdphone:remote:cancel')
        return cb({ success = false, code = 'unavailable' })
    end
    cb({ success = true, data = { token = res.data.token, urls = urls, expiresIn = res.data.expiresIn } })
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
