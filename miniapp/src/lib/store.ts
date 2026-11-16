import {useState} from 'react'
import Taro,{useDidShow} from '@tarojs/taro'
import {catalog as loadCatalog,detail as loadDetail,state as loadState} from './api'
import type {Catalog,Detail,State} from './types'
const ACTIVE_CLUB_KEY='active_club_id'
export const getActiveClubId=()=>Taro.getStorageSync<string>(ACTIVE_CLUB_KEY)||''
export const setActiveClubId=(id:string)=>Taro.setStorageSync(ACTIVE_CLUB_KEY,id)
export function useAccountData(){
 const [data,setData]=useState<{catalog:Catalog;state:State;clubId:string}|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true)
 async function reload(){try{const [c,s]=await Promise.all([loadCatalog(),loadState()]);const active=s.clubs.find(x=>x.id===getActiveClubId()&&x.role)||s.clubs.find(x=>x.role);setData({catalog:c,state:s,clubId:active?.id||''});setError('')}catch(e){const failure=e as Error&{status?:number};if(failure.status===401)return;setError(failure.message)}finally{setLoading(false)}}
 useDidShow(()=>{void reload()});return {data,error,loading,reload}
}
export function useClubData(){
 const [data,setData]=useState<{catalog:Catalog;state:State;detail:Detail;clubId:string}|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true)
 async function reload(){try{const [c,s]=await Promise.all([loadCatalog(),loadState()]);const selected=getActiveClubId();const active=s.clubs.find(x=>x.id===selected&&x.role)||s.clubs.find(x=>x.role);if(!active)throw new Error('请先加入俱乐部');if(active.id!==selected)setActiveClubId(active.id);const d=await loadDetail(active.id);setData({catalog:c,state:s,detail:d,clubId:active.id});setError('')}catch(e){const error=e as Error&{status?:number};if(error.status===401){return}setError(error.message)}finally{setLoading(false)}}
 useDidShow(()=>{void reload()});return {data,error,loading,reload}
}
export function go(path:string){void Taro.navigateTo({url:path})}

