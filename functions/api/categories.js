import {json} from '../_utils.js';
export async function onRequestGet({env}){const r=await env.DB.prepare('SELECT * FROM categories WHERE enabled=1 ORDER BY sort DESC,id DESC').all();return json({list:r.results})}
