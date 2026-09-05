import {json} from '../_utils.js';
export async function onRequestGet({env}){try{const r=await env.DB.prepare('SELECT 1 n').first();return json({ok:r?.n===1,service:'YING PLAY',arch:'Cloudflare Pages + Functions + D1',version:'B2.0'})}catch(e){return json({ok:false,error:'D1 未绑定或数据库未初始化'},503)}}
