-- Status bar - cosmetic carrier text + signal/battery indicators. The phone
-- has no real connectivity model yet, so these are static for now.
return {
    Carrier      = 'LifeInvader',
    SignalBars   = 4,        -- 0..4
    ShowWifi     = true,
    BatteryStart = 100,      -- 0..100, the percentage every phone shows when the player loads in

    -- Battery drain. False keeps the battery at BatteryStart for the whole session. True takes one
    -- percent off every BatteryDrainSeconds while the phone is open.
    --
    -- The battery is purely visual either way. Reaching 0% does NOT switch the phone off or block
    -- calls, messages or apps: the icon just shows empty. It never recharges, and it goes back to
    -- BatteryStart when the player rejoins or the resource restarts.
    BatteryDrain        = false,
    BatteryDrainSeconds = 30,  -- seconds of open-phone time per 1%; 30 empties a full battery in about 50 minutes
}
