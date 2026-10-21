// What the phone (shell/CustomAppFrame.tsx) and the SDK in an app's page say to each other. Both
// sides import these, so a renamed message or endpoint fails the type check on both.

/** The endpoints the SDK calls through the bridge's fetchPhone. */
export type PhoneEndpoint =
    | 'SetPopUp' | 'SetContextMenu' | 'SetContactModal' | 'ShowComponent' | 'GetSettings' | 'GetLocale'
    | 'SendNotification' | 'CreateCall' | 'toggleInput' | 'OpenMedia' | 'GetPhoneNumber' | 'GetEmails'
    | 'SavePassword' | 'GetStorage' | 'SetStorage';

/** Posted by the phone to the page. Lua's sendCustomAppMessage pushes ({ action, data }) travel alongside. */
export type HostMessage =
    | { type: 'settingsUpdated'; settings: unknown }
    | { type: 'popUpInputChanged'; value: string }
    | { type: 'appOpen' | 'appClose'; data: { id?: string } };

/** Posted by the page to the phone. */
export type PageMessage =
    | { type: 'sdphoneSdkReady' }
    | { type: 'sdphoneDebug'; message: string }
    | { type: 'sdphoneCloseApp' };
