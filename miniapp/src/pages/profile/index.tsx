import {useState} from 'react'
import {View,Text,Button} from '@tarojs/components'
import Taro,{useDidShow} from '@tarojs/taro'
import {request} from '../../lib/api'
import {getActiveClubId,setActiveClubId} from '../../lib/store'
import type {State} from '../../lib/types'
import {ErrorState,Loading,Screen,Badge} from '../../components/Screen'
import './index.scss'
export default function Profile(){
 const [state,setState]=useState<State|null>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [activeId,setActiveId]=useState(getActiveClubId())
 async function reload(){try{setState(await request<State>('/state'));setError('')}catch(e){const failure=e as Error&{status?:number};if(failure.status===401){return}setError(failure.message)}finally{setLoading(false)}}
 useDidShow(()=>{void reload()})
 if(loading)return <Loading/>;if(error||!state)return <ErrorState message={error||'请先登录'} onRetry={reload}/>
 const clubs=state.clubs.filter(x=>x.role);const active=clubs.find(x=>x.id===activeId)||clubs[0]
 async function chooseClub(){if(!clubs.length)return;try{const result=await Taro.showActionSheet({itemList:clubs.map(x=>x.name)});const next=clubs[result.tapIndex];if(!next)return;setActiveClubId(next.id);setActiveId(next.id);Taro.showToast({title:`已切换到${next.name}`,icon:'success'});Taro.switchTab({url:'/pages/index/index'})}catch{}}
 return <Screen title="我的" subtitle="微信账号与俱乐部设置。" leading={<Button size="mini" onClick={chooseClub}>切换俱乐部</Button>}><View className="card account-card"><View className="profile-avatar"><Text>{state.me.display_name.slice(0,1)||'微'}</Text></View><View className="profile-main"><Text className="profile-name">{state.me.display_name}</Text><Text className="profile-line">微信号：{state.me.wechat_openid||state.me.username}</Text><Text className="profile-line">账号：{state.me.username}</Text>{state.me.is_admin&&<Badge tone="warning">平台管理员</Badge>}</View></View><View className="section-head"><Text className="section-title">我的俱乐部</Text><Text className="muted">{clubs.length} 个</Text></View>{clubs.length?clubs.map(club=><View className={'card club-card '+(club.id===active?.id?'selected':'')} key={club.id} onClick={()=>{setActiveClubId(club.id);setActiveId(club.id);Taro.switchTab({url:'/pages/index/index'})}}><View className="flex1"><Text className="club-name">{club.name}</Text><Text className="club-meta">{club.member_count} 位成员 · {club.role==='owner'?'会长':club.role==='admin'?'管理员':'成员'}</Text></View>{club.id===active?.id&&<Badge tone="success">当前</Badge>}</View>):<View className="card"><Text className="muted">还没有加入俱乐部。</Text></View>}</Screen>
}
