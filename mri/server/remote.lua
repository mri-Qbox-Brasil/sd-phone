-- Remote control from a real phone: signaling over HTTP here, input over a WebRTC data channel (docs/mri-remote.md).

---@type integer Seconds a QR code stays valid without a phone answering it.
local SESSION_TTL <const> = 300

---@type integer Seconds the phone's offer waits for the game to answer.
local ANSWER_WAIT_MS <const> = 25000

---@type integer Milliseconds between two codes for one player.
local OPEN_GAP_MS <const> = 1500

---@type integer Largest SDP accepted from either side.
local MAX_SDP <const> = 16 * 1024

---@type string Page served to the phone, with its config spliced in at request time.
local PAGE_FILE <const> = 'mri/remote/index.html'

---@type string Marker in the page replaced by the JSON config.
local PAGE_SLOT <const> = '/*MRI_REMOTE_CONFIG*/null'

---@class RemoteSession
---@field src integer Player the code was minted for.
---@field expires integer os.time() after which the code is dead.
---@field strings table<string, string> Page texts in the player's phone language.
---@field pending table|nil HTTP response held open until the game answers the offer.

---@type table<string, RemoteSession>
local sessions = {}

---@type table<integer, string> Live code of each player.
local tokenOf = {}

---@type table<integer, integer> GetGameTimer() of each player's last code.
local lastOpen = {}

---@type table<string, string>|nil Texts of the last code minted, for the page of a dead code.
local lastStrings = nil

---@type function|nil Handler the upstream registered.
local upstreamHandler = nil

-- FXServer keeps one HTTP handler per resource, so the upstream's one sits behind this.
local setHttpHandler = SetHttpHandler

SetHttpHandler = function(handler)
    upstreamHandler = handler
end

---@return string token 32 hex characters.
local function newToken()
    return ('%08x%08x%08x%08x'):format(
        math.random(0, 0xFFFFFFFF), math.random(0, 0xFFFFFFFF),
        math.random(0, 0xFFFFFFFF), math.random(0, 0xFFFFFFFF))
end

---@param token string
---@param reason string|nil sent to the held offer, if any
local function drop(token, reason)
    local session = sessions[token]
    if not session then return end
    sessions[token] = nil
    if tokenOf[session.src] == token then tokenOf[session.src] = nil end
    if session.pending then
        session.pending.writeHead(410, { ['Content-Type'] = 'application/json' })
        session.pending.send(json.encode({ ok = false, code = reason or 'closed' }))
        session.pending = nil
    end
end

---@param raw any
---@return table<string, string> strings only string keys and values, size-capped
local function cleanStrings(raw)
    local out, count = {}, 0
    if type(raw) ~= 'table' then return out end
    for key, value in pairs(raw) do
        if type(key) == 'string' and type(value) == 'string' and #key <= 40 and #value <= 200 then
            count = count + 1
            if count > 60 then break end
            out[key] = value
        end
    end
    return out
end

---@return string|nil base scheme and host the phone should open, nil when the client must build it
local function publicBase()
    local custom = GetConvar('sd_phone_remote_url', '')
    if custom ~= '' then return (custom:gsub('/+$', '')) end
    return nil
end

---@return string|nil address this machine's LAN IPv4, for a client connected over loopback
local function lanAddress()
    local ok, address = pcall(function() return exports[GetCurrentResourceName()]:mriLanAddress() end)
    return ok and type(address) == 'string' and address ~= '' and address or nil
end

local ice = nil

---@param src integer
---@return table servers RTCIceServer list for the phone page
local function iceServers(src)
    ice = ice or require 'server.voice.ice'
    local ok, servers = pcall(ice.servers, src)
    return ok and servers or { { urls = 'stun:stun.l.google.com:19302' } }
end

---@param res table
---@param status integer
---@param body table
local function replyJson(res, status, body)
    res.writeHead(status, {
        ['Content-Type'] = 'application/json',
        ['Cache-Control'] = 'no-store',
    })
    res.send(json.encode(body))
end

---@param res table
---@param token string|nil
local function servePage(res, token)
    local html = LoadResourceFile(GetCurrentResourceName(), PAGE_FILE)
    if not html then
        res.writeHead(500, { ['Content-Type'] = 'text/plain' })
        return res.send('missing ' .. PAGE_FILE)
    end

    local session = token and sessions[token]
    if session and os.time() > session.expires then
        drop(token, 'expired')
        session = nil
    end

    CreateThread(function()
        local config = {
            expired = session == nil,
            strings = session and session.strings or lastStrings or {},
            iceServers = session and iceServers(session.src) or {},
        }
        local payload = json.encode(config):gsub('</', '<\\/')
        local start, finish = html:find(PAGE_SLOT, 1, true)
        if start then html = html:sub(1, start - 1) .. payload .. html:sub(finish + 1) end

        res.writeHead(session and 200 or 404, {
            ['Content-Type'] = 'text/html; charset=utf-8',
            ['Cache-Control'] = 'no-store',
            ['Referrer-Policy'] = 'no-referrer',
            ['X-Frame-Options'] = 'DENY',
        })
        res.send(html)
    end)
end

---POST /remote/<token>/offer: the phone's SDP, held open until the game answers it.
---@param req table
---@param res table
---@param token string
local function takeOffer(req, res, token)
    local session = sessions[token]
    if not session or os.time() > session.expires or session.pending then
        if session and os.time() > session.expires then drop(token, 'expired') end
        return replyJson(res, 410, { ok = false, code = 'expired' })
    end

    req.setDataHandler(function(body)
        if sessions[token] ~= session or session.pending then
            return replyJson(res, 410, { ok = false, code = 'expired' })
        end
        local ok, decoded = pcall(json.decode, body or '')
        local sdp = ok and type(decoded) == 'table' and decoded.sdp
        if type(sdp) ~= 'string' or sdp == '' or #sdp > MAX_SDP then
            return replyJson(res, 400, { ok = false, code = 'bad-offer' })
        end

        session.pending = res
        TriggerClientEvent('mri_sdphone:remote:offer', session.src, token, sdp)

        SetTimeout(ANSWER_WAIT_MS, function()
            if sessions[token] == session and session.pending == res then
                session.pending = nil
                replyJson(res, 504, { ok = false, code = 'timeout' })
            end
        end)
    end)
end

setHttpHandler(function(req, res)
    local path = type(req.path) == 'string' and req.path:gsub('%?.*$', '') or ''
    local token, action = path:match('^/remote/(%x+)/?(%a*)$')

    if not token then
        if upstreamHandler then return upstreamHandler(req, res) end
        res.writeHead(404, { ['Content-Type'] = 'text/plain' })
        return res.send('')
    end

    if req.method == 'GET' and action == '' then return servePage(res, token) end
    if req.method == 'POST' and action == 'offer' then return takeOffer(req, res, token) end
    replyJson(res, 405, { ok = false, code = 'method' })
end)

---Mints the player's QR code. A new code kills the old one.
lib.callback.register('mri_sdphone:remote:open', function(src, strings)
    local now = GetGameTimer()
    if lastOpen[src] and now - lastOpen[src] < OPEN_GAP_MS then
        return { success = false, code = 'cooldown' }
    end
    lastOpen[src] = now

    if tokenOf[src] then drop(tokenOf[src], 'replaced') end

    local token = newToken()
    local clean = cleanStrings(strings)
    sessions[token] = { src = src, expires = os.time() + SESSION_TTL, strings = clean }
    tokenOf[src] = token
    if next(clean) then lastStrings = clean end

    return {
        success = true,
        data = {
            token = token,
            path = '/' .. GetCurrentResourceName() .. '/remote/' .. token,
            base = publicBase(),
            lan = lanAddress(),
            expiresIn = SESSION_TTL,
        },
    }
end)

---The game's SDP answer: releases the phone's held offer and retires the code.
RegisterNetEvent('mri_sdphone:remote:answer', function(token, sdp)
    local src = source
    local session = type(token) == 'string' and sessions[token]
    if not session or session.src ~= src or not session.pending then return end
    if type(sdp) ~= 'string' or sdp == '' or #sdp > MAX_SDP then return end

    local res = session.pending
    session.pending = nil
    sessions[token] = nil
    if tokenOf[src] == token then tokenOf[src] = nil end
    replyJson(res, 200, { ok = true, sdp = sdp })
end)

---The player closed the code page or cancelled before a phone answered.
RegisterNetEvent('mri_sdphone:remote:cancel', function()
    local token = tokenOf[source]
    if token then drop(token, 'closed') end
end)

AddEventHandler('playerDropped', function()
    local src = source
    if tokenOf[src] then drop(tokenOf[src], 'closed') end
    lastOpen[src] = nil
end)

CreateThread(function()
    while true do
        Wait(30000)
        local now = os.time()
        for token, session in pairs(sessions) do
            if now > session.expires and not session.pending then drop(token, 'expired') end
        end
    end
end)
