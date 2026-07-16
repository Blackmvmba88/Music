import {createReadStream,existsSync,statSync} from 'node:fs';
import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {extname,join,resolve} from 'node:path';
import {defineConfig,type Plugin} from 'vite';
import react from '@vitejs/plugin-react';

function copyRuntimeAssets():Plugin{
  return{name:'copy-runtime-assets',apply:'build',async writeBundle(options){
    const out=resolve(String(options.dir??'dist'));
    await mkdir(resolve(out,'player'),{recursive:true});
    await Promise.all([
      cp('public/ganja-love-cover.png',resolve(out,'ganja-love-cover.png')),
      cp('public/player/library.json',resolve(out,'player/library.json')),
      cp('public/player/source-audit.json',resolve(out,'player/source-audit.json')).catch(() => {}),
    ]);
  }};
}

const devLibraryRoot=process.env.BLACKMAMBA_LIBRARY_ROOT||'/Volumes/ADATA SC740/01_MEDIA_AUDIO/BLACKMAMBA_PLAYER';
type LyricJob={progress:number;message:string;status:'running'|'done'|'error';lyrics?:string;error?:string};
const lyricJobs=new Map<string,LyricJob>();
function startLyricJob(trackId:string){
  const existing=lyricJobs.get(trackId);if(existing?.status==='running')return existing;
  const job:LyricJob={progress:1,message:'Iniciando extracción',status:'running'};lyricJobs.set(trackId,job);
  const candidates=[resolve('.venv-transcribe312/bin/python'),resolve('.venv-transcribe/bin/python'),'python3'];
  const python=candidates.find((candidate)=>candidate==='python3'||existsSync(candidate))||'python3';
  const child=spawn(python,[resolve('scripts/transcribe-one-track.py'),devLibraryRoot,trackId],{cwd:'/tmp'});
  let buffer='';let errors='';
  child.stdout.on('data',(chunk)=>{buffer+=String(chunk);const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){try{const event=JSON.parse(line);if(typeof event.progress==='number'){job.progress=event.progress;job.message=event.message||job.message;}if(event.lyrics)job.lyrics=event.lyrics;}catch{continue;}}});
  child.stderr.on('data',(chunk)=>{errors+=String(chunk)});
  child.on('error',(error)=>{job.status='error';job.error=error.message;job.message='No se pudo iniciar la extracción';});
  child.on('close',(code)=>{if(job.status==='error')return;if(code===0&&job.lyrics){job.status='done';job.progress=100;job.message='Letra guardada';}else{job.status='error';job.error=errors.trim()||'No se pudo extraer la letra';job.message='Extracción fallida';}});
  return job;
}
function devUsbMedia():Plugin{
  let localById=new Map<string,string>();
  return{name:'blackmamba-dev-usb-media',apply:'serve',configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      const pathname=new URL(req.url||'/', 'http://127.0.0.1').pathname;
      if(pathname==='/api/cover-inbox'){
        try{const manifest=JSON.parse(await readFile(join(devLibraryRoot,'00_COVER_INBOX/images.json'),'utf8'));res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({...manifest,images:(manifest.images||[]).map((item:{file:string})=>({...item,url:`/api/dev-inbox/${item.file}`}))}));}catch{res.statusCode=404;res.end(JSON.stringify({error:'cover_inbox_not_found'}));}return;
      }
      if(pathname==='/api/assign-cover'&&req.method==='POST'){
        let raw='';for await(const chunk of req)raw+=chunk;
        try{const body=JSON.parse(raw);const trackId=String(body.trackId||'');const imageFile=String(body.imageFile||'').replace(/[^a-zA-Z0-9_.-]/g,'');const audio=localById.get(trackId);if(!audio||!imageFile)throw new Error('assignment_target_not_found');await cp(join(devLibraryRoot,'00_COVER_INBOX',imageFile),join(resolve(audio,'..'),'cover.jpg'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,trackId,cover:`/api/dev-cover/${trackId}?v=${Date.now()}`}));}catch(error){res.statusCode=400;res.end(JSON.stringify({error:error instanceof Error?error.message:'invalid_assignment'}));}return;
      }
      if(pathname==='/api/delete-cover-assets'&&req.method==='POST'){
        let raw='';for await(const chunk of req)raw+=chunk;
        try{const body=JSON.parse(raw);const requested=new Set((Array.isArray(body.files)?body.files:[]).map((file:unknown)=>String(file).replace(/[^a-zA-Z0-9_.-]/g,'')));const manifestPath=join(devLibraryRoot,'00_COVER_INBOX/images.json');const manifest=JSON.parse(await readFile(manifestPath,'utf8'));const removable=(manifest.images||[]).filter((item:{file:string;matchedTrackId?:string|null})=>requested.has(item.file)&&!item.matchedTrackId);for(const item of removable)await rm(join(devLibraryRoot,'00_COVER_INBOX',item.file),{force:true});manifest.images=(manifest.images||[]).filter((item:{file:string})=>!removable.some((removed:{file:string})=>removed.file===item.file));manifest.unique=manifest.images.length;manifest.updatedAt=new Date().toISOString();await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({deleted:removable.length,protected:requested.size-removable.length}));}catch(error){res.statusCode=400;res.end(JSON.stringify({error:error instanceof Error?error.message:'invalid_delete_request'}));}return;
      }
      const lyricRoute=pathname.match(/^\/api\/lyrics\/([a-zA-Z0-9_-]+)$/);
      if(lyricRoute&&req.method==='POST'){const job=startLyricJob(lyricRoute[1]);res.statusCode=job.status==='running'?202:200;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(job));return;}
      if(lyricRoute&&req.method==='GET'){const job=lyricJobs.get(lyricRoute[1]);res.setHeader('Content-Type','application/json');if(!job){res.statusCode=404;res.end(JSON.stringify({error:'lyric_job_not_found'}));}else res.end(JSON.stringify(job));return;}
      if(pathname==='/player/library.json'&&existsSync(join(devLibraryRoot,'library.json'))){
        const library=JSON.parse(await readFile(join(devLibraryRoot,'library.json'),'utf8'));
        localById=new Map();
        const tracks=await Promise.all((library.tracks||[]).map(async(item:{id:string;folder:string;audio?:string;cover?:string;lyrics?:string;title:string;artist?:string;durationSeconds?:number;confidence?:number;evidence?:string[];warnings?:string[];fallbackReason?:string|null;ownership?:unknown})=>{
          const audio=join(devLibraryRoot,item.folder,item.audio||'audio.mp3');
          localById.set(item.id,audio);
          const cover=join(devLibraryRoot,item.folder,item.cover||'cover.jpg');
          let lyrics='';try{lyrics=await readFile(join(devLibraryRoot,item.folder,item.lyrics||'lyrics.txt'),'utf8');}catch{lyrics='';}
          if(/^(LETRA|TRANSCRIPCI[ÓO]N) PENDIENTE/i.test(lyrics.trim()))lyrics='';
          return{id:item.id,title:item.title,artist:item.artist||'Iyari Gomez',file:`/api/dev-media/${item.id}`,downloadUrl:`/api/dev-media/${item.id}?download=1`,streamUrl:null,duration:`${Math.floor((item.durationSeconds||0)/60)}:${String(Math.floor((item.durationSeconds||0)%60)).padStart(2,'0')}`,tag:'USB local',cover:existsSync(cover)?`/api/dev-cover/${item.id}`:null,lyrics,hasLyrics:Boolean(lyrics.trim()),localStatus:'available',localFormat:extname(audio).slice(1).toLowerCase(),source:'usb',availabilityStatus:'local',confidence:item.confidence??.8,evidence:item.evidence||[audio],warnings:item.warnings||[],fallbackReason:item.fallbackReason??null,ownership:item.ownership||null};
        }));
        res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({tracks,confidence:.98,evidence:[`USB detectada: ${devLibraryRoot}`],warnings:[],fallbackReason:null}));return;
      }
      const inbox=pathname.match(/^\/api\/dev-inbox\/([a-zA-Z0-9_.-]+)$/);
      if(inbox){const file=join(devLibraryRoot,'00_COVER_INBOX',inbox[1]);if(!existsSync(file)){res.statusCode=404;res.end('image_not_found');return;}const extension=extname(file).toLowerCase();res.setHeader('Content-Type',extension==='.png'?'image/png':extension==='.webp'?'image/webp':extension==='.avif'?'image/avif':'image/jpeg');createReadStream(file).pipe(res);return;}
      const match=pathname.match(/^\/api\/dev-(media|cover)\/([a-zA-Z0-9_-]+)$/);
      if(!match)return next();
      const audio=localById.get(match[2]);
      const file=match[1]==='cover'&&audio?join(resolve(audio,'..'),'cover.jpg'):audio;
      if(!file||!existsSync(file)){res.statusCode=404;res.end('media_not_found');return;}
      const stat=statSync(file);const range=req.headers.range;const mime=extname(file).toLowerCase()==='.wav'?'audio/wav':match[1]==='cover'?'image/jpeg':'audio/mpeg';
      if(range){const [a,b]=range.replace('bytes=','').split('-');const start=Number(a);const end=b?Number(b):stat.size-1;res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${stat.size}`);res.setHeader('Content-Length',end-start+1);res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Type',mime);createReadStream(file,{start,end}).pipe(res);return;}
      res.setHeader('Content-Length',stat.size);res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Type',mime);createReadStream(file).pipe(res);
    });
  }};
}

export default defineConfig({
  base:'./',
  plugins:[react(),devUsbMedia(),copyRuntimeAssets()],
  server:{host:'127.0.0.1'},
  preview:{host:'127.0.0.1'},
  build:{sourcemap:true,copyPublicDir:false},
  test:{include:['src/tests/**/*.test.ts'],environment:'jsdom',setupFiles:['./src/tests/setup.ts'],coverage:{provider:'v8',reporter:['text','html'],include:['src/api/**/*.ts','src/storage/local-profile.ts'],thresholds:{lines:70,functions:70,branches:60,statements:70}}},
});
