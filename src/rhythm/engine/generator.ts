import type { Level, PatternEvent } from '../domain/exercise';
import type { RhythmExercise } from '../domain/exercise';
import { assertValidExercise } from './validation';

const n=(durationBeats:number,tieToNext=false):PatternEvent=>({kind:'note',durationBeats,tieToNext});
const mn=(durationBeats:number,midiNote:number):PatternEvent=>({kind:'note',durationBeats,midiNote});
const r=(durationBeats:number):PatternEvent=>({kind:'rest',durationBeats});
const LEVELS:Level[]=[
 {id:'medium-offbeats',title:'Nivel medio · Pulso desplazado',description:'Contratiempos, silencios fuertes y entradas en “y”',durations:['Negra','Corchea','Silencios','Contratiempo'],enabled:true,beatsPerExercise:8,tempoRange:{min:60,max:110,step:5,default:80},patterns:[
  [r(.5),n(.5),n(1),r(1),n(1),r(.5),n(.5),n(1),r(1),n(1)],
  [n(1),r(.5),n(.5),r(1),n(1),r(.5),n(.5),r(.5),n(.5),n(2)],
  [r(1),n(.5),n(.5),n(1),r(.5),n(.5),n(1),r(.5),n(.5),r(1),n(1)],
  [r(.5),n(.5),r(.5),n(.5),n(2),n(1),r(.5),n(.5),r(.5),n(.5),n(1)],
  [n(.5),n(.5),r(.5),n(.5),r(.5),n(.5),n(1),r(1),n(.5),n(.5),r(.5),n(.5),n(1)],
 ],patternTitles:['Entrada en “y” · patrón estable','Silencio fuerte · respuesta desplazada','Contratiempo después del silencio','Alternancia · apoyo y contratiempo','Lectura continua · pulso desplazado']},
 {id:'songs',title:'Notas de las canciones',description:'Melodía completa por frases: altura, duración y pulso',durations:['Notas','Negra','Blanca','Corchea'],enabled:true,beatsPerExercise:8,patterns:[[mn(1,60),mn(1,62),mn(1,64),mn(1,60),mn(1,60),mn(1,62),mn(1,64),mn(1,60)],[mn(1,64),mn(1,65),mn(2,67),mn(1,64),mn(1,65),mn(2,67)],[mn(1,60),mn(1,60),mn(1,67),mn(1,67),mn(1,69),mn(1,69),mn(2,67)],[mn(1,64),mn(1,64),mn(1,65),mn(1,67),mn(1,67),mn(1,65),mn(1,64),mn(1,62)],[mn(1,64),mn(1,62),mn(1,60),mn(1,62),mn(1,64),mn(1,64),mn(2,64)]],patternTitles:['Martinillo · frase completa','Martinillo · “¿Dónde estás?”','Estrellita · frase completa','Himno a la alegría · frase completa','María tenía un corderito · frase completa']},
 {id:'guitar-solo-study',title:'Guitarra completa · estudio de solo',description:'Frases originales para bends, arpegios, secuencias y cierre melódico',durations:['Guitarra','Arpegios','Bends','Corcheas'],enabled:true,beatsPerExercise:8,tempoRange:{min:50,max:100,step:5,default:70},patterns:[
  [mn(1,59),mn(1,62),mn(1,66),mn(1,69),mn(1,66),mn(1,62),mn(2,59)],
  [mn(.5,71),mn(.5,69),mn(.5,66),mn(.5,62),mn(1,64),mn(1,66),mn(.5,69),mn(.5,71),mn(1,69),mn(2,66)],
  [mn(.5,66),mn(.5,69),mn(.5,71),mn(.5,73),mn(.5,71),mn(.5,69),mn(1,66),mn(.5,64),mn(.5,66),mn(1,69),mn(2,66)],
  [mn(1,59),mn(.5,62),mn(.5,64),mn(1,66),mn(1,69),mn(.5,71),mn(.5,69),mn(1,66),mn(2,59)],
 ],patternTitles:['Arpegio menor · control de cuerda','Secuencia ascendente · articulación','Clímax de solo · bend y respuesta','Cierre melódico · resolución']},
 {id:'songs-medium',title:'Canciones · nivel medio',description:'Subdivisiones y frases más activas',durations:['Negra','Blanca','Corchea'],enabled:true,beatsPerExercise:8,patterns:[[mn(.5,64),mn(.5,64),mn(1,64),mn(1,64),mn(.5,64),mn(.5,64),mn(1,64),mn(1,67),mn(2,60)],[mn(1,60),mn(1,64),mn(1,65),mn(1,67),mn(2,60),mn(1,64),mn(1,62)],[mn(.5,67),mn(.5,69),mn(1,67),mn(1,64),mn(.5,60),mn(.5,62),mn(1,64),mn(1,62),mn(2,60)]],patternTitles:['Campanitas · frase con subdivisión','Cuando los santos marchan · frase inicial','Puente de Londres · frase completa']},
 {id:'songs-hard',title:'Canciones · nivel difícil',description:'Frases rápidas y alta densidad',durations:['Corchea','Negra','Blanca'],enabled:true,beatsPerExercise:8,patterns:[[mn(.5,76),mn(.5,75),mn(.5,76),mn(.5,75),mn(.5,76),mn(.5,71),mn(.5,74),mn(.5,72),mn(2,69),mn(1,60),mn(1,64)],[mn(.5,67),mn(.5,67),mn(.5,69),mn(.5,71),mn(.5,72),mn(.5,71),mn(.5,69),mn(.5,67),mn(.5,65),mn(.5,65),mn(.5,67),mn(.5,69),mn(1,67),mn(1,60)],[mn(.5,64),mn(.5,65),mn(.5,67),mn(.5,69),mn(.5,71),mn(.5,72),mn(.5,74),mn(.5,76),mn(.5,74),mn(.5,72),mn(.5,71),mn(.5,69),mn(.5,67),mn(.5,65),mn(.5,64),mn(.5,62)]],patternTitles:['Para Elisa · motivo inicial','Can-Can · frase rápida','Escala de concierto · reto de corcheas']},
 {id:'eighths',title:'Corcheas',description:'Pulso y subdivisión',durations:['Corchea'],enabled:true,patterns:[[n(.5),n(.5),n(.5),n(.5),n(.5),n(.5),n(.5),n(.5)],[n(1),n(.5),n(.5),n(1),n(.5),n(.5)]]},
 {id:'core',title:'Blancas, negras y corcheas',description:'Duraciones fundamentales',durations:['Blanca','Negra','Corchea'],enabled:true,patterns:[[n(1),n(1),n(2)],[n(2),n(1),n(1)],[n(2),n(2)],[n(1),n(.5),n(.5),n(2)],[n(1),n(1),n(1),n(1)],[n(.5),n(.5),n(1),n(.5),n(.5),n(1)]]},
 {id:'rests',title:'Blancas, negras, corcheas y silencios',description:'Pulso y espacio',durations:['Blanca','Negra','Corchea','Silencios'],enabled:true,patterns:[[n(1),r(1),n(2)],[r(1),n(.5),n(.5),n(1),n(1)],[n(2),r(1),n(1)]]},
 {id:'dotted',title:'Blancas, negras y corcheas con punto',description:'Próximamente',durations:['Con punto'],enabled:false,patterns:[]},
 {id:'ties-basic',title:'Blancas y negras con ligaduras',description:'Continuidad entre figuras',durations:['Blanca','Negra','Ligadura'],enabled:true,patterns:[[n(1,true),n(1),n(2)],[n(2,true),n(2)],[n(1),n(1,true),n(2)]]},
 {id:'ties',title:'Blancas, negras y corcheas con ligaduras',description:'Ritmos combinados',durations:['Blanca','Negra','Corchea','Ligadura'],enabled:true,patterns:[[n(.5,true),n(.5),n(1),n(2)],[n(1),n(.5,true),n(.5),n(2)],[n(.5),n(.5),n(1,true),n(2)]]}
];
export const levels=LEVELS;
export function validatePattern(pattern:PatternEvent[],beats=4){return Math.abs(pattern.reduce((s,e)=>s+e.durationBeats,0)-beats)<1e-9}
export function generateSession(levelId:string,count=10):RhythmExercise[]{const level=LEVELS.find(l=>l.id===levelId);if(!level?.enabled||!level.patterns.length)throw new Error('Nivel no disponible');if(!Number.isInteger(count)||count<1||count>100)throw new Error('Cantidad de tareas inválida');const totalBeats=level.beatsPerExercise??4;level.patterns.forEach(p=>{if(!validatePattern(p,totalBeats))throw new Error('Patrón inválido')});return Array.from({length:count},(_,i)=>{const patternIndex=(i*7+level.patterns.length)%level.patterns.length,p=level.patterns[patternIndex];let beat=0;return assertValidExercise({id:`${levelId}-${i+1}`,title:level.patternTitles?.[patternIndex]??level.title,meterNumerator:4,meterDenominator:4,bpm:80,totalBeats,events:p.map((e,j)=>{const event={...e,id:`${levelId}-${i+1}-${j}`,startBeat:beat};beat+=e.durationBeats;return event})})})}
