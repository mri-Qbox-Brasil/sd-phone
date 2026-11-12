---@type table Shared shim helpers (server.compat.qbphone.shared): registration and warnings.
local shim = require 'server.compat.qbphone.shared'

---AddNewTweet(tweetData), from Renewed's qb-phone fork: posts as a made-up name, which Birdy cannot
---do because every post belongs to a player's account. Reported once and dropped.
shim.registerExport('AddNewTweet', function()
    shim.warnOnce('AddNewTweet', ('AddNewTweet was called by %s but Birdy posts belong to player accounts, so a tweet under a made-up name was dropped'):format(shim.invoker()))
    return nil
end)
