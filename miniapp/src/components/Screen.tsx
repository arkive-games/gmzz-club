import {View,Text,Button} from '@tarojs/components'
import type {ReactNode} from 'react'
import {useEffect} from 'react'
import {redirectToLogin} from '../lib/auth'
import './screen.scss'
export function Screen({title,subtitle,children,action,leading}:{title:string;subtitle?:string;children:ReactNode;action?:ReactNode;leading?:ReactNode}){return <View className="screen"><View className="screen-head"><View>{leading}{leading&&<View className="screen-leading-gap"/>}<Text className="eyebrow">GMZZ CLUB</Text><Text className="screen-title">{title}</Text>{subtitle&&<Text className="screen-subtitle">{subtitle}</Text>}</View>{action}</View>{children}</View>}
export function Loading(){return <View className="loading"><Text>正在打开俱乐部…</Text></View>}
export function ErrorState({message,onRetry}:{message:string;onRetry?:()=>void}){const loginRequired=message.includes('登录');useEffect(()=>{if(loginRequired)redirectToLogin()},[loginRequired]);return <View className="empty"><Text className="empty-mark">◇</Text><Text>{loginRequired?'正在前往登录页…':message}</Text>{!loginRequired&&onRetry&&<Button onClick={onRetry}>重新连接</Button>}</View>}
export function Stat({label,value,caption}:{label:string;value:string|number;caption:string}){return <View className="stat"><Text className="stat-label">{label}</Text><Text className="stat-value">{value}</Text><Text className="stat-caption">{caption}</Text></View>}
export function Badge({children,tone='default'}:{children:ReactNode;tone?:'default'|'success'|'warning'|'danger'}){return <Text className={`badge badge-${tone}`}>{children}</Text>}
export function EmptyState({message}:{message:string}){return <View className="empty"><Text className="empty-mark">◇</Text><Text>{message}</Text></View>}
export function PathwayTags({items,value,onChange}:{items:{id:number;name:string}[];value:number|null;onChange:(id:number|null)=>void}){return <ScrollRow><Button size="mini" type={value===null?'primary':'default'} onClick={()=>onChange(null)}>全部</Button>{items.map(x=><Button size="mini" key={x.id} type={value===x.id?'primary':'default'} onClick={()=>onChange(value===x.id?null:x.id)}>{x.name.replace(/途径$/,'')}</Button>)}</ScrollRow>}
function ScrollRow({children}:{children:ReactNode}){return <View className="tag-row">{children}</View>}


