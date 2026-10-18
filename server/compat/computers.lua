-- sd-computers link: lets the sd-computers desktop act as another screen for a player's phone -
-- the Mail app on the phone's accounts, plus Messages and Notes apps. Self-contained and additive:
-- loaded by fxmanifest after server/main.lua, it only REQUIRES the phone's own action modules
-- (already loaded, so it gets the same instances) and registers two exports. Nothing here runs
-- until sd-computers calls it, and sd-computers works without it (it falls back to its own Mail).
--
-- Every action runs through the same server.*.actions function the phone's NUI callback runs, and
-- repeats that callback's side effects (badge repush, mail delivery fan-out), so a reply typed at
-- a desk behaves exactly like one typed on the phone: same validation, same rate limits, same
-- notifications on the recipient's phone.
--
--
-- Since v2 the desk's Browser also shows the phone's public apps as sites: Pages and Marketplace
-- (read, and post your own), Weazel News (read, and the newsroom for its staff), Birdy's public
-- feed, the company directory, the penal code and the stock market. Those go through the same
-- action functions too, so every limit, owner check and staff rule is still the phone's.
--
-- Kill switch / allow-list: `set sd_phone_computerlink "sd-computers"` (comma-separated resource
-- names allowed to call the link; "off" disables it). Default: sd-computers only.

---@type table Mail actions (server.mail.actions).
local mailActions = require 'server.mail.actions'
---@type table Mail persistence (server.mail.store): account lookup + in-row message mutate.
local mailStore   = require 'server.mail.store'
---@type table Messages actions (server.messages.actions).
local msgActions  = require 'server.messages.actions'
---@type table Notes actions (server.notes.actions).
local noteActions = require 'server.notes.actions'
---@type table Home-screen badge engine (server.badges.init).
local badges      = require 'server.badges.init'
---@type table Shared server helpers (server.util): envelopes + ids.
local util        = require 'server.util'
---@type table Player bridge (bridge.server.player): identity (SIM-aware when unique phones are on).
local player      = require 'bridge.server.player'
---@type table sd-phone config root (configs/config.lua).
local config      = require 'configs.config'

local ok, fail = util.ok, util.fail

---@type integer Link protocol version; sd-computers refuses links older than it understands.
---  1  mail, messages, notes
---  2  + the public apps as sites (pages, marketplace, weazelnews, birdy, services, laws, stocks)
local VERSION = 2

---@type integer A source that is no player's. The phone's public readers take one they cannot
---resolve for a signed-out visitor, which is what a site on a shared computer shows: nobody's
---own feed, nothing from a protected account.
local GUEST = 0

---One of the phone's own modules, asked for the first time a site needs it. A server that has
---taken an app out keeps its mail and texts on the desk regardless: only that site is missing.
---@param name string module path ('server.pages.actions')
---@return table|nil module
local function mod(name)
    local good, m = pcall(require, name)
    return good and type(m) == 'table' and m or nil
end

---The reply for a site whose app this server does not run.
---@return table envelope
local function gone()
    return fail('common.badRequest', 'That is not available on this server')
end

---@type integer Max messages one "empty bin" pass deletes (each is a whole-mailbox rewrite).
local EMPTY_BIN_MAX = 200

---Resources allowed to drive the link, from the sd_phone_computerlink convar.
---@return table<string, boolean>|false
local function allowed()
    local raw = GetConvar('sd_phone_computerlink', 'sd-computers')
    if raw == 'off' or raw == 'false' or raw == '0' then return false end
    local set = {}
    for name in raw:gmatch('[^,%s]+') do set[name] = true end
    return set
end

---Run `fn`, then repush the player's home-screen badges (what the phone's callbacks do after
---every read-state change).
---@param src integer
---@param res table envelope
---@return table
local function withBadges(src, res)
    badges.push(src)
    return res
end

---The caller's identity is signed into `email` (the ownership rule the mail mutators use).
---@param src integer
---@param email any
---@return boolean
local function signedInto(src, email)
    if type(email) ~= 'string' or email == '' then return false end
    local cid = player.getIdentifier(src)
    local acc = cid and mailStore.getAccount(email)
    return acc ~= nil and lib.table.contains(acc.logged_in_citizens or {}, cid)
end

---@type table<string, table<string, fun(src: integer, p: table): table>> app -> action -> handler
local handlers = {}

handlers.phone = {
    ---Is the player carrying a phone? sd-phone's own rule (no phone items configured = everyone does).
    carries = function(src) return ok(util.carriesPhone(src)) end,

    ---Which of the public apps this server runs (configs/apps.lua): a desk only offers the sites
    ---of the ones that are on.
    sites = function()
        return ok({
            pages = util.appEnabled('pages') and mod('server.pages.actions') ~= nil,
            marketplace = util.appEnabled('marketplace') and mod('server.marketplace.actions') ~= nil,
            weazelnews = util.appEnabled('weazelnews') and mod('server.weazelnews.actions') ~= nil,
            birdy = util.appEnabled('birdy') and mod('server.birdy.actions') ~= nil,
            services = util.appEnabled('services') and mod('server.services.actions') ~= nil,
            laws = mod('server.mdt.offences') ~= nil,
            -- (off, its prices never move: a market standing still is not one to put on a page)
            stocks = util.appEnabled('stocks') and mod('server.stocks.engine') ~= nil,
        })
    end,

    ---The character's own number, when they have one (never made here): what a new ad's contact
    ---field starts out as, as it does on the phone.
    number = function(src)
        local cid = player.getIdentifier(src)
        local settings = cid and mod('server.settings.store')
        return ok({ number = settings and settings.getPhoneNumber(cid) or nil })
    end,
}

handlers.mail = {
    ---Domain + limits, so the desk's sign-up/sign-in forms match the phone's rules.
    config = function()
        local M = config.Mail or {}
        return ok({
            domain = M.Domain, maxAccounts = M.MaxAccountsPerPlayer, maxMessages = M.MaxMessagesPerAccount,
            minPassword = M.MinPasswordLength, maxPassword = M.MaxPasswordLength,
            minName = M.MinNameLength, maxName = M.MaxNameLength, maxRecipients = 20, maxSubject = 200, maxBody = 10000,
        })
    end,
    list = function(src) return mailActions.list(src) end,
    signUp = function(src, p) return mailActions.signUp(src, p) end,
    signIn = function(src, p) return withBadges(src, mailActions.signIn(src, p)) end,
    signOut = function(src, p) return withBadges(src, mailActions.signOut(src, p)) end,
    ---Send + the delivery fan-out (inbox pushes, phone notifications), exactly as dispatchSend.
    send = function(src, p)
        local res = mailActions.send(src, p)
        if res.success and res.data then
            mailActions.deliver(res.data.pushes)
            res.data = { sent = res.data.sent }
        end
        return res
    end,
    saveDraft = function(src, p) return mailActions.saveDraft(src, p) end,
    discardDraft = function(src, p) return withBadges(src, mailActions.discardDraft(src, p)) end,
    markRead = function(src, p) return withBadges(src, mailActions.markRead(src, p)) end,
    ---Mark unread: the phone has no such action (it never needs one); same ownership rule.
    markUnread = function(src, p)
        if not signedInto(src, p.accountEmail) then return fail('mail.notSignedIntoAccount', 'You are not signed into that account') end
        mailStore.mutateMessage(p.accountEmail, type(p.messageId) == 'string' and p.messageId or '', function(m)
            m.read = false
            return m
        end)
        return withBadges(src, ok())
    end,
    toggleFlag = function(src, p) return mailActions.toggleFlag(src, p) end,
    moveToBin = function(src, p) return withBadges(src, mailActions.moveToBin(src, p)) end,
    move = function(src, p) return withBadges(src, mailActions.move(src, p)) end,
    ---Hard-delete everything in an account's bin (moveToBin on a binned message deletes it).
    emptyBin = function(src, p)
        if not signedInto(src, p.accountEmail) then return fail('mail.notSignedIntoAccount', 'You are not signed into that account') end
        local acc = mailStore.getAccount(p.accountEmail)
        local ids = {}
        for _, m in ipairs(acc and acc.messages or {}) do
            if m.folder == 'bin' and #ids < EMPTY_BIN_MAX then ids[#ids + 1] = m.id end
        end
        for _, id in ipairs(ids) do
            local res = mailActions.moveToBin(src, { accountEmail = p.accountEmail, messageId = id })
            if not res.success then return withBadges(src, res) end
        end
        return withBadges(src, ok({ deleted = #ids }))
    end,
}

handlers.messages = {
    list = function(src) return msgActions.list(src) end,
    thread = function(src, p) return msgActions.thread(src, p) end,
    ---Plain text only from a desk: no money, voice, GIF or location kinds (those need the phone).
    send = function(src, p)
        return msgActions.send(src, { conversation = p.conversation, body = p.body, kind = 'text' })
    end,
    markRead = function(src, p) return msgActions.markRead(src, p) end,
    delete = function(src, p) return msgActions.deleteConversation(src, p) end,
}

handlers.notes = {
    list = function(src) return noteActions.list(src) end,
    ---Save the BODY of a note. The phone's save replaces sketches/images wholesale, so a desk that
    ---only edits text carries the stored ones (and the creation time) over instead of wiping them.
    save = function(src, p)
        local id = type(p.id) == 'string' and p.id ~= '' and p.id or util.newId(12)
        local existing
        local listed = noteActions.list(src)
        for _, n in ipairs(listed.success and listed.data and listed.data.notes or {}) do
            if n.id == id then existing = n break end
        end
        local now = os.date('!%Y-%m-%dT%H:%M:%S.000Z')
        local res = noteActions.save(src, {
            id = id, body = type(p.body) == 'string' and p.body or '',
            sketches = existing and existing.sketches or {}, images = existing and existing.images or {},
            createdAt = existing and existing.createdAt or now, updatedAt = now,
        })
        if res.success then res.data = { id = id, createdAt = existing and existing.createdAt or now, updatedAt = now } end
        return res
    end,
    delete = function(src, p) return noteActions.delete(src, p.id) end,
}

-- ── The public apps, as the desk's Browser shows them ─────────────────────────────────────

---Handlers for one of the two classified boards (Pages, Marketplace: the same app twice over).
---An ad written at a desk goes up at once - there is no publishAt here, and one is never passed
---on, so the phone's own scheduling stays the phone's.
---@param name string module path of the board's actions
---@param limits fun(): table the board's limits, for the desk's form to hold to as the phone's does
---@return table<string, fun(src: integer, p: table): table>
local function board(name, limits)
    ---@param p table
    ---@return table fields only what the phone's own form sends
    local function fields(p)
        return { id = p.id, title = p.title, body = p.body, price = p.price, images = p.images, number = p.number, email = p.email }
    end
    return {
        list = function(src)
            local a = mod(name)
            if not a then return gone() end
            local res = a.list(src)
            if type(res) == 'table' and type(res.data) == 'table' then res.data.limits = limits() end
            return res
        end,
        create = function(src, p)
            local a = mod(name)
            return a and a.create(src, fields(p)) or gone()
        end,
        update = function(src, p)
            local a = mod(name)
            return a and a.update(src, fields(p)) or gone()
        end,
        delete = function(src, p)
            local a = mod(name)
            return a and a.delete(src, p.id) or gone()
        end,
    }
end

handlers.pages = board('server.pages.actions', function()
    local C = config.Pages or {}
    return { title = C.MaxTitleLength, body = C.MaxBodyLength, images = C.MaxImages, contact = C.MaxContactLength, perPlayer = C.MaxPostsPerPlayer }
end)
handlers.marketplace = board('server.marketplace.actions', function()
    local C = config.Marketplace or {}
    return { title = C.MaxTitleLength, body = C.MaxBodyLength, images = C.MaxImages, contact = C.MaxContactLength, perPlayer = C.MaxListingsPerPlayer, price = C.MaxPrice }
end)

---Weazel News: the paper for everyone, the newsroom for its staff (the phone's own canManage and
---author rules decide who that is, inside each action).
handlers.weazelnews = {
    ---The feed, with what a newsroom's form needs to hold to (its sections and lengths).
    feed = function(src)
        local a = mod('server.weazelnews.actions')
        if not a then return gone() end
        local res = a.feed(src)
        if type(res) == 'table' and type(res.data) == 'table' then
            local C = config.WeazelNews or {}
            res.data.categories = C.Categories
            res.data.limits = { headline = C.MaxHeadlineLength, dek = C.MaxDekLength, body = C.MaxBodyLength, tickerLines = C.MaxBreakingLines, tickerLine = C.MaxBreakingLength }
        end
        return res
    end,
    view = function(src, p)
        local a = mod('server.weazelnews.actions')
        return a and a.view(src, p.id) or gone()
    end,
    save = function(src, p)
        local a = mod('server.weazelnews.actions')
        return a and a.save(src, p) or gone()
    end,
    reschedule = function(src, p)
        local a = mod('server.weazelnews.actions')
        return a and a.reschedule(src, p) or gone()
    end,
    publishNow = function(src, p)
        local a = mod('server.weazelnews.actions')
        return a and a.publishNow(src, p) or gone()
    end,
    delete = function(src, p)
        local a = mod('server.weazelnews.actions')
        return a and a.delete(src, p.id) or gone()
    end,
    setBreaking = function(src, p)
        local a = mod('server.weazelnews.actions')
        return a and a.setBreaking(src, p) or gone()
    end,
}

---Birdy, to read: always as a visitor, whoever is sitting there (see GUEST).
handlers.birdy = {
    feed = function()
        local a = mod('server.birdy.actions')
        return a and a.feed(GUEST, {}) or gone()
    end,
    trending = function()
        local a = mod('server.birdy.actions')
        return a and a.trending() or gone()
    end,
    hashtag = function(_, p)
        local a = mod('server.birdy.actions')
        return a and a.hashtag(GUEST, { tag = p.tag }) or gone()
    end,
    profile = function(_, p)
        local a = mod('server.birdy.actions')
        if not a then return gone() end
        if type(p.handle) ~= 'string' or p.handle == '' then return fail('birdy.profileNotFound', 'Profile not found') end
        return a.profile(GUEST, { handle = p.handle })
    end,
    profilePosts = function(_, p)
        local a = mod('server.birdy.actions')
        if not a then return gone() end
        if type(p.handle) ~= 'string' or p.handle == '' then return fail('birdy.profileNotFound', 'Profile not found') end
        return a.profilePosts(GUEST, { handle = p.handle, kind = 'posts' })
    end,
}

---The company directory, and a message to one of them (text only from a desk). The answer comes
---to the sender's phone, where their Services inbox is.
handlers.services = {
    directory = function()
        local a = mod('server.services.actions')
        return a and ok({ companies = a.companyList() }) or gone()
    end,
    message = function(src, p)
        local a = mod('server.services.actions')
        if not a then return gone() end
        local res = a.messageCompany(src, { job = p.job, kind = 'text', body = p.body })
        -- (the sender's whole inbox rides back for the phone's own screen: a desk has none to put it in)
        if type(res) == 'table' and res.success then res.data = nil end
        return res
    end,
}

---The penal code as the terminals have it now: the shipped charges with the staff's own changes
---to them, hidden ones left out. Reading the law is not the terminal's job gate's business.
handlers.laws = {
    list = function()
        local offences = mod('server.mdt.offences')
        if not offences then return gone() end
        local out = {}
        for _, o in ipairs(offences.all()) do
            out[#out + 1] = { code = o.code, label = o.label, class = o.class, months = o.months, fine = o.fine, description = o.description }
        end
        return ok({ offences = out })
    end,
}

---The market: every asset's price and where it has been. Nobody's holdings, and no wallet is
---opened by looking (the phone's own market() does both).
handlers.stocks = {
    market = function()
        local engine = util.appEnabled('stocks') and mod('server.stocks.engine')
        if not engine then return gone() end
        local meta = {}
        for _, a in ipairs((config.Stocks and config.Stocks.Assets) or {}) do meta[a.symbol] = a end
        local out = {}
        for _, s in ipairs(engine.snapshot()) do
            local a = meta[s.symbol] or {}
            out[#out + 1] = { symbol = s.symbol, name = a.name or s.symbol, kind = a.kind or 'stock', color = a.color, price = s.price, changePct = s.changePct, history = s.history }
        end
        return ok({ assets = out })
    end,
}

---Export: the link protocol version (sd-computers probes this to know the link is installed).
---@return integer
exports('computerLinkVersion', function()
    return VERSION
end)

---Export: run one phone action as `src` - exports['sd-phone']:computerLink(src, app, action, payload).
---Only the resources named in sd_phone_computerlink may call it. Returns the phone's usual
---envelope ({ success, data?, message?, messageKey? }); never throws.
---@param src integer acting player's server id
---@param app 'mail'|'messages'|'notes'|'phone'|'pages'|'marketplace'|'weazelnews'|'birdy'|'services'|'laws'|'stocks'
---@param action string
---@param payload table|nil
---@return table envelope
exports('computerLink', function(src, app, action, payload)
    local caller = GetInvokingResource()
    local allow = allowed()
    if not allow or (caller and not allow[caller]) then
        return fail('computers.linkDisabled', 'Phone link disabled for {resource}', { resource = tostring(caller) })
    end
    if type(src) ~= 'number' or not GetPlayerName(src) then return fail('mail.playerNotFound', 'Player not found') end
    local h = handlers[app] and handlers[app][action]
    if not h then return fail('computers.unknownAction', 'Unknown link action {action}', { action = tostring(app) .. '.' .. tostring(action) }) end
    local good, res = pcall(h, src, type(payload) == 'table' and payload or {})
    if not good then
        print(('^1[sd-phone] computer link %s.%s failed: %s^0'):format(app, action, tostring(res)))
        return util.fail('common.serverError', 'Something went wrong')
    end
    return type(res) == 'table' and res or ok()
end)
