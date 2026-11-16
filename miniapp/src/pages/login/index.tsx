import {useState} from 'react'
import {View,Text,Button,Image} from '@tarojs/components'
import Taro from '@tarojs/taro'
import {loginWithWechat} from '../../lib/api'
import wechatIcon from '../../assets/wechat.png'
import clubIcon from '../../assets/lord-of-mysteries.jpg'
import './index.scss'

export default function Login(){
 const [busy,setBusy]=useState(false)
 async function submit(){
  if(busy)return
  setBusy(true)
  try{
   let displayName=''
   try{const profile=await Taro.getUserProfile({desc:'用于创建俱乐部账号并展示昵称'});displayName=profile.userInfo?.nickName||''}catch{}
   const loginResult=await Taro.login()
   if(!loginResult.code)throw new Error('未获取到微信授权码，请重试')
   await loginWithWechat(loginResult.code,displayName)
   Taro.showToast({title:'微信登录成功',icon:'success'})
   setTimeout(()=>Taro.switchTab({url:'/pages/index/index'}),300)
  }catch(e){Taro.showToast({title:(e as Error).message||'微信授权失败',icon:'none'})}finally{setBusy(false)}
 }
 return <View className="login"><View className="login-art"><View className="brand"><Image className="brand-icon" src={clubIcon} mode="aspectFit" ariaLabel="诡秘之主图标"/><Text className="brand-name">诡秘之主</Text><Text className="brand-club">CLUB</Text></View><Text className="art-eyebrow">Lord of Mysteries</Text><Text className="art-title">让每一次集结，{`\n`}都有备而来。</Text><Text className="art-copy">从角色档案到团队配置，{`\n`}与你的俱乐部一起，迎接未知。</Text></View><View className="login-form"><Text className="eyebrow">WELCOME ABOARD</Text><Text className="login-title">欢迎回到俱乐部</Text><Text className="login-sub">使用微信身份安全登录，查看活动、管理角色与参与集结。</Text><Button className="wechat-login" loading={busy} onClick={submit}><Image className="wechat-login-icon" src={wechatIcon} mode="aspectFit" ariaLabel="微信"/><Text>微信授权登录</Text></Button></View></View>
}
