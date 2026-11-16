export type Named={id:number;name:string;sequenceName?:string;professionId?:number;tag?:string;skill?:string;description?:string;groupName?:string}
export type Catalog={professions:Named[];talents:Named[];relics:Named[];puppets:Named[];fellows:Named[]}
export type Level={id:number;level:number}
export type Loadout={talentId:number;healing:string;relics:Level[];puppet:Level|null;fellow:Level|null}
export type Profile={relics:Level[];puppets:Level[];fellows:Level[];default:Loadout}
export type Character={id:string;user_id:string;club_id:string|null;name:string;profession_id:number;score:number;profile:Profile;display_name?:string}
export type Club={id:string;name:string;description:string;role:'owner'|'admin'|'member'|null;member_count:number;application_status:string|null}
export type State={me:{id:string;username:string;display_name:string;wechat_openid?:string|null;is_admin:boolean};characters:Character[];clubs:Club[];now:string}
export type Event={id:string;club_id:string;title:string;description:string;starts_at:string;deadline:string;team_count:number;revision:number}
export type Signup={event_id:string;character_id:string;created_at:string}
export type Slot={event_id?:string;team:number;position:number;character_id:string;config:Loadout&{name?:string;professionId?:number;score?:number}}
export type Detail={role:'owner'|'admin'|'member';members:{id:string;username:string;display_name:string;role:string}[];characters:Character[];events:Event[];signups:Signup[];slots:Slot[];applications?:{user_id:string;username:string;display_name:string;created_at:string}[]}
export const nameOf=(xs:Named[],id:number|undefined|null)=>xs.find(x=>x.id===id)?.name??'未设置'
export const date=(v:string)=>new Date(v).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
