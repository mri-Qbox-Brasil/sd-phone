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

---@type string rrweb replayer the page loads to rebuild the phone screen.
local REPLAY_FILE <const> = 'mri/remote/vendor/rrweb-replay.min.js'

---@type string KVP prefix of a paired phone's key, holding { l = license, s = page strings }.
local PAIR_KVP <const> = 'remote:pair:'

---@type string KVP prefix of each license's paired keys, as a JSON list.
local PAIR_LIST_KVP <const> = 'remote:pairs:'

---@type integer Paired phones kept per player; the oldest goes first.
local MAX_PAIRS <const> = 5

---@type string[] App icons served at /remote/<name>.
local ICONS <const> = { 'icon-180.png', 'icon-192.png', 'icon-512.png' }

---@type table<string, string> Files a connected phone may fetch from any resource, by extension.
local FILE_TYPES <const> = {
    css = 'text/css', png = 'image/png', jpg = 'image/jpeg', jpeg = 'image/jpeg', webp = 'image/webp',
    gif = 'image/gif', svg = 'image/svg+xml', woff = 'font/woff', woff2 = 'font/woff2', ttf = 'font/ttf', otf = 'font/otf',
}

---@class RemoteSession
---@field src integer Player the code was minted for.
---@field expires integer os.time() after which the code is dead.
---@field strings table<string, string> Page texts in the player's phone language.
---@field pending table|nil HTTP response held open until the game answers the offer.
---@field live boolean|nil Answered: the code is spent, but the mirror still fetches files with it.
---@field pair string|nil Paired key the phone came in with, nil for a QR code.

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

---@return { name: string, address: string }[] adapters this machine's IPv4 addresses, best guess first
local function lanAddresses()
    local ok, list = pcall(function() return exports[GetCurrentResourceName()]:mriLanAddresses() end)
    local out = {}
    if not ok or type(list) ~= 'table' then return out end
    for _, item in ipairs(list) do
        if type(item) == 'table' and type(item.address) == 'string' and item.address:match('^%d+%.%d+%.%d+%.%d+$') then
            out[#out + 1] = { name = type(item.name) == 'string' and item.name or item.address, address = item.address }
        end
    end
    return out
end

local ice = nil

---@param src integer
---@return table servers RTCIceServer list for the phone page
local function iceServers(src)
    ice = ice or require 'server.voice.ice'
    local ok, servers = pcall(ice.servers, src)
    return ok and servers or { { urls = 'stun:stun.l.google.com:19302' } }
end

---@param src integer
---@return string|nil
local function licenseOf(src)
    local license = GetPlayerIdentifierByType(src, 'license')
    return type(license) == 'string' and license ~= '' and license or nil
end

---@param pair string
---@return { l: string, s: table<string, string> }|nil
local function pairInfo(pair)
    local raw = GetResourceKvpString(PAIR_KVP .. pair)
    if not raw or raw == '' then return nil end
    local ok, info = pcall(json.decode, raw)
    return ok and type(info) == 'table' and type(info.l) == 'string' and info or nil
end

---@param license string
---@return string[]
local function pairsOf(license)
    local ok, list = pcall(json.decode, GetResourceKvpString(PAIR_LIST_KVP .. license) or '[]')
    return ok and type(list) == 'table' and list or {}
end

---@param license string
---@return integer|nil src the online player with that license
local function playerByLicense(license)
    for _, id in ipairs(GetPlayers()) do
        local src = tonumber(id)
        if src and licenseOf(src) == license then return src end
    end
    return nil
end

---Saves a phone that connected by QR code, so it can come back as an app without a new code.
---@param src integer
---@param strings table<string, string>
---@return string|nil pair
local function newPair(src, strings)
    local license = licenseOf(src)
    if not license then return nil end
    local pair = newToken()
    SetResourceKvp(PAIR_KVP .. pair, json.encode({ l = license, s = strings }))
    local list = pairsOf(license)
    list[#list + 1] = pair
    while #list > MAX_PAIRS do DeleteResourceKvp(PAIR_KVP .. table.remove(list, 1)) end
    SetResourceKvp(PAIR_LIST_KVP .. license, json.encode(list))
    return pair
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
---@param status integer
---@param config table spliced into the page as its config
local function renderPage(res, status, config)
    local html = LoadResourceFile(GetCurrentResourceName(), PAGE_FILE)
    if not html then
        res.writeHead(500, { ['Content-Type'] = 'text/plain' })
        return res.send('missing ' .. PAGE_FILE)
    end
    config.base = '/' .. GetCurrentResourceName() .. '/remote'
    local payload = json.encode(config):gsub('</', '<\\/')
    local start, finish = html:find(PAGE_SLOT, 1, true)
    if start then html = html:sub(1, start - 1) .. payload .. html:sub(finish + 1) end

    res.writeHead(status, {
        ['Content-Type'] = 'text/html; charset=utf-8',
        ['Cache-Control'] = 'no-store',
        ['Referrer-Policy'] = 'no-referrer',
        ['X-Frame-Options'] = 'DENY',
    })
    res.send(html)
end

---GET /remote/<token>: the page a QR code opens.
---@param res table
---@param token string|nil
local function servePage(res, token)
    local session = token and sessions[token]
    if session and session.live then
        session = nil
    elseif session and os.time() > session.expires then
        drop(token, 'expired')
        session = nil
    end

    CreateThread(function()
        renderPage(res, session and 200 or 404, {
            expired = session == nil,
            strings = session and session.strings or lastStrings or {},
            iceServers = session and iceServers(session.src) or {},
        })
    end)
end

---GET /remote/app/<pair>: the same page, opened from the home screen of a paired phone.
---@param res table
---@param pair string
local function serveApp(res, pair)
    local info = pairInfo(pair)
    CreateThread(function()
        local src = info and playerByLicense(info.l)
        renderPage(res, info and 200 or 404, {
            expired = info == nil,
            pair = info and pair or nil,
            strings = info and info.s or lastStrings or {},
            iceServers = src and iceServers(src) or { { urls = 'stun:stun.l.google.com:19302' } },
        })
    end)
end

---GET /remote/app/<pair>/manifest.webmanifest: lets the paired page install as a full screen app.
---@param res table
---@param pair string
local function serveManifest(res, pair)
    local info = pairInfo(pair)
    if not info then return replyJson(res, 404, { ok = false }) end
    local base = '/' .. GetCurrentResourceName() .. '/remote'
    local name = info.s.appName or info.s.title or 'Phone'
    res.writeHead(200, { ['Content-Type'] = 'application/manifest+json', ['Cache-Control'] = 'no-store' })
    res.send(json.encode({
        name = name,
        short_name = name,
        start_url = ('%s/app/%s'):format(base, pair),
        scope = ('%s/app/%s'):format(base, pair),
        display = 'fullscreen',
        orientation = 'portrait',
        background_color = '#0b0b0f',
        theme_color = '#0b0b0f',
        icons = {
            { src = base .. '/icon-192.png', sizes = '192x192', type = 'image/png', purpose = 'any maskable' },
            { src = base .. '/icon-512.png', sizes = '512x512', type = 'image/png', purpose = 'any maskable' },
        },
    }))
end

---Hands the phone's SDP to the game and holds the request open until it answers.
---@param req table
---@param res table
---@param token string
---@param session RemoteSession
local function relayOffer(req, res, token, session)
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
        TriggerClientEvent('mri_sdphone:remote:offer', session.src, token, sdp, session.pair ~= nil)

        SetTimeout(ANSWER_WAIT_MS, function()
            if sessions[token] == session and session.pending == res then
                session.pending = nil
                replyJson(res, 504, { ok = false, code = 'timeout' })
            end
        end)
    end)
end

---POST /remote/<token>/offer: a phone that scanned the QR code.
---@param req table
---@param res table
---@param token string
local function takeOffer(req, res, token)
    local session = sessions[token]
    if not session or session.live or os.time() > session.expires or session.pending then
        if session and os.time() > session.expires then drop(token, 'expired') end
        return replyJson(res, 410, { ok = false, code = 'expired' })
    end
    relayOffer(req, res, token, session)
end

---POST /remote/app/<pair>/offer: a paired phone opening the app, which reaches its owner if online.
---@param req table
---@param res table
---@param pair string
local function takeAppOffer(req, res, pair)
    local info = pairInfo(pair)
    if not info then return replyJson(res, 410, { ok = false, code = 'forgotten' }) end
    local src = playerByLicense(info.l)
    if not src then return replyJson(res, 409, { ok = false, code = 'offline' }) end

    local now = GetGameTimer()
    if lastOpen[src] and now - lastOpen[src] < OPEN_GAP_MS then
        return replyJson(res, 429, { ok = false, code = 'cooldown' })
    end
    lastOpen[src] = now

    if tokenOf[src] then drop(tokenOf[src], 'replaced') end
    local token = newToken()
    local session = { src = src, expires = os.time() + SESSION_TTL, strings = info.s, pair = pair }
    sessions[token] = session
    tokenOf[src] = token
    relayOffer(req, res, token, session)
end

---@param res table
---@param status integer
---@param contentType string
---@param body string
---@param maxAge integer seconds the phone may cache it
local function replyFile(res, status, contentType, body, maxAge)
    res.writeHead(status, {
        ['Content-Type'] = contentType,
        ['Cache-Control'] = maxAge > 0 and ('private, max-age=%d'):format(maxAge) or 'no-store',
        ['X-Content-Type-Options'] = 'nosniff',
    })
    res.send(body)
end

---@param name string resource name as the URL carries it, lowercased by the browser
---@return string|nil resource the started resource with that name, in its real case
local function findResource(name)
    if GetResourceState(name) == 'started' then return name end
    local lower = name:lower()
    for i = 0, GetNumResources() - 1 do
        local resource = GetResourceByFindIndex(i)
        if resource and resource:lower() == lower then
            return GetResourceState(resource) == 'started' and resource or nil
        end
    end
    return nil
end

---GET /remote/<token>/f/<resource>/<path>: fonts, styles and images the mirrored screen points at.
---@param res table
---@param token string
---@param resource string
---@param file string
local function serveFile(res, token, resource, file)
    local session = sessions[token]
    file = file:gsub('%%(%x%x)', function(hex) return string.char(tonumber(hex, 16)) end)
    local ext = file:match('%.(%w+)$')
    local contentType = ext and FILE_TYPES[ext:lower()]
    resource = session and session.live and findResource(resource)
    if not resource or not contentType or file:find('..', 1, true) then
        return replyFile(res, 404, 'text/plain', '', 0)
    end
    local body = LoadResourceFile(resource, file)
    if not body then return replyFile(res, 404, 'text/plain', '', 0) end
    replyFile(res, 200, contentType, body, 3600)
end

---@param res table
---@param name string
local function serveIcon(res, name)
    local body = LoadResourceFile(GetCurrentResourceName(), 'mri/remote/icons/' .. name)
    replyFile(res, body and 200 or 404, 'image/png', body or '', body and 86400 or 0)
end

setHttpHandler(function(req, res)
    local path = type(req.path) == 'string' and req.path:gsub('%?.*$', '') or ''

    if req.method == 'GET' and path == '/remote/replay.js' then
        local body = LoadResourceFile(GetCurrentResourceName(), REPLAY_FILE)
        return replyFile(res, body and 200 or 404, 'text/javascript; charset=utf-8', body or '', 3600)
    end

    local icon = req.method == 'GET' and path:match('^/remote/([%w%-]+%.png)$')
    if icon then
        for _, name in ipairs(ICONS) do
            if name == icon then return serveIcon(res, icon) end
        end
    end

    local pair, appAction = path:match('^/remote/app/(%x+)/?([%w%.]*)$')
    if pair then
        if req.method == 'GET' and appAction == '' then return serveApp(res, pair) end
        if req.method == 'GET' and appAction == 'manifest.webmanifest' then return serveManifest(res, pair) end
        if req.method == 'POST' and appAction == 'offer' then return takeAppOffer(req, res, pair) end
        return replyJson(res, 405, { ok = false, code = 'method' })
    end

    local fileToken, fileResource, file = path:match('^/remote/(%x+)/f/([%w_%-%.]+)/(.+)$')
    if fileToken then
        if req.method ~= 'GET' then return replyJson(res, 405, { ok = false, code = 'method' }) end
        return serveFile(res, fileToken, fileResource, file)
    end

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
            lan = lanAddresses(),
            expiresIn = SESSION_TTL,
        },
    }
end)

---The game's SDP answer: releases the phone's held offer and spends the code, which lives on only for the mirror's files.
RegisterNetEvent('mri_sdphone:remote:answer', function(token, sdp, strings)
    local src = source
    local session = type(token) == 'string' and sessions[token]
    if not session or session.src ~= src or not session.pending then return end
    if type(sdp) ~= 'string' or sdp == '' or #sdp > MAX_SDP then return end

    local fresh = cleanStrings(strings)
    if next(fresh) then
        session.strings = fresh
        lastStrings = fresh
        local info = session.pair and pairInfo(session.pair)
        -- A saved app keeps the texts of its pairing, so refresh them to the phone's current language.
        if info then SetResourceKvp(PAIR_KVP .. session.pair, json.encode({ l = info.l, s = fresh })) end
    end

    local res = session.pending
    session.pending = nil
    session.live = true
    session.pair = session.pair or newPair(src, session.strings)
    replyJson(res, 200, {
        ok = true,
        sdp = sdp,
        files = ('/%s/remote/%s/f/'):format(GetCurrentResourceName(), token),
        pair = session.pair,
        strings = session.strings,
    })
end)

---Forgets every phone this player paired, and drops the one connected now.
RegisterNetEvent('mri_sdphone:remote:forget', function()
    local src = source
    local license = licenseOf(src)
    if not license then return end
    for _, pair in ipairs(pairsOf(license)) do DeleteResourceKvp(PAIR_KVP .. pair) end
    DeleteResourceKvp(PAIR_LIST_KVP .. license)
    if tokenOf[src] then drop(tokenOf[src], 'closed') end
end)

---The player cancelled the code or the connection ended.
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
            if now > session.expires and not session.pending and not session.live then drop(token, 'expired') end
        end
    end
end)
