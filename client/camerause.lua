---@type table Callable check (shared.callable): the hooks arrive as function references.
local callable = require 'shared.callable'
---@type table Custom third-party app registry (client.customapps): whose app an identifier is.
local customApps = require 'client.customapps'

---@type table Camera-use module; the table returned at end of file.
---
---How a custom app calls the phone's camera for something other than a photograph. The page side
---of an app has UseCamera for that: the camera comes up over the app, takes one picture and hands
---back its URL. This is the same camera over the same app, lent to the app's RESOURCE instead:
---exports['sd-phone']:useCamera(identifier, { ... }) brings it up, and from then on the resource is
---told when the camera has the view, each time the shutter is pressed (no photograph is taken),
---and when the camera is put away. It may name a page of its own to be drawn over the viewfinder
---and push messages into it. What the shutter means is the resource's: scan what is in the
---picture, read a number plate, mark a spot.
---
---Nothing is added to the Camera app. Opened from the home screen it is the camera it always was;
---a resource has it for as long as its own app has called for it and no longer.
local M = {}

---@class CameraUse What a resource asked for when it called the camera.
---@field app string the custom app the camera is up over
---@field resource string the resource that called
---@field id integer which call this is: the page says it back, so a late answer is not taken for the next one's
---@field view table what the page is told: { hint?, overlay? }
---@field live boolean whether the camera has the view yet
---@field onOpen function|nil
---@field onShutter function|nil
---@field onClose function|nil

---@type CameraUse|nil The one use there is at a time, or nil.
local use

---@type integer The last call's number.
local lastId = 0

---Runs one of the hooks, in a thread of its own: it is another resource's code, it may yield, and
---neither an error in it nor a wait should reach the NUI callback that set it off.
---@param fn function|nil
---@param name string for the message if it errors
local function fire(fn, name)
    if not fn then return end

    CreateThread(function()
        local ok, err = pcall(fn)

        if not ok then print(('^3[sd-phone] useCamera: %s errored: %s^7'):format(name, tostring(err))) end
    end)
end

---Tells the page which app, if any, has the camera up over it.
---@param app string
---@param view table|nil nil takes the camera away again
---@param id integer|nil
local function push(app, view, id)
    SendNUIMessage({ action = 'customApps:camera', data = { id = app, use = view and { id = id, hint = view.hint, overlay = view.overlay } or false } })
end

---Brings the camera up over a custom app.
---@param identifier any the app, which must be the calling resource's own
---@param data any { hint?, overlay?, onOpen?, onShutter?, onClose? }
---@param resource string the resource asking
---@return boolean ok, string? err
function M.start(identifier, data, resource)
    if type(identifier) ~= 'string' or not customApps.has(identifier) then return false, 'no such custom app' end
    if customApps.owner(identifier) ~= resource then return false, 'not your app' end
    if type(data) ~= 'table' then return false, 'expected a table of options' end
    if use then return false, ('the camera is in use by %s'):format(use.resource) end

    lastId = lastId + 1

    use = {
        app = identifier,
        resource = resource,
        id = lastId,
        view = {
            hint = type(data.hint) == 'string' and data.hint ~= '' and #data.hint <= 24 and data.hint or nil,
            overlay = type(data.overlay) == 'string' and data.overlay ~= '' and data.overlay or nil,
        },
        live = false,
        onOpen = callable.is(data.onOpen) and data.onOpen or nil,
        onShutter = callable.is(data.onShutter) and data.onShutter or nil,
        onClose = callable.is(data.onClose) and data.onClose or nil,
    }

    push(identifier, use.view, use.id)

    return true
end

---What an app's frame should be showing: the camera, when the app has called for it. Asked by a
---frame as it comes to the front, since a call made a moment before it was there to hear went past it.
---@param identifier any
---@return table|false view { id, hint?, overlay? }
function M.viewFor(identifier)
    if not use or use.app ~= identifier then return false end

    return { id = use.id, hint = use.view.hint, overlay = use.view.overlay }
end

---The camera the page put up for a call has the view.
---@param id any the call the page says it is for
function M.opened(id)
    if not use or use.id ~= id or use.live then return end

    use.live = true
    fire(use.onOpen, 'onOpen')
end

---The shutter was pressed in a called camera.
---@param id any
function M.shutter(id)
    if use and use.id == id and use.live then fire(use.onShutter, 'onShutter') end
end

---The use is over, whichever end it came from: the page is told to take the camera down (it may
---have done so already), and the resource is told it has gone.
local function finish()
    local ended = use

    if not ended then return end

    use = nil
    push(ended.app, nil)
    fire(ended.onClose, 'onClose')
end

---The viewfinder has gone (client/apps/camera.lua): closed by the player, put away with the
---phone, or taken down by the page. A called camera that was up has ended with it.
function M.viewfinderClosed()
    if use and use.live then finish() end
end

---The page took the camera down before it ever had the view (the app was left at once).
---@param id any
function M.dismissed(id)
    if use and use.id == id then finish() end
end

---Ends a use from the resource's side. Only the resource that called may.
---@param resource string the resource asking
---@return boolean ok, string? err
function M.stop(resource)
    if not use then return false, 'the camera is not in use' end
    if use.resource ~= resource then return false, 'not your camera' end

    finish()

    return true
end

---Pushes a message into the page a use has over the viewfinder, which gets it as a window
---`message` event. Only the resource that called may.
---@param message any anything that survives JSON
---@param resource string the resource asking
---@return boolean ok, string? err
function M.send(message, resource)
    if not use then return false, 'the camera is not in use' end
    if use.resource ~= resource then return false, 'not your camera' end

    SendNUIMessage({ action = 'sd-phone:camera:useMessage', data = { id = use.id, payload = message } })

    return true
end

---Whether a resource has the camera, and which.
---@return string|nil resource
function M.user() return use and use.resource or nil end

---Resource-stop cleanup: a resource that stops with the camera up loses it. Its onClose is not
---run: there is nobody left to run it.
---@param stopped string name of the resource that stopped
AddEventHandler('onResourceStop', function(stopped)
    if stopped == GetCurrentResourceName() or not use or use.resource ~= stopped then return end

    local app = use.app

    use = nil
    push(app, nil)
end)

return M
