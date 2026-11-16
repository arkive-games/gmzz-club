import {useEffect,useState} from 'react'
import {View,Text,Button} from '@tarojs/components'
import Taro,{useDidShow} from '@tarojs/taro'
import {Screen,Loading,ErrorState,Badge,EmptyState} from '../../components/Screen'
import {request,state as loadState} from '../../lib/api'
import {getActiveClubId,setActiveClubId} from '../../lib/store'
import type {Club,Detail,State} from '../../lib/types'
import './index.scss'

export default function Clubs(){
 const [state,setState]=useState<State|null>(null);const [selected,setSelected]=useState('');const [detail,setDetail]=useState<Detail|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [busy,setBusy]=useState('')
 async function reload(){setLoading(true);try{const next=await loadState();setState(next);const active=getActiveClubId();const first=next.clubs.find(x=>x.id===active)||next.clubs[0];if(first)setSelected(first.id);setError('')}catch(e){const failure=e as Error&{status?:number};if(failure.status===401){return}setError(failure.message)}finally{setLoading(false)}}
 useDidShow(()=>{void reload()})
 useEffect(()=>{const club=state?.clubs.find(x=>x.id===selected);if(!club?.role){setDetail(null);return}void request<Detail>('/clubs/'+club.id).then(setDetail).catch(()=>setDetail(null))},[state,selected])
 if(loading)return <Loading/>;if(error||!state)return <ErrorState message={error||'请先登录'} onRetry={reload}/>
 const club=state.clubs.find(x=>x.id===selected)||state.clubs[0]
 async function apply(target:Club){setBusy(target.id);try{await request('/clubs/'+target.id+'/applications','POST',{});Taro.showToast({title:'申请已提交',icon:'success'});await reload()}catch(e){Taro.showToast({title:(e as Error).message||'申请失败',icon:'none'})}finally{setBusy('')}}
 function enter(target:Club){setActiveClubId(target.id);Taro.switchTab({url:'/pages/index/index'})}
 return <Screen title="俱乐部" subtitle="发现、加入并进入你的俱乐部。"><View className="club-tabs">{state.clubs.map(c=><View className={'club-tab '+(c.id===club?.id?'active':'')} key={c.id} onClick={()=>setSelected(c.id)}><Text>{c.name}</Text><Text className="club-tab-count">{c.member_count}人</Text></View>)}</View>{club?<View className="club-detail card"><View className="club-detail-head"><View><Text className="club-detail-name">{club.name}</Text><Text className="club-detail-meta">{club.member_count} 位成员</Text></View>{club.role?<Badge tone={club.role==='owner'?'warning':'success'}>{club.role==='owner'?'会长':club.role==='admin'?'管理员':'已加入'}</Badge>:club.application_status==='pending'?<Badge tone="warning">审核中</Badge>:<Button size="mini" type="primary" loading={busy===club.id} onClick={()=>apply(club)}>申请加入</Button>}</View><Text className="club-description">{club.description||'这个俱乐部还没有写简介。'}</Text>{club.role&&detail?<View className="club-stats"><View><Text className="stat-value">{detail.members.length}</Text><Text className="muted">成员</Text></View><View><Text className="stat-value">{detail.events.length}</Text><Text className="muted">活动</Text></View><View><Text className="stat-value">{detail.characters.length}</Text><Text className="muted">角色</Text></View></View>:null}{club.role&&<Button className="club-enter" type="primary" onClick={()=>enter(club)}>进入俱乐部</Button>}</View>:<EmptyState message="暂时没有可查看的俱乐部。"/>}<View className="section-head"><Text className="section-title">我的俱乐部</Text><Text className="muted">{state.clubs.filter(x=>x.role).length} 个</Text></View>{state.clubs.filter(x=>x.role).map(c=><View className="card club-row" key={c.id} onClick={()=>{setSelected(c.id);setActiveClubId(c.id)}}><View className="club-mark">{c.name.slice(0,1)}</View><View className="flex1"><Text className="character-name">{c.name}</Text><Text className="character-meta">{c.member_count} 位成员 · {c.description||'俱乐部成员'}</Text></View><Text className="muted">查看 ›</Text></View>)}</Screen>
}

