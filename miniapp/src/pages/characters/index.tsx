import {useEffect,useState} from 'react'
import {View,Text,Input,Picker,ScrollView,Button} from '@tarojs/components'
import Taro from '@tarojs/taro'
import {Screen,Loading,ErrorState,PathwayTags,EmptyState,Badge} from '../../components/Screen'
import {useAccountData} from '../../lib/store'
import {request} from '../../lib/api'
import {nameOf,type Catalog,type Character,type Profile} from '../../lib/types'
import './index.scss'

const blank=(talentId:number):Profile=>({relics:[],puppets:[],fellows:[],default:{talentId,healing:'',relics:[],puppet:null,fellow:null}})

export default function Characters(){
 const {data,error,loading,reload}=useAccountData();const [pathway,setPathway]=useState<number|null>(null);const [editing,setEditing]=useState<Character|undefined>(undefined)
 if(loading)return <Loading/>;if(error||!data)return <ErrorState message={error||'请先登录'} onRetry={reload}/>
 const clubData=data; const professions=clubData.catalog.professions.filter(p=>clubData.catalog.talents.some(t=>t.professionId===p.id));const list=clubData.state.characters.filter(c=>pathway===null||c.profession_id===pathway)
 function edit(c?:Character){const profession=c?.profession_id??professions[0]?.id??0;const talent=c?.profile.default.talentId??clubData.catalog.talents.find(t=>t.professionId===profession)?.id??0;setEditing(c||{id:'',user_id:clubData.state.me.id,club_id:null,name:'',profession_id:profession,score:0,profile:blank(talent)})}
 async function bind(c:Character){if(!clubData.clubId){Taro.switchTab({url:'/pages/clubs/index'});return}try{await request(`/clubs/${clubData.clubId}/characters/${c.id}`,'PUT',{bound:true});Taro.showToast({title:'已绑定当前俱乐部',icon:'success'});await reload()}catch(e){Taro.showToast({title:(e as Error).message||'绑定失败',icon:'none'})}}
 return <Screen title="我的角色" subtitle="建立和编辑你的角色档案。" action={<Button size="mini" type="primary" onClick={()=>edit()}>＋ 新建角色</Button>}><PathwayTags items={professions} value={pathway} onChange={setPathway}/>{list.length?list.map(c=><View className="card character" key={c.id} onClick={()=>edit(c)}><View className={'avatar pathway p'+c.profession_id%7}>{nameOf(clubData.catalog.professions,c.profession_id).slice(0,1)}</View><View className="flex1"><Text className="character-name">{c.name}</Text><Text className="character-meta">{nameOf(clubData.catalog.professions,c.profession_id)} · {c.score.toLocaleString()} 分</Text><View className="pill-row"><Badge>{clubData.state.clubs.find(x=>x.id===c.club_id)?.name||'未绑定俱乐部'}</Badge>{!c.club_id?<Button size="mini" type="primary" onClick={e=>{e.stopPropagation();void bind(c)}}>绑定当前俱乐部</Button>:<Text className="muted">点击编辑 ›</Text>}</View></View></View>):<EmptyState message="还没有符合条件的角色，先建立一个吧。"/>}{editing&&<CharacterEditor character={editing} catalog={clubData.catalog} onClose={()=>setEditing(undefined)} onSaved={reload}/>}</Screen>
}

function CharacterEditor({character,catalog,onClose,onSaved}:{character:Character;catalog:Catalog;onClose:()=>void;onSaved:()=>Promise<void>}){
 const [name,setName]=useState('');const [score,setScore]=useState('0');const [profession,setProfession]=useState(0);const [profile,setProfile]=useState<Profile>(blank(0));const [saving,setSaving]=useState(false)
 useEffect(()=>{const p=character.profession_id||catalog.professions[0]?.id||0;const t=character.profile?.default?.talentId||catalog.talents.find(x=>x.professionId===p)?.id||0;setName(character.name);setScore(String(character.score||0));setProfession(p);setProfile(character.profile||blank(t))},[character,catalog])
 if(!character)return null
 const professions=catalog.professions.filter(p=>catalog.talents.some(t=>t.professionId===p.id));const talents=catalog.talents.filter(t=>t.professionId===profession);const talentName=nameOf(catalog.talents,profile.default.talentId)
 async function save(){if(!name.trim()){Taro.showToast({title:'请输入角色名',icon:'none'});return}setSaving(true);try{await request('/characters'+(character.id?'/'+character.id:''),character.id?'PUT':'POST',{name:name.trim(),professionId:profession,score:Math.max(0,Number(score)||0),profile});Taro.showToast({title:'角色已保存',icon:'success'});await onSaved();onClose()}catch(e){Taro.showToast({title:(e as Error).message||'保存失败',icon:'none'})}finally{setSaving(false)}}
 function changeProfession(e:any){const p=professions[Number(e.detail.value)]?.id||profession;const t=catalog.talents.find(x=>x.professionId===p);setProfession(p);setProfile({...profile,default:{...profile.default,talentId:t?.id||0}})}
 function changeTalent(e:any){setProfile({...profile,default:{...profile.default,talentId:talents[Number(e.detail.value)]?.id||0}})}
 return <View className="editor-mask"><View className="editor-panel"><View className="editor-head"><Text className="editor-title">{character.id?'编辑角色':'创建角色'}</Text><Text className="editor-close" onClick={onClose}>×</Text></View><ScrollView scrollY className="editor-scroll"><Text className="field-label">角色名称</Text><Input className="field" value={name} placeholder="例如：愚者先生" onInput={e=>setName(e.detail.value)}/><Text className="field-label">职业 / 途径</Text><Picker mode="selector" range={professions.map(x=>x.name)} value={Math.max(0,professions.findIndex(x=>x.id===profession))} onChange={changeProfession}><View className="picker-field">{nameOf(professions,profession)} ›</View></Picker><Text className="field-label">非凡评分</Text><Input className="field" type="number" value={score} onInput={e=>setScore(e.detail.value)}/><Text className="field-label">默认天赋</Text><Picker mode="selector" range={talents.map(x=>x.name)} value={Math.max(0,talents.findIndex(x=>x.id===profile.default.talentId))} onChange={changeTalent}><View className="picker-field">{talentName} ›</View></Picker><View className="editor-note">保存后可在角色列表绑定当前俱乐部，并用于活动报名。</View><Button className="editor-save" type="primary" loading={saving} onClick={save}>保存角色</Button></ScrollView></View></View>
}
