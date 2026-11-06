// Jercle Snake Fair Play v1.
// Client-side signals are a deterrent, not proof of human or AI control.
// In particular, remote-control tools can produce trusted browser input events.
export function createFairPlayMonitor(){
  let synthetic=0;
  let lastAccepted=null;
  let intervals=[];
  let flagged=false;
  let reason='';
  return {
    reset(){synthetic=0;lastAccepted=null;intervals=[];flagged=false;reason='';},
    record({trusted,accepted,time}){
      if(flagged)return;
      // Synthetic DOM events (e.g. dispatchEvent) cannot be trusted by the browser.
      // Ignore a single occurrence to avoid penalizing assistive browser extensions.
      if(trusted===false && ++synthetic>=3){
        flagged=true;
        reason='Repeated software-generated controls were detected.';
        return;
      }
      if(!accepted)return;
      if(lastAccepted!==null){
        const delta=time-lastAccepted;
        if(delta>=60 && delta<=4000){
          intervals.push(delta);
          if(intervals.length>30)intervals.shift();
        }else intervals=[]; // a gap breaks the rhythmic input streak
      }
      lastAccepted=time;
      if(intervals.length<24)return;
      // Only flag sustained, extremely uniform timing, not high scores or quick reflexes.
      const recent=intervals.slice(-24);
      const mean=recent.reduce((a,b)=>a+b,0)/recent.length;
      const deviation=Math.sqrt(recent.reduce((sum,x)=>sum+(x-mean)**2,0)/recent.length);
      const precise=recent.filter(x=>Math.abs(x-mean)<7).length;
      if(mean>=80 && mean<=1400 && deviation<5 && precise>=22){
        flagged=true;
        reason='Unusually uniform, machine-like input timing was detected.';
      }
    },
    get flagged(){return flagged;},
    get reason(){return reason;}
  };
}
