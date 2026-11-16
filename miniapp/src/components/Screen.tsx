import {View,Text} from '@tarojs/components'
import {Button,Tag} from '@nutui/nutui-react-taro'
import type {ReactNode} from 'react'
import './screen.scss'
export function Screen({title,subtitle,children,action}:{title:string;subtitle?:string;children:ReactNode;action?:ReactNode}){return <View className="screen"><View className="screen-head"><View><Text className="eyebrow">GMZZ CLUB</Text><Text className="screen-title">{title}</Text>{subtitle&&<Text className="screen-subtitle">{subtitle}</Text>}</View>{action}</View>{children}</View>}
export function Loading(){return <View className="loading"><Text>正在打开俱乐部…</Text></View>}
export function ErrorState({message,onRetry}:{message:string;onRetry?:()=>void}){return <View className="empty"><Text className="empty-mark">◇</Text><Text>{message}</Text>{onRetry&&<Button size="small" type="primary" onClick={onRetry}>重新连接</Button>}</View>}
export function Stat({label,value,caption}:{label:string;value:string|number;caption:string}){return <View className="stat"><Text className="stat-label">{label}</Text><Text className="stat-value">{value}</Text><Text className="stat-caption">{caption}</Text></View>}
export function PathwayTags({items,value,onChange}:{items:{id:number;name:string}[];value:number|null;onChange:(id:number|null)=>void}){return <ScrollRow>{<Tag type={value===null?'primary':'default'} onClick={()=>onChange(null)}>全部</Tag>}{items.map(x=><Tag key={x.id} type={value===x.id?'primary':'default'} onClick={()=>onChange(value===x.id?null:x.id)}>{x.name.replace(/途径$/,'')}</Tag>)}</ScrollRow>}
function ScrollRow({children}:{children:ReactNode}){return <View className="tag-row">{children}</View>}


