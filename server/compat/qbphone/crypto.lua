---@type table Shared shim helpers (server.compat.qbphone.shared): registration and sources.
local shim = require 'server.compat.qbphone.shared'
---@type table Framework detection (bridge.shared.framework): the qb flag the crypto metadata needs.
local framework = require 'bridge.shared.framework'
---@type table Player bridge (bridge.server.player): the framework player object.
local player = require 'bridge.server.player'

---A player's crypto wallet from the framework's `metadata.crypto`, with the player object to write
---it back through. Nil off the qb family or before the player has loaded.
---@param source any
---@return table|nil wallet coin name -> amount
---@return table|nil player framework player object
local function walletOf(source)
    if not framework.qb then return nil, nil end
    local src = shim.source(source)
    local p = src and player.get(src)
    local meta = p and p.PlayerData and p.PlayerData.metadata
    local wallet = meta and meta.crypto
    if type(wallet) ~= 'table' or not p.Functions then return nil, nil end
    return wallet, p
end

---A positive, finite whole amount, or nil.
---@param v any
---@return integer|nil
local function amountOf(v)
    local n = tonumber(v)
    if not n or n ~= n or n == math.huge or n < 1 then return nil end
    return math.floor(n)
end

---AddCrypto(source, coin, amount), from Renewed's qb-phone fork: credits a coin in the player's
---framework crypto metadata.
shim.registerExport('AddCrypto', function(source, coin, amount)
    local wallet, p = walletOf(source)
    local n = amountOf(amount)
    if not wallet or not p or not n or type(coin) ~= 'string' then return false end
    wallet[coin] = (tonumber(wallet[coin]) or 0) + n
    p.Functions.SetMetaData('crypto', wallet)
    return true
end)

---RemoveCrypto(source, coin, amount): debits a coin, refusing when the balance would go negative.
shim.registerExport('RemoveCrypto', function(source, coin, amount)
    local wallet, p = walletOf(source)
    local n = amountOf(amount)
    if not wallet or not p or not n or type(coin) ~= 'string' then return false end
    local held = tonumber(wallet[coin]) or 0
    if held - n < 0 then return false end
    wallet[coin] = held - n
    p.Functions.SetMetaData('crypto', wallet)
    return true
end)

---hasEnough(source, coin, amount): whether the player holds at least `amount` of a coin.
shim.registerExport('hasEnough', function(source, coin, amount)
    local wallet = walletOf(source)
    local n = tonumber(amount)
    if not wallet or not n or type(coin) ~= 'string' then return false end
    return (tonumber(wallet[coin]) or 0) - n >= 0
end)
