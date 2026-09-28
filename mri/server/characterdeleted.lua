local wipe = require 'server.admin.wipe'

AddEventHandler('qbx_core:server:characterDeleted', function(citizenid)
    if type(citizenid) ~= 'string' or citizenid == '' then return end

    local _, rows = wipe.wipeCid(citizenid)
    lib.print.info(('wiped phone data for deleted character %s (%d rows)'):format(citizenid, rows or 0))
end)
