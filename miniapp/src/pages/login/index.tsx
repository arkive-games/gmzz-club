import {useState} from 'react'
import {View,Text,Input} from '@tarojs/components'
import {Button,Toast} from '@nutui/nutui-react-taro'
import Taro from '@tarojs/taro'
import {login,register} from '../../lib/api'
import './index.scss'
export default function Login(){
 const [mode,setMode]=useState<'login'|'register'>('login');const [username,setUsername]=useState('');const [password,setPassword]=useState('');const [display,setDisplay]=useState('');const [busy,setBusy]=useState(false)
 async function submit(){if(!username||!password||(mode==='register'&&!display)){Toast.show('global-toast',{content:'请完整填写信息'});return};setBusy(true);try{if(mode==='login')await login(username,password);else await register(username,password,display);Toast.show('global-toast',{content:mode==='login'?'登录成功':'账号创建成功',icon:'success'});setTimeout(()=>Taro.switchTab({url:'/pages/index/index'}),300)}catch(e){Toast.show('global-toast',{content:(e as Error).message})}finally{setBusy(false)}}
 return <View className="login"><View className="login-art"><Text className="brand">⚓ ARKIVE <Text>CLUB</Text></Text><Text className="art-eyebrow">LORD OF THE MYSTERIES</Text><Text className="art-title">让每一次集结，{`\n`}都有备而来。</Text><Text className="art-copy">从角色档案到团队配置，{`\n`}与你的俱乐部一起，迎接未知。</Text></View><View className="login-form"><Text className="eyebrow">WELCOME ABOARD</Text><Text className="login-title">{mode==='login'?'欢迎回到俱乐部':'创建你的账号'}</Text><Text className="login-sub">{mode==='login'?'登录后，查看活动、管理角色与参与集结。':'一份账号，管理你的多个角色与俱乐部。'}</Text>{mode==='register'&&<Input className="field" placeholder="昵称" value={display} onInput={e=>setDisplay(e.detail.value)}/>}<Input className="field" placeholder="用户名" value={username} onInput={e=>setUsername(e.detail.value)}/><Input className="field" password placeholder={mode==='register'?'密码至少 10 位':'密码'} value={password} onInput={e=>setPassword(e.detail.value)}/><Button block type="primary" loading={busy} onClick={submit}>{mode==='login'?'登录':'创建账号'}</Button><Button className="switch" fill="none" onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?'还没有账号？注册账号':'已经有账号？前往登录'}</Button></View></View>
}



