--[[
    Carregado ANTES de client/main.lua (ver fxmanifest): o sd-phone registra o
    keybind no load do arquivo, entao interceptamos o lib.addKeybind pra trocar
    so o do telefone. Qualquer outro keybind passa direto.

    MRI: a tecla vem de configs/phone.lua (Keybind). O nome muda pra que o bind
    antigo do jogador (F1) nao seja reaproveitado.
]]

local addKeybind = lib.addKeybind

rawset(lib, 'addKeybind', function(data)
    if data.name == 'sdphone_toggle' then
        data.name = 'mri_sdphone_toggle'
    end

    return addKeybind(data)
end)
