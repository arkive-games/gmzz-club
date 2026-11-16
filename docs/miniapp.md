# WeChat mini-program client

The mini-program lives in `miniapp/` and targets WeChat only:

- Taro 4.3.3
- React 18 + TypeScript
- NutUI React Taro 3.0.24-cpp-beta.4
- Webpack 5.91.0

The visual language is the existing club UI translated to native mini-program components. Cards, warm surfaces, pathway colors, compact status tags and the five-squad board remain the same. Web-only shadcn/ReUI components are not imported. NutUI supplies buttons, tags, inputs, picker, popup, input number and empty states.

## Development

```powershell
cd miniapp
npm install
$env:TARO_APP_API_BASE = 'https://club.example.com'
npm run dev:weapp
```

Open the generated `miniapp/dist` directory in the WeChat DevTools. For a release build use `npm run build:weapp`. The API host must be HTTPS and registered in the WeChat request domain list. The backend remains the existing Go + PostgreSQL service.

The client stores the API session cookie in mini-program storage and sends it on subsequent requests. Production should eventually exchange `wx.login()` code for the account session; the current username/password flow is retained for local migration and API compatibility.

The lineup board uses touch events instead of browser drag APIs. Press a candidate, release it on a slot, and the existing server revision check handles concurrent administrator edits. Pathway tags are available on the character page and lineup candidate pool. New activities default to three teams; managers can add or remove teams from the lineup screen.

