# WeChat mini-program client

The mini-program lives in `miniapp/` and targets WeChat only:

- Taro 4.3.3
- React 18 + TypeScript
- NutUI React Taro 4.0.0-beta.9
- Webpack 5.91.0

The visual language is the existing club UI translated to native mini-program components. Cards, warm surfaces, pathway colors, compact status tags and the five-squad board remain the same. Web-only shadcn/ReUI components are not imported. The current pages use Taro native controls.

## Development

```powershell
cd miniapp
npm install
$env:TARO_APP_API_BASE = 'https://club.example.com'
npm run dev:weapp
```

Open `miniapp/` in WeChat DevTools; `project.config.json` points to the generated `dist/` directory. For a release build use `npm run build:weapp`. Keep both `setting.es6` and `setting.enhance` disabled: Taro already transpiles the bundle, and DevTools enhanced compilation caused module loading errors when switching pages. The API host must be HTTPS and registered in the WeChat request domain list. The backend remains the existing Go + PostgreSQL service.

Each protected page checks the session whenever it becomes visible. A missing session or API response with status 401 automatically clears the protected page stack and opens the login page; no login prompt button is required. The login button uses a bundled WeChat icon without requesting a remote image.

The client calls `wx.login()` through Taro and exchanges the one-time code at `/api/auth/wechat`. The Go service calls WeChat's `jscode2session`, creates or reuses the account by `openid`, and returns the same seven-day HttpOnly session cookie used by the rest of the API. Set `WECHAT_APPID` and `WECHAT_APP_SECRET` in the Go service environment before using the authorization button. The username/password endpoints remain available for migration and API compatibility.

The lineup board uses touch events instead of browser drag APIs. Press a candidate, release it on a slot, and the existing server revision check handles concurrent administrator edits. Pathway tags are available on the character page and lineup candidate pool. New activities default to three teams; managers can add or remove teams from the lineup screen.

