--[[
    Carregado ANTES de client/main.lua (ver fxmanifest): acrescenta ao snapshot do
    bridge de clima a temperatura local do jogador vinda do mri_Qweather.

    MRI: o app de Clima, o widget e Ajustes usam essa temperatura (e a unidade dela)
    no lugar da que o telefone inventa. Sem o mri_Qweather, o snapshot fica igual.
]]

local weather = require 'bridge.client.weather'
local read = weather.read

local function readTemperature()
    if GetResourceState('mri_Qweather') ~= 'started' then return nil end
    local ok, data = pcall(function() return exports.mri_Qweather:GetTemperatureData() end)
    if not ok or type(data) ~= 'table' or type(data.value) ~= 'number' then return nil end
    return { value = data.value, unit = data.unit == 'F' and 'F' or 'C' }
end

weather.read = function()
    local snapshot = read()
    snapshot.temperature = readTemperature()
    return snapshot
end
