const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/events.js'), 'utf8');
function setup() {
  const writes=[], requests=[]; const note={value:''};
  const c={currentUser:{id:'a'},eventFightRatings:new Map([['fight',{rating:2}]]),myRatings:[],currentEventFights:[{id:'fight'}],currentFighterFights:[],document:{getElementById:id=>id==='notes-fight'?note:null},expandNoteShorthands:x=>x,updateFighterProgress(){},updateEventProgress(){},showToast(){},loadFightAggregates(){},sb:{from:()=>({upsert:(entry,opts)=>{assert.equal(opts.onConflict,'user_id,fight_id');writes.push({...entry});return {select:()=>({single:()=>new Promise((resolve,reject)=>requests.push({resolve,reject,entry}))})};}})}};
  vm.createContext(c);vm.runInContext('const ratingSaveQueues = new Map();\n'+source.slice(source.indexOf('function saveFightRating(fightId)')),c);
  return {c,writes,requests,note};
}
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
  let t=setup(); let p=t.c.saveFightRating('fight'); await tick();
  t.c.eventFightRatings.get('fight').rating=5;t.c.saveFightRating('fight');
  t.note.value='latest note';t.c.saveNotes('fight');
  t.requests[0].resolve({data:t.requests[0].entry,error:null});await tick();
  assert.equal(t.writes.length,2);assert.equal(t.writes[1].rating,5);assert.equal(t.writes[1].notes,'latest note');
  t.requests[1].resolve({data:t.requests[1].entry,error:null});await p;assert.equal(t.c.myRatings[0].rating,5);
  t=setup();p=t.c.saveFightRating('fight');await tick();t.requests[0].reject(new Error('offline'));await p;
  t.c.eventFightRatings.get('fight').rating=4;p=t.c.saveFightRating('fight');await tick();assert.equal(t.writes[1].rating,4);t.requests[1].resolve({data:t.requests[1].entry,error:null});await p;
  t=setup();p=t.c.saveFightRating('fight');await tick();t.c.currentUser={id:'b'};t.requests[0].resolve({data:t.requests[0].entry,error:null});await p;assert.equal(t.c.myRatings.length,0);
  console.log('PASS: rapid changes, overlapping notes, retry after thrown error, account-switch cache isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
