import {useEffect,useState} from 'react'
import Taro from '@tarojs/taro'
import {catalog as loadCatalog,detail as loadDetail,state as loadState} from './api'
import type {Catalog,Detail,State} from './types'
export function useClubData(){
 const [data,setData]=useState<{catalog:Catalog;state:State;detail:Detail;clubId:string}|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true)
 async function reload(){try{const [c,s]=await Promise.all([loadCatalog(),loadState()]);const active=s.clubs.find(x=>x.role);if(!active)throw new Error('请先加入俱乐部');const d=await loadDetail(active.id);setData({catalog:c,state:s,detail:d,clubId:active.id});setError('')}catch(e){const error=e as Error&{status?:number};if(error.status===401){void Taro.redirectTo({url:'/pages/login/index'});return}setError(error.message)}finally{setLoading(false)}}
 useEffect(()=>{void reload()},[]);return {data,error,loading,reload}
}
export function go(path:string){void Taro.navigateTo({url:path})}

