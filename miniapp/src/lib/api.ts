import Taro from '@tarojs/taro'
import type {Catalog,Detail,State} from './types'
import {SESSION_KEY,clearSession,redirectToLogin,requireSession} from './auth'
const BASE=process.env.TARO_APP_API_BASE||'https://your-domain.example.com'
export async function request<T=unknown>(path:string,method:'GET'|'POST'|'PUT'|'DELETE'='GET',body?:unknown):Promise<T>{
 const protectedRequest=path!=='/catalog'&&!path.startsWith('/auth/')
 if(protectedRequest&&!requireSession())throw Object.assign(new Error('请先登录'),{status:401})
 const cookie=Taro.getStorageSync<string>(SESSION_KEY)||''
 const result=await Taro.request({url:BASE+'/api'+path,method,data:body,header:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})}})
 const setCookie=result.header?.['Set-Cookie']||result.header?.['set-cookie'];if(setCookie){Taro.setStorageSync(SESSION_KEY,setCookie.split(';')[0])}
 if(result.statusCode===401&&protectedRequest){clearSession();redirectToLogin()}
 if(result.statusCode>=400){const error=(result.data as {error?:string})?.error||'请求失败';throw Object.assign(new Error(error),{status:result.statusCode})}
 return result.data as T
}
export const catalog=()=>request<Catalog>('/catalog')
export const state=()=>request<State>('/state')
export const detail=(id:string)=>request<Detail>('/clubs/'+id)
export const loginWithWechat=(code:string,displayName='')=>request<{id:string}>('/auth/wechat','POST',{code,displayName})
export const register=(username:string,password:string,displayName:string)=>request<{id:string}>('/auth/register','POST',{username,password,displayName})
export const logout=async()=>{await request('/auth/logout','POST');clearSession();redirectToLogin()}
