---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Inventory bridge (bridge.server.inventory): slot-level item ops.
local bridge = require 'bridge.server.inventory'
---@type table Shared server helpers (server.util): random id generation.
local util   = require 'server.util'

---@type table Tray module; the table returned at end of file. A phone's SIM tray is a 1-slot
---stash (ox_inventory or one_inventory) whose id lives in the phone item's own metadata, so the
---tray follows the ITEM through trades, drops and stashes.
local tray = {}

---@type string ox_inventory resource name.
local OX = 'ox_inventory'

---@type string one_inventory resource name.
local ONE = 'one_inventory'

---@type string Prefix on every tray id; the ox hook filters match against it.
local PREFIX = 'simtray:'

---@type string Prefix on a tray's one_inventory stash name. one_inventory reads a second colon in
---a `stash:<name>` reference as an owner, so the id's colon becomes an underscore there.
local ONE_PREFIX = 'simtray_'

---@type integer Characters of randomness after the prefix.
local ID_LEN = 16

---@type string Label on the tray's inventory panel.
local LABEL = 'SIM Tray'

---@type integer Tray capacity in grams.
local MAX_WEIGHT = 1000

---@type table<string, true> Tray ids already registered with ox this session.
local registered = {}

---@type table<string, true> Configured phone item names.
local phoneItems = {}
for _, entry in ipairs(config.Phone.Items or {}) do phoneItems[entry.item] = true end

-- Tray mode as CONFIGURED, reading the pre-rename `UseContainers` key when `SimTray` is absent.
-- The LIVE mode additionally needs a tray backend (tray.supported); server/sim/init.lua folds
-- that in as state.mode.
local configured = config.Sim.SimTray
if configured == nil then configured = config.Sim.UseContainers end

---@type boolean True when the config asks for physical SIM trays.
tray.configured = configured == true

---The one_inventory stash name for a tray id.
---@param id string tray id
---@return string
local function oneName(id)
    return ONE_PREFIX .. id:sub(#PREFIX + 1)
end

---The one_inventory stash reference for a tray id.
---@param id string tray id
---@return string
local function oneRef(id)
    return 'stash:' .. oneName(id)
end

---@type table<string, table> Stash operations behind a tray, keyed by inventory resource. Each entry
---provides items(id), setMetadata(id, slot, metadata) -> ok and open(source, id) -> ok; ox also
---needs ensure(id), since one_inventory creates a stash the first time it is opened.
local BACKENDS = {
    [OX] = {
        ensure = function(id)
            if registered[id] then return end
            registered[id] = true
            exports[OX]:RegisterStash(id, LABEL, 1, MAX_WEIGHT, false)
        end,
        items = function(id)
            return exports[OX]:GetInventoryItems(id)
        end,
        setMetadata = function(id, slot, metadata)
            exports[OX]:SetMetadata(id, slot, metadata)
            return true
        end,
        open = function(source, id)
            exports[OX]:forceOpenInventory(source, 'stash', id)
            return true
        end,
    },
    [ONE] = {
        items = function(id)
            return exports[ONE]:GetInventoryItems(oneRef(id))
        end,
        setMetadata = function(id, slot, metadata)
            return exports[ONE]:SetItemMetadata(oneRef(id), slot, metadata) ~= false
        end,
        open = function(source, id)
            return exports[ONE]:OpenInventory(source, 'stash', {
                id        = oneName(id),
                label     = LABEL,
                slots     = 1,
                maxWeight = MAX_WEIGHT,
            }) ~= false
        end,
    },
}

---The stash backend for the running inventory, nil when it cannot host trays.
---@return table|nil
local function backend()
    return BACKENDS[bridge.slotBackendName() or '']
end

---True when the running inventory can host SIM trays (ox_inventory or one_inventory).
---@return boolean
function tray.supported()
    return backend() ~= nil
end

---True when `id` has the shape of one of our tray ids.
---@param id any
---@return boolean
function tray.isTrayId(id)
    return type(id) == 'string' and id:sub(1, #PREFIX) == PREFIX
end

---The tray id behind a one_inventory stash reference or bare stash name, nil for anything else.
---@param ref any inventory reference from a one_inventory hook payload
---@return string|nil id
function tray.fromOneRef(ref)
    if type(ref) ~= 'string' then return nil end
    local key = ref:match('^stash:' .. ONE_PREFIX .. '(%w+)$') or ref:match('^' .. ONE_PREFIX .. '(%w+)$')
    return key and (PREFIX .. key) or nil
end

---Registers a tray with the inventory where it needs one (ox), once per id per session. Registered
---UNOWNED so it travels with the item rather than a character; holding the phone is what authorises
---access (see holderSlot).
---@param id string tray id
function tray.ensure(id)
    local b = backend()
    if not b or not b.ensure then return end
    pcall(b.ensure, id)
end

---The phone item row at `slot`, or nil when that slot holds anything else.
---@param source number player server id
---@param slot number|string|nil inventory slot
---@return { slot: number, name: string, metadata: table }|nil
local function phoneAt(source, slot)
    slot = tonumber(slot)
    if not slot then return nil end
    local row = bridge.getSlot(source, slot)
    if not row or not phoneItems[row.name] then return nil end
    return row
end

---The tray id stamped on a phone item, minting and writing one the first time that phone's tray
---is opened. Always resolved from the player's OWN slot; a client-supplied id is never trusted.
---@param source number player server id
---@param slot number|string|nil inventory slot holding a phone
---@return string|nil id
function tray.idFor(source, slot)
    local row = phoneAt(source, slot)
    if not row then return nil end
    local id = row.metadata.simTray
    if tray.isTrayId(id) then return id end
    id = PREFIX .. util.newId(ID_LEN)
    local metadata = row.metadata
    metadata.simTray = id
    if not bridge.setSlotMetadata(source, row.slot, metadata) then return nil end
    return id
end

---Items inside a tray. Nil when the id is not a tray, the inventory cannot host trays, or it
---refuses the read.
---@param id string tray id
---@return table|nil items
function tray.items(id)
    if not tray.isTrayId(id) then return nil end
    local b = backend()
    if not b then return nil end
    tray.ensure(id)
    local ok, items = pcall(b.items, id)
    return (ok and type(items) == 'table') and items or nil
end

---Overwrites the metadata of one slot inside a tray. False when the inventory refuses the write.
---@param id string tray id
---@param slot number slot inside the tray
---@param metadata table full metadata table to store
---@return boolean ok
function tray.setMetadata(id, slot, metadata)
    local b = backend()
    if not b or not tray.isTrayId(id) then return false end
    local ok, res = pcall(b.setMetadata, id, slot, metadata)
    return ok and res == true
end

---The slot of the phone this player carries whose tray is `id`, or nil when they carry no such
---phone. Backs the openInventory hook: a tray id is readable from the item's own metadata, so
---possession of the phone has to be the gate, not knowledge of the id.
---@param source number player server id
---@param id any tray id
---@return number|nil slot
function tray.holderSlot(source, id)
    if not tray.isTrayId(id) then return nil end
    for item in pairs(phoneItems) do
        for _, row in ipairs(bridge.searchSlots(source, item)) do
            if row.metadata and row.metadata.simTray == id then return row.slot end
        end
    end
    return nil
end

---Opens a phone's SIM tray for its holder. Force-opens because the item button is pressed from
---inside the inventory UI, where a plain open would close the view instead of swapping it.
---@param source number player server id
---@param slot number|string|nil inventory slot holding a phone
---@return boolean ok
function tray.open(source, slot)
    local b = backend()
    if not b then return false end
    local id = tray.idFor(source, slot)
    if not id then return false end
    tray.ensure(id)
    local ok, res = pcall(b.open, source, id)
    return ok and res == true
end

---Moves a phone off the legacy ox item-container tray onto its stash tray: any SIM inside the
---old container follows, then `container` is stripped. Stripping is the load-bearing half - ox
---keys its use-hijack off that metadata field, so a phone that keeps it never opens the phone UI.
---@param source number player server id
---@param row { slot: number, metadata: table } phone item row
---@return boolean migrated
local function migratePhone(source, row)
    local containerId = row.metadata.container
    if type(containerId) ~= 'string' or containerId == '' then return false end

    local id = tray.idFor(source, row.slot)
    local items = id and bridge.containerItems(source, row.slot)
    if id and type(items) == 'table' then
        tray.ensure(id)
        for _, item in pairs(items) do
            if item and item.name == config.Sim.SimItem then
                -- Remove BEFORE add, deliberately: a failed add loses one SIM (an admin can
                -- reissue it with /givesim bind), while a failed remove after a successful add
                -- would leave two cards sharing one number.
                local pulled = select(2, pcall(function()
                    return exports[OX]:RemoveItem(containerId, item.name, 1, nil, item.slot)
                end)) == true
                local moved = pulled and select(2, pcall(function()
                    return exports[OX]:AddItem(id, item.name, 1, item.metadata)
                end)) == true
                if not moved then
                    print(('^3[sd-phone:sim]^0 could not move SIM %s out of legacy container %s (slot %s)')
                        :format(tostring(item.metadata and item.metadata.number), containerId, tostring(row.slot)))
                end
                break
            end
        end
    end

    -- Re-read: idFor wrote the tray id, so the row captured above is stale.
    local fresh = bridge.getSlot(source, row.slot)
    local metadata = fresh and fresh.metadata or row.metadata
    metadata.container = nil
    metadata.size = nil
    return bridge.setSlotMetadata(source, row.slot, metadata)
end

---Converts every legacy-container phone this player carries. Offline players hold their inventory
---as a JSON blob, so there is no server-wide equivalent; this runs per player instead.
---@param source number player server id
---@return integer migrated phones converted
function tray.migrate(source)
    local count = 0
    for item in pairs(phoneItems) do
        for _, row in ipairs(bridge.searchSlots(source, item)) do
            if row.metadata and row.metadata.container and migratePhone(source, row) then
                count = count + 1
            end
        end
    end
    return count
end

---@type table<number, true> Players whose legacy sweep is already in flight.
local sweeping = {}

---Fires tray.migrate when any of `phones` still carries a legacy container. Hung off the phone
---LOOKUP rather than character load so it also catches a legacy phone that arrives mid-session
---from a drop or a trade. Deferred so a read path never turns into a write mid-call.
---@param source number player server id
---@param phones { metadata: table }[] rows from inv.findPhones
function tray.sweepLegacy(source, phones)
    if not tray.configured or sweeping[source] then return end
    local legacy = false
    for _, phone in ipairs(phones) do
        if phone.metadata and phone.metadata.container then
            legacy = true
            break
        end
    end
    if not legacy then return end

    sweeping[source] = true
    SetTimeout(0, function()
        pcall(tray.migrate, source)
        sweeping[source] = nil
    end)
end

return tray
