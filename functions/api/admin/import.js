import {json,verify,now} from '../../_utils.js';

const auth=(r,e)=>verify(r,e);
const clean=(s)=>String(s??'').trim();
const arr=(v)=>Array.isArray(v)?v:(v==null?[]:[v]);

function splitMulti(v){
  const s=clean(v);
  if(!s) return [];
  return s.split('$$$').map(x=>x.trim());
}
function splitEpisodes(v){
  const s=clean(v);
  if(!s) return [];
  return s.split('#').map((item,i)=>{
    const x=item.split('$');
    if(x.length<2) return null;
    return {name:clean(x[0])||`第${i+1}集`,url:clean(x.slice(1).join('$')),episode_no:i+1};
  }).filter(x=>x&&x.url);
}
async function fetchJson(url){
  const r=await fetch(url,{headers:{accept:'application/json,text/plain,*/*'},redirect:'follow'});
  if(!r.ok) throw new Error(`资源站返回 HTTP ${r.status}`);
  const text=await r.text();
  let d; try{d=JSON.parse(text)}catch{throw new Error('资源站返回的不是 JSON');}
  return d;
}
function apiUrl(base, params={}){
  const u=new URL(base);
  for(const [k,v] of Object.entries(params)) if(v!==undefined&&v!==null&&v!=='') u.searchParams.set(k,String(v));
  return u.toString();
}

async function upsertCategory(env, name, slug){
  name=clean(name); if(!name) return null;
  slug=clean(slug)||name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||`cat-${Date.now()}`;
  let row=await env.DB.prepare('SELECT id FROM categories WHERE name=? OR slug=? LIMIT 1').bind(name,slug).first();
  if(row) return row.id;
  const r=await env.DB.prepare('INSERT INTO categories(name,slug,sort,enabled,created_at) VALUES(?,?,?,?,?)').bind(name,slug,0,1,now()).run();
  return r.meta.last_row_id;
}

function pickDetail(v){
  return {
    title:clean(v.vod_name||v.title),subtitle:clean(v.vod_sub||v.vod_en),year:Number(String(v.vod_year||'').replace(/\D/g,''))||0,
    area:clean(v.vod_area),language:clean(v.vod_lang),director:clean(v.vod_director),actors:clean(v.vod_actor),tags:clean(v.vod_tag),
    poster:clean(v.vod_pic||v.poster),backdrop:clean(v.vod_pic_slide||v.vod_pic_screenshot||v.vod_pic||v.backdrop),description:clean(v.vod_blurb||v.vod_content||v.description),
    remarks:clean(v.vod_remarks),duration:clean(v.vod_duration),score:Number(v.vod_score)||0,content:clean(v.vod_content)
  };
}

async function importPage(env, source, page, limit){
  const listData=await fetchJson(apiUrl(source.base_url,{ac:'list',pg:page,limit}));
  const list=arr(listData.list);
  const classes=arr(listData.class);
  for(const c of classes) await upsertCategory(env,c.type_name,`api-${c.type_id}`);
  let imported=0, failed=0;
  for(const item of list){
    try{
      const id=String(item.vod_id||item.id||''); if(!id) continue;
      let detailData;
      try{detailData=await fetchJson(apiUrl(source.base_url,{ac:'detail',ids:id}));}catch{detailData=null;}
      const v=detailData?.list?.[0]||item;
      const info=pickDetail(v); if(!info.title) continue;
      let categoryId=await upsertCategory(env, v.type_name||item.type_name,`api-${v.type_id||item.type_id||'other'}`);
      const existing=await env.DB.prepare('SELECT id FROM videos WHERE title=? LIMIT 1').bind(info.title).first();
      let vid;
      if(existing){
        vid=existing.id;
        await env.DB.prepare(`UPDATE videos SET subtitle=?,year=?,area=?,language=?,director=?,actors=?,tags=?,poster=?,backdrop=?,description=?,remarks=?,score=?,duration=?,content=?,category_id=?,updated_at=? WHERE id=?`).bind(info.subtitle,info.year,info.area,info.language,info.director,info.actors,info.tags,info.poster,info.backdrop,info.description,info.remarks,info.score,info.duration,info.content,categoryId,now(),vid).run();
      }else{
        const r=await env.DB.prepare(`INSERT INTO videos(title,subtitle,year,area,language,director,actors,tags,poster,backdrop,description,remarks,category_id,status,score,duration,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(info.title,info.subtitle,info.year,info.area,info.language,info.director,info.actors,info.tags,info.poster,info.backdrop,info.description,info.remarks,categoryId,1,info.score,info.duration,info.content,now(),now()).run();
        vid=r.meta.last_row_id;
      }
      const playFrom=splitMulti(v.vod_play_from);
      const playUrls=splitMulti(v.vod_play_url);
      for(let i=0;i<Math.max(playFrom.length,playUrls.length);i++){
        const code=clean(playFrom[i])||source.code;
        let src=await env.DB.prepare('SELECT id FROM sources WHERE code=? LIMIT 1').bind(code).first();
        if(!src) src=await env.DB.prepare('SELECT id FROM sources WHERE id=? LIMIT 1').bind(source.id).first();
        const sid=src?.id||source.id;
        const episodes=splitEpisodes(playUrls[i]||v.vod_play_url||'');
        for(const ep of episodes){
          const old=await env.DB.prepare('SELECT id FROM episodes WHERE video_id=? AND source_id=? AND episode_no=? LIMIT 1').bind(vid,sid,ep.episode_no).first();
          if(old) await env.DB.prepare('UPDATE episodes SET name=?,url=?,enabled=1 WHERE id=?').bind(ep.name,ep.url,old.id).run();
          else await env.DB.prepare('INSERT INTO episodes(video_id,source_id,episode_no,name,url,enabled,created_at) VALUES(?,?,?,?,?,?,?)').bind(vid,sid,ep.episode_no,ep.name,ep.url,1,now()).run();
        }
      }
      imported++;
    }catch(e){failed++;}
  }
  return {page,received:list.length,imported,failed,total:listData.total||0,pagecount:listData.pagecount||0};
}

export async function onRequestPost({request,env}){
  if(!await auth(request,env)) return json({error:'未登录'},401);
  const b=await request.json().catch(()=>({}));
  const sourceId=Number(b.source_id); if(!sourceId) return json({error:'缺少 source_id'},400);
  const source=await env.DB.prepare('SELECT * FROM sources WHERE id=? AND enabled=1').bind(sourceId).first();
  if(!source||!source.base_url) return json({error:'资源站不存在、未启用或没有 Base URL'},400);
  const action=b.action||'test';
  try{
    if(action==='test'){
      const d=await fetchJson(apiUrl(source.base_url,{pg:1,limit:1}));
      return json({ok:true,total:d.total||0,pagecount:d.pagecount||0,sample:arr(d.list).slice(0,1),classes:arr(d.class).length});
    }
    const start=Math.max(1,Number(b.page)||1);
    const pages=Math.min(20,Math.max(1,Number(b.pages)||1));
    const limit=Math.min(50,Math.max(1,Number(b.limit)||20));
    const results=[];
    for(let p=start;p<start+pages;p++) results.push(await importPage(env,source,p,limit));
    return json({ok:true,source:source.name,results,summary:{received:results.reduce((a,x)=>a+x.received,0),imported:results.reduce((a,x)=>a+x.imported,0),failed:results.reduce((a,x)=>a+x.failed,0)}});
  }catch(e){return json({error:e.message||'资源站请求失败'},502)}
}
