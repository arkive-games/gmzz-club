import Taro from '@tarojs/taro'
import {View,Text} from '@tarojs/components'
import {Button,Tag,Empty as NutEmpty} from '@nutui/nutui-react-taro'
import {Screen,Loading,ErrorState} from '../../components/Screen'
import {useClubData,go} from '../../lib/store'
import {date} from '../../lib/types'
import './index.scss'
export default function Events(){const {data,error,loading,reload}=useClubData();if(loading)return <Loading/>;if(error||!data)return <ErrorState message={error||'请先登录'} onRetry={reload}/>;return <Screen title="活动与团队" subtitle="从报名到出战，让每次集结井然有序。"><View className="event-count"><Text>{data.detail.events.length} 场活动</Text><Button size="small" type="primary" onClick={()=>reload()}>刷新</Button></View>{data.detail.events.length?data.detail.events.map(e=>{const closed=new Date(e.deadline)<=new Date(data.state.now);const signup=data.detail.signups.filter(s=>s.event_id===e.id).length;return <View className="event-card" key={e.id} onClick={()=>go('/pages/lineup/index?event='+e.id)}><View className="date-tile"><Text>{new Date(e.starts_at).getMonth()+1}月</Text><Text className="date-day">{new Date(e.starts_at).getDate()}</Text><Text>{new Date(e.starts_at).toLocaleString('zh-CN',{weekday:'short'})}</Text></View><View className="flex1"><View className="pill-row"><Tag type={closed?'default':'success'}>{closed?'报名截止':'开放报名'}</Tag><Text className="muted">{e.team_count} 个团队</Text></View><Text className="event-title">{e.title}</Text><Text className="event-meta">{date(e.starts_at)} · 截止 {date(e.deadline)}</Text><Text className="event-description">{e.description||'俱乐部活动，期待你的加入。'}</Text><Text className="muted">{signup} 人已报名 · 查看团队 ›</Text></View></View>}) : <NutEmpty description="俱乐部暂时没有活动"/>}</Screen>}


