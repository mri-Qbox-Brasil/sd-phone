---@type table Shared shim helpers (server.compat.qbphone.shared): registration, guards, warnings.
local shim = require 'server.compat.qbphone.shared'
---@type table sd-phone config root (configs/config.lua): the per-group member cap.
local config = require 'configs.config'
---@type table Authoritative group handlers (server.groups.actions): create, lookups, active pointer.
local actions = require 'server.groups.actions'
---@type table Groups persistence layer (server.groups.store): membership writes and disbanding.
local store = require 'server.groups.store'
---@type table Server notify bridge (bridge.server.notify): framework toasts for NotifyGroup.
local notify = require 'bridge.server.notify'
---@type table Player bridge (bridge.server.player): identities and names of members.
local player = require 'bridge.server.player'

---@type table<string, { status: any, stage: table }> Job status and stages per group. Renewed's fork
---kept these in memory for the session, and so does the shim.
local jobState = {}

---@type table<string, boolean> Groups the shim created through CreateGroup, the only ones
---DestroyGroup may disband. A player's own group outlives any job a script runs with it.
local scriptCreated = {}

---The sd-phone group behind a Renewed group id; sd-phone ids are strings.
---@param groupId any
---@return table|nil
local function groupFor(groupId)
    if groupId == nil then return nil end
    return actions.getGroupForExport(tostring(groupId))
end

---The online members of a group as { src, name, citizenid }, leader first.
---@param group table export view from actions.getGroupForExport
---@return { src: number, name: string, citizenid: string }[]
local function onlineMembers(group)
    local out = {}
    for _, m in ipairs(group.members or {}) do
        if m.source then
            local entry = { src = m.source, name = m.name, citizenid = m.citizenid }
            if m.citizenid == group.leaderCitizenid then
                table.insert(out, 1, entry)
            else
                out[#out + 1] = entry
            end
        end
    end
    return out
end

---The leader's server id, nil while they are offline.
---@param group table
---@return number|nil
local function leaderSource(group)
    for _, m in ipairs(group.members or {}) do
        if m.citizenid == group.leaderCitizenid then return m.source end
    end
    return nil
end

---The status and stages a group's job is at, created on first use.
---@param groupId any
---@return { status: any, stage: table }
local function stateOf(groupId)
    local id = tostring(groupId)
    local s = jobState[id]
    if not s then
        s = { status = 'WAITING', stage = {} }
        jobState[id] = s
    end
    return s
end

---Fires a client event at every online member of a group.
---@param groupId any
---@param eventName string
---@param ... any
local function toMembers(groupId, eventName, ...)
    local group = groupFor(groupId)
    if not group then return end
    for _, m in ipairs(onlineMembers(group)) do TriggerClientEvent(eventName, m.src, ...) end
end

---NotifyGroup(groupId, message, type): a framework toast for every online member.
shim.registerExport('NotifyGroup', function(groupId, message, kind)
    local group = groupFor(groupId)
    if not group then return end
    local toast = (kind == 'success' or kind == 'error') and kind or 'info'
    for _, m in ipairs(onlineMembers(group)) do notify.to(m.src, shim.text(message), toast) end
end)

---pNotifyGroup(groupId, header, message, icon, colour, length): a phone banner for every online member.
shim.registerExport('pNotifyGroup', function(groupId, header, message)
    local group = groupFor(groupId)
    if not group then return end
    local title = shim.text(header)
    for _, m in ipairs(onlineMembers(group)) do
        TriggerClientEvent('sd-phone:client:notify', m.src, {
            app = 'groups', appId = 'groups',
            title = title ~= '' and title or group.name or 'Group',
            body = shim.text(message), time = 'now',
        })
    end
end)

---CreateBlipForGroup(groupId, name, data): a map blip on every online member's client, drawn the
---way Renewed's client drew it.
shim.registerExport('CreateBlipForGroup', function(groupId, name, data)
    toMembers(groupId, 'sd-phone:client:compat:qb:groupBlip', name, data)
end)

---RemoveBlipForGroup(groupId, name): removes a blip CreateBlipForGroup drew.
shim.registerExport('RemoveBlipForGroup', function(groupId, name)
    toMembers(groupId, 'sd-phone:client:compat:qb:groupBlipRemove', name)
end)

---triggerGroupEvent(eventName, groupId, ...): any client event at every online member.
shim.registerExport('triggerGroupEvent', function(eventName, groupId, ...)
    local name = shim.text(eventName)
    if name == '' then return end
    toMembers(groupId, name, ...)
end)

---GetGroupByMembers(source): the id of the group a player is active in, nil when none.
shim.registerExport('GetGroupByMembers', function(source)
    local src = shim.source(source)
    return src and actions.getActiveGroupIdFor(src) or nil
end)

---getGroupMembers(groupId): the server ids of the group's online members.
shim.registerExport('getGroupMembers', function(groupId)
    local group = groupFor(groupId)
    if not group then return {} end
    local out = {}
    for _, m in ipairs(onlineMembers(group)) do out[#out + 1] = m.src end
    return out
end)

---getGroupSize(groupId): how many members are online, which is how big the crew on a job is.
shim.registerExport('getGroupSize', function(groupId)
    local group = groupFor(groupId)
    return group and #onlineMembers(group) or 0
end)

---GetGroupLeader(groupId): the leader's server id, nil while they are offline.
shim.registerExport('GetGroupLeader', function(groupId)
    local group = groupFor(groupId)
    return group and leaderSource(group) or nil
end)

---isGroupLeader(source, groupId): whether a player leads a group.
shim.registerExport('isGroupLeader', function(source, groupId)
    local group = groupFor(groupId)
    local src = shim.source(source)
    return group ~= nil and src ~= nil and leaderSource(group) == src
end)

---GetGroupMembersNames(groupId): every online member as { name, playerId, isLeader }.
shim.registerExport('GetGroupMembersNames', function(groupId)
    local group = groupFor(groupId)
    if not group then return nil end
    local leader = leaderSource(group)
    local out = {}
    for _, m in ipairs(onlineMembers(group)) do
        out[#out + 1] = { name = m.name, playerId = m.src, isLeader = m.src == leader }
    end
    return out
end)

---GetGroup(groupId): the group in the fork's own shape.
shim.registerExport('GetGroup', function(groupId)
    local group = groupFor(groupId)
    if not group then return nil end
    local s = stateOf(group.id)
    local members = {}
    for _, m in ipairs(onlineMembers(group)) do
        members[#members + 1] = { name = m.name, CID = m.citizenid, Player = m.src }
    end
    return {
        id = group.id, GName = group.name, Users = #members, leader = leaderSource(group),
        members = members, status = s.status, stage = s.stage, ScriptCreated = scriptCreated[group.id] == true,
    }
end)

---getAllGroups(): every group an online player is active in, as { id, name, memberCount }.
shim.registerExport('getAllGroups', function()
    local seen, out = {}, {}
    for _, src in pairs(player.activeCidMap()) do
        local id = actions.getActiveGroupIdFor(src)
        if id and not seen[id] then
            seen[id] = true
            local group = groupFor(id)
            if group then
                out[#out + 1] = { id = group.id, name = group.name, memberCount = #onlineMembers(group) }
            end
        end
    end
    return out
end)

---AddMember(groupId, source): adds a player to a group and makes it their active one.
shim.registerExport('AddMember', function(groupId, source)
    local group = groupFor(groupId)
    local src = shim.source(source)
    local cid = src and player.getIdentifier(src)
    if not group or not cid then return false end
    if not store.isMember(group.id, cid) then
        if #group.members >= (config.Groups.MaxMembersPerGroup or 16) then return false end
        store.addMember(group.id, cid, player.getName(src))
    end
    store.setActiveGroupId(cid, group.id)
    return true
end)

---CreateGroup(source, name, password): a group led by the player, made their active one. Only
---groups made here can be destroyed by DestroyGroup.
shim.registerExport('CreateGroup', function(source, name)
    local src = shim.source(source)
    if not src then return nil end
    local result = actions.create(src, { name = shim.text(name) })
    if not result.success or not result.data then
        shim.warnOnce('CreateGroup.refused', ('CreateGroup was refused for %s: %s'):format(shim.invoker(), result.message or 'unknown reason'))
        return nil
    end
    local id = result.data.id
    actions.setActive(src, { groupId = id })
    scriptCreated[id] = true
    return id
end)

---isGroupTemp(groupId): whether the group was made by a script through CreateGroup.
shim.registerExport('isGroupTemp', function(groupId)
    return groupId ~= nil and scriptCreated[tostring(groupId)] == true
end)

---DestroyGroup(groupId): disbands a group CreateGroup made. A player's own group is never deleted
---for a job; its job state is cleared instead.
shim.registerExport('DestroyGroup', function(groupId)
    local group = groupFor(groupId)
    if not group then return end
    local id = group.id
    jobState[id] = nil

    if not scriptCreated[id] then
        shim.warnOnce('DestroyGroup.persistent', ('DestroyGroup was called by %s on a group a player made; sd-phone groups are kept, so only its job state was cleared'):format(shim.invoker()))
        return
    end

    local members = {}
    for _, m in ipairs(onlineMembers(group)) do members[#members + 1] = m.src end
    store.deleteGroup(id)
    store.clearActiveGroupEverywhere(id)
    scriptCreated[id] = nil
    for i = 1, #members do
        TriggerClientEvent('sd-phone:client:groups:disbanded', members[i], { groupId = id, name = group.name })
    end
    TriggerEvent('qb-phone:server:GroupDeleted', id, members)
end)

---setJobStatus(groupId, status, stages): the job a group is on and its steps.
shim.registerExport('setJobStatus', function(groupId, status, stages)
    if not groupFor(groupId) then return end
    local s = stateOf(groupId)
    s.status = status
    s.stage = type(stages) == 'table' and stages or {}
end)

---getJobStatus(groupId): the status setJobStatus last stored.
shim.registerExport('getJobStatus', function(groupId)
    if not groupFor(groupId) then return nil end
    return stateOf(groupId).status
end)

---resetJobStatus(groupId): back to WAITING with no stages.
shim.registerExport('resetJobStatus', function(groupId)
    if not groupFor(groupId) then return end
    jobState[tostring(groupId)] = nil
end)

---GetGroupStages(groupId): the stages setJobStatus last stored.
shim.registerExport('GetGroupStages', function(groupId)
    if not groupFor(groupId) then return nil end
    return stateOf(groupId).stage
end)
