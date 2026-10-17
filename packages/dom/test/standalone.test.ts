import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("DOM runtime runs with only the signal kernel installed", async () => {
  const root = join(import.meta.dir, "..");
  const pkg = await Bun.file(join(root, "package.json")).json();
  expect(Object.keys(pkg.dependencies)).toEqual(["@tschk/moonshine"]);
  expect(Object.keys(pkg.optionalDependencies ?? {})).toEqual([]);
  expect(Object.keys(pkg.peerDependencies)).toEqual([
    "@tschk/moonshine-framework",
  ]);
  for (const peer of Object.keys(pkg.peerDependencies)) {
    expect(pkg.peerDependenciesMeta[peer]?.optional).toBe(true);
  }
  const dir = await mkdtemp(join(tmpdir(), "moonshine-dom-independent-"));
  try {
    for (const [name, source] of [
      ["moonshine", join(root, "../core")],
      ["moonshine-dom", root],
    ]) {
      const target = join(dir, "node_modules/@tschk", name!);
      await cp(join(source!, "src"), join(target, "src"), { recursive: true });
      await cp(join(source!, "package.json"), join(target, "package.json"));
    }
    const child = Bun.spawn(
      [
        Bun.which("bun")!,
        "--no-install",
        "-e",
        `import {createSignal,createMemo,createRoot,createEffect,on} from '@tschk/moonshine-dom/reactive';
       import {h,render} from '@tschk/moonshine-dom';
       import {h as subpathH} from '@tschk/moonshine-dom/dom';
       import {For,Show} from '@tschk/moonshine-dom/control';
       import {h as serverH,renderToString,on as serverOn} from '@tschk/moonshine-dom/ssr';
       import {createStore,produce,reconcile} from '@tschk/moonshine-dom/store';
       import {createResource} from '@tschk/moonshine-dom/resource';
       if(renderToString(()=>serverH('p',{'data-active':false},'<&')) !== '<p data-active="false">&lt;&amp;</p>') throw Error('SSR output');
       if(renderToString(()=>serverH('p',{style:{color:'red',opacity:0}})) !== '<p style="color:red;opacity:0;"></p>') throw Error('SSR styles');
       if(typeof h!=='function'||typeof render!=='function') throw Error('DOM exports');
       if(h!==subpathH) throw Error('DOM root entry');
       if(on!==serverOn) throw Error('SSR explicit dependency helper');
       if(typeof For!=='function'||typeof Show!=='function') throw Error('control exports');
       let observed;
       const end=createRoot(dispose=>{
         const [read,write]=createSignal(1);
         const twice=createMemo(()=>read()*2);
         createEffect(()=>{observed=twice()});
         return {dispose,write};
       });
       if(observed!==2) throw Error('initial');
       end.write(3);
       if(observed!==6) throw Error('update');
       end.dispose();
       end.write(4);
       if(observed!==6) throw Error('disposal');
       const [state,set]=createStore({name:'first',rows:[{id:'a',value:1}]});
       let name;
       const stop=createRoot(dispose=>{createEffect(()=>{name=state.name});return dispose});
       const row=state.rows[0];
       set(produce(draft=>{draft.name='next'}));
       set('rows',reconcile([{id:'a',value:2}]));
       if(name!=='next'||state.rows[0]!==row||row.value!==2) throw Error('native store updates');
       stop();set('name','last');
       if(name!=='next') throw Error('native store disposal');
       const [input,writeInput]=createSignal(1), [extra,writeExtra]=createSignal(10);
       let explicit;
       const disposeOn=createRoot(dispose=>{createEffect(on(input,value=>{explicit=value+extra()}));return dispose});
       writeExtra(20);
       if(explicit!==11) throw Error('explicit dependencies');
       writeInput(2);
       if(explicit!==22) throw Error('explicit input update');
       disposeOn();
       const owned=createRoot(dispose=>{
         const [data,actions]=createResource(async()=>7);
         return {data,actions,dispose};
       });
       await owned.actions.refetch();
       if(owned.data()!==7||owned.data.state!=='ready') throw Error('native resource');
       owned.actions.mutate(8);
       if(owned.data()!==8) throw Error('native resource mutate');
       owned.dispose();
       await Bun.write('counter.ts', \`import{h,render}from'@tschk/moonshine-dom/dom';import{createSignal,createMemo}from'@tschk/moonshine-dom/reactive';function Counter(){const[count,setCount]=createSignal(0);const twice=createMemo(()=>count()*2);return h('button',{onclick:()=>setCount(count()+1)},twice)}render(()=>h(Counter,{}),document.body);\`);
       const built=await Bun.build({entrypoints:['./counter.ts'],target:'browser',minify:true});
       if(!built.success) throw Error(String(built.logs));
       const code=await built.outputs[0].text();
       if(code.includes('Unknown error')) throw Error('Unused error boundary implementation retained');
       if(code.includes('Server children must be text or factory HTML')) throw Error('SSR serializer retained');
       for(const host of ['solid-js','svelte','react','react-dom','@tschk/moonshine-framework']) {
         let resolved=false;try{Bun.resolveSync(host,process.cwd());resolved=true}catch{}
         if(resolved) throw Error('Unexpected standalone dependency: '+host);
       }
       for(const recovery of [false,true]) {
         const name=recovery?'boundary':'ordinary';
         await Bun.write(name+'.ts', \`import{h,renderToString,boundary}from'@tschk/moonshine-dom/ssr';
           if(typeof document!=='undefined'||typeof window!=='undefined')throw Error('Browser globals');
           const output=renderToString(()=>\${recovery?"boundary(()=>{throw Error('failed')},()=>h('p',null,'<&'))":"h('p',null,'<&')"});
           if(output!=='<p>&lt;&amp;</p>')throw Error('Standalone SSR output');\`);
         const result=await Bun.build({entrypoints:['./'+name+'.ts'],target:'bun',minify:true});
         if(!result.success)throw Error(String(result.logs));
         const source=await result.outputs[0].text();
         if(!recovery&&source.includes('SSR boundary serialization requires'))throw Error('Unused SSR boundary retained');
         if(/MutationObserver|createElement\\(|addEventListener\\(/.test(source))throw Error('DOM implementation in SSR bundle');
         const output='./'+name+'.js';await Bun.write(output,source);
         await import(new URL(output,import.meta.url).href);
       }`,
      ],
      { cwd: dir, stdout: "pipe", stderr: "pipe" },
    );
    expect(await new Response(child.stderr).text()).toBe("");
    expect(await child.exited).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
