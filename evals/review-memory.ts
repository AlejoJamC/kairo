import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readPrivate } from './private-files';
import { enrichmentMemoryCommand, memoryDirectory, migrateMemoryReview, saveHumanReview, type MemoryProposal } from './enrichment-memory';

export function applyReviewChoices(proposals: MemoryProposal[], input: unknown): MemoryProposal[] {
  if (!input || typeof input !== 'object') throw new Error('Invalid review');
  const { reviewer, choices } = input as { reviewer?: unknown; choices?: unknown };
  if (typeof reviewer !== 'string' || !reviewer.trim() || !Array.isArray(choices) || choices.length !== proposals.length) throw new Error('Reviewer and complete selection required');
  const seen = new Set<number>();
  return proposals.map(proposal => {
    const matching = choices.filter(item => item && typeof item === 'object' && item.id === proposal.id);
    if (matching.length !== 1 || seen.has(proposal.id)) throw new Error('Invalid proposal selection');
    seen.add(proposal.id);
    const choice = matching[0] as {decision: unknown};
    if (!['approved','rejected','pending_review'].includes(String(choice.decision))) throw new Error('Invalid decision');
    return {...proposal,decision:choice.decision as MemoryProposal['decision'],reviewer:choice.decision === 'pending_review' ? '' : reviewer.trim()};
  });
}

export const reviewPage = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Validar propuestas contra sus fuentes</title>
<style>body{font:16px system-ui;max-width:1000px;margin:32px auto;padding:0 20px;background:#f5f6f8;color:#17212b}header{background:#f5f6f8;padding:16px 0;border-bottom:1px solid #bbb}article{background:white;margin:20px 0;padding:24px;border-radius:12px;border:1px solid #ddd}p,pre{white-space:pre-wrap;overflow-wrap:anywhere}pre{font:14px system-ui;background:#f1f3f5;padding:16px;max-height:400px;overflow:auto}input,select,button{font:inherit;padding:9px;margin:4px}button{cursor:pointer;background:#163e68;color:white;border:0;border-radius:6px}label{display:block;margin-top:12px}#status{font-weight:600}summary{cursor:pointer}small{display:block;color:#465361}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:24px}.comparison section{min-width:0}@media(max-width:700px){.comparison{grid-template-columns:1fr}}</style>
<header><h1>¿La fuente respalda esta propuesta?</h1><p>Estas propuestas fueron generadas por modelos al leer los correos del eval de incoming. Compara la afirmación de la izquierda con la evidencia de la derecha. No estás aprobando acciones ni decidiendo a qué otros tickets aplica.</p><p><strong>Etiquetas permanentes:</strong> scripts/eval/data/input/knowledge-labels/__DATASET__/review.json. Cada guardado conserva una copia anterior. Borrar resultados de evals no borra esta revisión.</p><label>Nombre o alias del revisor <input id="reviewer" autocomplete="off" placeholder="Tu nombre o alias local"></label><button id="save">Guardar selección</button><p id="status" role="status"></p><small>Sí, respaldada: la fuente sostiene la afirmación y sus condiciones. No, incorrecta: inventa, interpreta mal o generaliza. No puedo decidir: falta información. Una afirmación de un remitente no establece por sí sola una política del negocio.</small></header><main id="items"></main>
<script>
const token='__TOKEN__';let proposals=[];
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
async function init(){const response=await fetch('/data');if(!response.ok)throw Error('No se pudo leer la revisión');const data=await response.json();proposals=data.proposals;document.querySelector('#reviewer').value=proposals.find(p=>p.reviewer)?.reviewer||'';
for(const p of proposals){const a=document.createElement('article');a.dataset.id=p.id;a.append(node('h2','Propuesta '+p.id+' · fuente: correo '+p.sourcePosition));
const grid=node('div','');grid.className='comparison';const claim=node('section','');claim.append(node('h3','Afirmación generada'),node('h4',p.title),node('p',p.content));
const evidence=node('section','');evidence.append(node('h3','Evidencia para comprobarla'),node('pre',p.evidence.join('\\n\\n')||'No hay fragmentos registrados. Comprueba el correo completo antes de aceptar la afirmación.'));
const details=document.createElement('details');details.append(node('summary','Leer correo fuente completo'),node('pre',p.sourceText||''));evidence.append(details);grid.append(claim,evidence);a.append(grid);
const l=node('label','¿La fuente respalda la afirmación, sin añadir hechos ni condiciones? '),s=document.createElement('select');for(const [value,label] of [['pending_review','No puedo decidir todavía'],['approved','Sí, está respaldada'],['rejected','No, es incorrecta o exagerada']]){const o=node('option',label);o.value=value;s.append(o)}s.value=p.decision;l.append(s);a.append(l);document.querySelector('#items').append(a)}document.querySelector('#status').textContent=proposals.length+' propuestas · '+proposals.filter(p=>p.decision==='approved').length+' aprobadas · '+proposals.filter(p=>p.decision==='rejected').length+' rechazadas'}
async function save(prepare){const status=document.querySelector('#status');try{const choices=[...document.querySelectorAll('article')].map(a=>({id:Number(a.dataset.id),decision:a.querySelector('select').value}));status.textContent='Guardando…';const r=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json','X-Review-Token':token},body:JSON.stringify({reviewer:document.querySelector('#reviewer').value,choices,prepare})});const d=await r.json();if(!r.ok)throw Error(d.error);status.textContent=d.message}catch(e){status.textContent=e.message}}
document.querySelector('#save').onclick=()=>save(false);init().catch(()=>document.querySelector('#status').textContent='No se pudo cargar la revisión.');
</script></html>`;

if (import.meta.main) {
  const dataset = process.argv[2] ?? 'main';
  if (!['main','coverage'].includes(dataset)) throw new Error('Invalid dataset');
  const selected=dataset as 'main'|'coverage';
  await migrateMemoryReview(selected);
  const file = resolve(memoryDirectory(selected),'review.json');
  await readPrivate(file);
  const token=randomUUID();
  let saving=false;
  const server=Bun.serve({hostname:'127.0.0.1',port:56949,async fetch(request){
    const url=new URL(request.url);
    if(request.headers.get('host')!==url.host || url.hostname!=='127.0.0.1')return new Response('Forbidden',{status:403});
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; connect-src 'self'"};
    if(request.method==='GET'&&url.pathname==='/')return new Response(reviewPage.replace('__TOKEN__',token).replace('__DATASET__',dataset),{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
    if(request.method==='GET'&&url.pathname==='/data')return new Response(await readPrivate(file),{headers:{...headers,'Content-Type':'application/json'}});
    if(request.method!=='POST'||url.pathname!=='/save'||request.headers.get('x-review-token')!==token||request.headers.get('origin')!==url.origin)return new Response('Forbidden',{status:403});
    if(saving)return Response.json({error:'Hay otra escritura en curso.'},{status:409,headers});
    saving=true;
    try{
      const input=await request.json();const review=JSON.parse(await readPrivate(file));
      review.proposals=applyReviewChoices(review.proposals,input);
      const {loadCorpus}=await import('./corpus');const positions=new Set((await loadCorpus(dataset as 'main'|'coverage')).map(row=>row.id));
      if(review.proposals.some((p:MemoryProposal)=>p.targetPositions.some(id=>!positions.has(id))))throw Error('Invalid positions');
      await saveHumanReview(selected,review);
      if(input.prepare){await enrichmentMemoryCommand(['apply-review',dataset]);return Response.json({message:'Memoria preparada. Ya puedes ejecutar enrichment con '+dataset+'. No se ha ejecutado ningún eval.'},{headers})}
      return Response.json({message:'Selección guardada. No se ha ejecutado ningún eval.'},{headers});
    }catch{return Response.json({error:'No se pudo preparar. Completa tu nombre o alias y las decisiones de revisión. La selección guardada permanece disponible.'},{status:400,headers})}
    finally{saving=false}
  }});
  console.log('Private review: '+server.url.origin);
}
