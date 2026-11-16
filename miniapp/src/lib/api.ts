import Taro from '@tarojs/taro'
import type {Catalog,Detail,State} from './types'
const BASE=process.env.TARO_APP_API_BASE||'https://your-domain.example.com'
let cookie=Taro.getStorageSync<string>('club_cookie')||''
export async function request<T=unknown>(path:string,method:'GET'|'POST'|'PUT'|'DELETE'='GET',body?:unknown):Promise<T>{
 const result=await Taro.request({url:BASE+'/api'+path,method,data:body,header:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})}})
 const setCookie=result.header?.['Set-Cookie']||result.header?.['set-cookie'];if(setCookie){cookie=setCookie.split(';')[0];Taro.setStorageSync('club_cookie',cookie)}
 if(result.statusCode>=400){const error=(result.data as {error?:string})?.error||'请求失败';throw Object.assign(new Error(error),{status:result.statusCode})}
 return result.data as T
}
export const catalog=()=>request<Catalog>('/catalog')
export const state=()=>request<State>('/state')
export const detail=(id:string)=>request<Detail>('/clubs/'+id)
export const login=(username:string,password:string)=>request<{id:string}>('/auth/login','POST',{username,password,displayName:''})
export const register=(username:string,password:string,displayName:string)=>request<{id:string}>('/auth/register','POST',{username,password,displayName})
export const logout=()=>request('/auth/logout','POST')
