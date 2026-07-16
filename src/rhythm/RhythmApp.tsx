import {useEffect,useState} from 'react';
import {applyFreshTheme} from './ui/theme-atmosphere';
import './rhythm.css';
import './ui/theme-atmosphere.css';
import './ui/modern-ui.css';
import './ui/no-yellow.css';
import './ui/light-effects.css';
import {levels,generateSession} from './engine/generator';
import type {Level,RhythmExercise} from './domain/exercise';
import type {ExerciseResult,UserTap} from './domain/result';
import {loadResults,saveResult} from '../storage/local-results';
import {ExerciseIntro} from './ui/ExerciseIntro';
import {ExercisePlayer} from './ui/ExercisePlayer';
import {ExerciseFeedback} from './ui/ExerciseFeedback';
import {SessionSummary} from './ui/SessionSummary';
import {Profile} from './ui/Profile';

type Screen='home'|'levels'|'intro'|'play'|'feedback'|'summary'|'profile';

export function RhythmApp(){
  useEffect(()=>{applyFreshTheme()},[]);
  const[screen,setScreen]=useState<Screen>('home');
  const[level,setLevel]=useState<Level>();
  const[session,setSession]=useState<RhythmExercise[]>([]);
  const[index,setIndex]=useState(0);
  const[results,setResults]=useState<ExerciseResult[]>([]);
  const[latest,setLatest]=useState<{result:ExerciseResult;taps:UserTap[]}>();
  const[sessionId,setSessionId]=useState('');
  const[selectedBpm,setSelectedBpm]=useState(80);

  const choose=(selected:Level)=>{if(selected.enabled){setLevel(selected);setSelectedBpm(selected.tempoRange?.default??80);setScreen('intro')}};
  const start=()=>{setSessionId(crypto.randomUUID());setSession(generateSession(level!.id).map(exercise=>({...exercise,bpm:level!.tempoRange||level!.id.startsWith('songs')?selectedBpm:80})));setResults([]);setIndex(0);setLatest(undefined);setScreen('play')};
  const complete=(result:ExerciseResult,taps:UserTap[])=>{setLatest({result,taps});saveResult({...result,exerciseId:session[index].id,levelId:level!.id,completedAt:new Date().toISOString()});setScreen('feedback')};
  const next=()=>{const all=[...results,latest!.result];setResults(all);if(index===9)setScreen('summary');else{setIndex(i=>i+1);setScreen('play')}};

  if(screen==='intro'&&level)return <ExerciseIntro level={level} bpm={selectedBpm} onBpmChange={setSelectedBpm} onStart={start} onBack={()=>setScreen('levels')}/>;
  if(screen==='play'&&session[index])return <ExercisePlayer key={`${index}-${screen}`} exercise={session[index]} index={index} onComplete={complete}/>;
  if(screen==='feedback'&&latest)return <ExerciseFeedback exercise={session[index]} result={latest.result} taps={latest.taps} index={index} onRepeat={()=>setScreen('play')} onNext={next} onExit={()=>setScreen('home')}/>;
  if(screen==='summary')return <SessionSummary results={results} sessionId={sessionId} levelId={level!.id} levelTitle={level!.title} onHome={()=>setScreen('home')} onAgain={start}/>;
  if(screen==='profile')return <Profile onBack={()=>setScreen('home')}/>;
  if(screen==='levels')return <main className="rhythm-page"><button className="rhythm-back" onClick={()=>setScreen('home')}>← Inicio</button><p className="rhythm-eyebrow">LECTURA RÍTMICA</p><h1>Elige un nivel</h1><p className="rhythm-muted">10 tareas · niveles de 1 y 2 compases</p><div className="rhythm-levels">{levels.map((item,i)=><button key={item.id} disabled={!item.enabled} onClick={()=>choose(item)}><span>{String(i+1).padStart(2,'0')}</span><div><b>{item.title}</b><small>{item.enabled?item.description:'Próximamente'}</small></div><strong>{item.enabled?'→':'·'}</strong></button>)}</div></main>;

  const history=loadResults();
  return <main className="rhythm-page rhythm-home"><nav><b>BLACKMAMBA <span>ESCUELA DE MÚSICA</span></b><div className="home-nav-actions"><button onClick={()=>setScreen('profile')}>Mi perfil</button><a href="/music">← Volver al reproductor</a></div></nav><section><p className="rhythm-eyebrow">ENTRENAMIENTO LOCAL</p><h1>Lee el ritmo.<br/><em>Siente el pulso.</em></h1><p className="rhythm-muted">Del catálogo al instrumento, dentro del mismo reproductor.</p><button className="rhythm-continue" onClick={()=>choose(levels.find(item=>item.id==='medium-offbeats')!)}><span>♪</span><div><small>NUEVO · NIVEL MEDIO</small><b>Pulso desplazado</b><i>10 tareas · 2 compases · 60–110 BPM</i></div><strong>→</strong></button></section><section><div className="rhythm-section-title"><h2>Escuela de música</h2><button onClick={()=>setScreen('levels')}>Todos los niveles</button></div><div className="rhythm-training"><button onClick={()=>setScreen('levels')}><b>01</b><h3>Lectura rítmica</h3><p>Reproduce el ritmo escrito siguiendo el metrónomo.</p><span>Jugar →</span></button><button onClick={()=>choose(levels.find(item=>item.id==='songs')!)}><b>02</b><h3>Notas de canciones</h3><p>Aprende melodías completas, frase por frase y nota por nota.</p><span>Jugar →</span></button><button onClick={()=>choose(levels.find(item=>item.id==='guitar-solo-study')!)}><b>03</b><h3>Guitarra y solo</h3><p>Ruta técnica original para dominar guitarra completa y preparar solos largos.</p><span>Practicar →</span></button><button onClick={()=>choose(levels.find(item=>item.id==='medium-offbeats')!)}><b>04</b><h3>Nivel medio</h3><p>Contratiempos y entradas fuera del pulso fuerte.</p><span>Jugar →</span></button></div>{history.length>0&&<p className="rhythm-history">Historial: {history.length} tareas · Mejor {Math.max(...history.map(x=>x.score))}/500</p>}</section></main>;
}
