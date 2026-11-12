// `keywords` mixes both languages so search finds an emoji either way; `names` is the one word a screen reader
// and the tooltip use, in the app's language. Emojis with no names fall back to the character itself.
export type EmojiItem={value:string;group:string;keywords:string;names?:{ko:string;en:string}}
const aliases: Record<string,string> = { '📚':'책 도서 서재 books library','📖':'독서 읽기 reading book','💻':'개발 컴퓨터 computer code','❤️':'하트 사랑 heart love','⭐':'별 즐겨찾기 star','🌱':'새싹 성장 plant growth','🎓':'학교 공부 school education','🧠':'뇌 생각 brain','🎨':'그림 미술 art palette','🎵':'음악 music','🔬':'과학 science','🌍':'세계 지구 earth','☕':'커피 coffee','😀':'웃음 happy smile','🐱':'고양이 cat','🐶':'강아지 dog','🍎':'사과 apple','🌸':'꽃 flower','🏠':'집 home','🚀':'로켓 rocket','🔥':'불 fire','✨':'반짝 sparkle','💡':'아이디어 idea','📝':'메모 note','🏆':'트로피 trophy','🍀':'행운 lucky','🦋':'나비 butterfly','🪴':'식물 plant','🍓':'딸기 strawberry' }
/** The first Korean and the first English word of an alias ('커피 coffee' → 커피 / coffee). */
function namesOf(keywords:string) {const words=keywords.split(' '),ko=words.find(w=>/\p{Script=Hangul}/u.test(w)),en=words.find(w=>/^[a-z]/i.test(w));return ko&&en?{ko,en}:undefined}
function groupOf(cp:number) {if(cp>=0x1f600&&cp<=0x1f64f||cp>=0x1f900&&cp<=0x1f92f)return '표정';if(cp>=0x1f300&&cp<=0x1f43f)return '자연 · 음식';if(cp>=0x1f440&&cp<=0x1f487||cp>=0x1f9b0&&cp<=0x1f9df)return '사람';if(cp>=0x1f680&&cp<=0x1f6ff)return '여행';return '사물 · 기호'}
const items:EmojiItem[]=[]
for(const [start,end] of [[0x2000,0x3300],[0x1f000,0x1faff]])for(let cp=start;cp<=end;cp++){
 const char=String.fromCodePoint(cp)
 if(!/\p{Emoji}/u.test(char)||/\p{Regional_Indicator}|\p{Emoji_Modifier}/u.test(char))continue
 const value=/\p{Emoji_Presentation}/u.test(char)?char:char+'\ufe0f'
 const keywords=aliases[value]??aliases[char]??''
 items.push({value,group:groupOf(cp),keywords,names:namesOf(keywords)})
 if(/\p{Emoji_Modifier_Base}/u.test(char))for(let tone=0x1f3fb;tone<=0x1f3ff;tone++)items.push({value:char+String.fromCodePoint(tone),group:'사람',keywords:aliases[char]??'',names:namesOf(aliases[char]??'')})
}
for(const value of ['©️','®️','™️',...'0123456789#*'].map(v=>v.length===1?v+'\ufe0f\u20e3':v)){const base=value.slice(0,1),digit=/\d/.test(base);items.push({value,group:'사물 · 기호',keywords:'기호 숫자 symbol number',names:{ko:(digit?'숫자 ':'기호 ')+base,en:(digit?'number ':'symbol ')+base}})}
const regionNames=new Intl.DisplayNames(['ko'],{type:'region'}),regionNamesEn=new Intl.DisplayNames(['en'],{type:'region'})
for(let a=65;a<=90;a++)for(let b=65;b<=90;b++){const code=String.fromCharCode(a,b),name=regionNames.of(code),en=regionNamesEn.of(code)??code;if(name&&name!==code&&!name.includes('알 수 없는'))items.push({value:String.fromCodePoint(0x1f1e6+a-65,0x1f1e6+b-65),group:'국기',keywords:name+' '+en+' '+code,names:{ko:name,en}})}
for(const person of ['🧑','👨','👩'])for(const role of ['💻','🔬','🎓','🎨','🚀','⚕️','🏫','🍳','🌾','🔧','🏭','💼','🎤','✈️','🚒'])items.push({value:person+'\u200d'+role,group:'사람',keywords:'직업 일 사람 profession work',names:{ko:'직업',en:'profession'}})
export const EMOJIS=[...new Map(items.map(item=>[item.value,item])).values()]
export const EMOJI_GROUPS=['전체',...new Set(EMOJIS.map(item=>item.group))]
export function isEmoji(value:string) { return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value.trim())].length===1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value) }
