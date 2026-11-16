import Taro from '@tarojs/taro'

export const SESSION_KEY = 'club_cookie'
const LOGIN_URL = '/pages/login/index'
let redirecting = false

export function redirectToLogin() {
  const pages = Taro.getCurrentPages()
  if (redirecting || pages[pages.length - 1]?.route === LOGIN_URL.slice(1)) return
  redirecting = true
  // Clear the protected page stack as well as switching away from tab pages.
  void Taro.reLaunch({url: LOGIN_URL}).finally(() => { redirecting = false })
}

export function clearSession() {
  Taro.removeStorageSync(SESSION_KEY)
}

export function requireSession() {
  if (Taro.getStorageSync<string>(SESSION_KEY)) return true
  redirectToLogin()
  return false
}
