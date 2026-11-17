import {useState} from 'react'
import {View,Text,Button,Image} from '@tarojs/components'
import Taro from '@tarojs/taro'
import {loginWithWechat} from '../../lib/api'
import wechatIcon from '../../assets/wechat.png'
import loginBg from '../../assets/login-bg.jpg'
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
 return <View className="login"><View className="login-art"><Image className="login-background" src={loginBg} mode="aspectFill"/><View className="login-shade"/><View className="login-heading"><Text className="art-title">诡秘俱乐部管理器</Text><Text className="art-copy">支持活动报名及通知、团队分配、职业评分录入等，正在努力完善中，欢迎试用。</Text></View></View><View className="login-form"><Text className="login-title">登录</Text><Button className="wechat-login" disabled={busy} loading={busy} onClick={submit}><Image className="wechat-login-icon" src={wechatIcon} mode="aspectFit" ariaLabel="微信"/><Text>微信授权登录</Text></Button></View></View>
}
