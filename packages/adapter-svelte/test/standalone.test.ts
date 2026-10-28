import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("a derived-only browser import omits unused component initialization", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonshine-derived-only-"));
  try {
    const entry = join(dir, "entry.ts");
    await Bun.write(
      entry,
      `export {createDerived} from ${JSON.stringify(join(import.meta.dir, "../src/runes.ts"))};`,
    );
    const built = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      minify: true,
    });
    expect(built.success).toBe(true);
    const source = await built.outputs[0]!.text();
    expect(source).not.toContain("moonshine.component");
    expect(source).not.toContain("Object.create(null)");
    expect(source).toContain("createDerived");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function standalone(script: string, framework = false) {
  const root = join(import.meta.dir, "..");
  const dir = await mkdtemp(join(tmpdir(), "moonshine-svelte-independent-"));
  try {
    for (const [name, source] of [
      ["moonshine", join(root, "../core")],
      ["moonshine-dom", join(root, "../dom")],
      ["moonshine-svelte", root],
      ...(framework
        ? [["moonshine-framework", join(root, "../framework")]]
        : []),
    ]) {
      const target = join(dir, "node_modules/@tschk", name!);
      await cp(join(source!, "src"), join(target, "src"), { recursive: true });
      await cp(join(source!, "package.json"), join(target, "package.json"));
    }
    const child = Bun.spawn([Bun.which("bun")!, "--no-install", "-e", script], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [output, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, output + error).toBe(0);
    expect(error).toBe("");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const sourceCompiler = process.env.MOONSHINE_CREPUS_COMPILER;
test.skipIf(!sourceCompiler)(
  "authored details bindings compile independently and snapshot SSR state",
  async () => {
    const page = `<script lang="ts">
import Child from './Child.svelte';
import {writable} from 'svelte/store';
let {initial=false}=$props<{initial?:boolean}>();
let open=$state(initial);
let model=$state({open:!initial});
const store=writable(initial);
</script><details id="main" bind:open ontoggle={()=>{throw Error('server event')}}>main</details><details id="member" bind:open={model.open}>member</details><details id="store" bind:open={$store}>store</details><Child bind:open/><p>{String(open)}</p>`;
    const child = `<script>let {open=$bindable(false)}=$props();</script><details id="child" bind:open>child</details>`;
    const check = `import assert from 'node:assert/strict';
import Page from './ssr/CrepusEmit.moonshine-ssr.ts';
import {h,renderToString} from '@tschk/moonshine-dom/ssr';
assert.equal(typeof document,'undefined');
for(const initial of [false,true,false]){
 const yes=initial?' open=""':'',no=initial?'':' open=""';
 const expected='<details id="main"'+yes+'>main</details><details id="member"'+no+'>member</details><details id="store"'+yes+'>store</details><details id="child"'+yes+'>child</details><p>'+initial+'</p>';
 assert.equal(renderToString(()=>h(Page,{initial})),expected);
}
assert.equal(typeof document,'undefined');`;
    await standalone(`
import assert from 'node:assert/strict';
const compiler=${JSON.stringify(sourceCompiler)};
async function compile(entry,target,out){
 const proc=Bun.spawn([compiler,'web','build','--site','source','--entry',entry,'--emit',target,'--out-dir',out],{stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,code]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);
 return {code,log:stdout+stderr};
}
await Bun.write('source/Page.svelte',${JSON.stringify(page)});
await Bun.write('source/Child.svelte',${JSON.stringify(child)});
for(const [target,out]of[['moonshine-dom','dom'],['moonshine-ssr','ssr']]){
 const result=await compile('Page.svelte',target,out);assert.equal(result.code,0,result.log);
 const built=await Bun.build({entrypoints:[out+'/CrepusEmit.'+target+'.ts'],target:target==='moonshine-dom'?'browser':'node',minify:true,metafile:true});
 assert.ok(built.success,String(built.logs));
 assert.ok(!Object.keys(built.metafile.inputs).some(path=>['svelte','solid-js','react','react-dom'].some(name=>path.includes('node_modules/'+name+'/'))||path.endsWith('.wasm')));
}
await Bun.write('check.ts',${JSON.stringify(check)});
await import(process.cwd()+'/check.ts');
const built=await Bun.build({entrypoints:['check.ts'],target:'node',minify:true,outdir:'dist'});assert.ok(built.success,String(built.logs));
const node=Bun.spawn(['node','dist/check.js'],{stdout:'pipe',stderr:'pipe'});
const [out,err,code]=await Promise.all([new Response(node.stdout).text(),new Response(node.stderr).text(),node.exited]);assert.equal(code,0,out+err);
for(const source of ['<script>let open=$state(false);</script><div bind:open/>','<script>const open=false;</script><details bind:open/>','<script>let open=$state(false);</script><details open bind:open/>']){
 await Bun.write('source/Bad.svelte',source);
 for(const target of ['moonshine-dom','moonshine-ssr']){
  const entry='keep/CrepusEmit.'+target+'.ts';await Bun.write(entry,'preserve');
  const result=await compile('Bad.svelte',target,'keep');assert.notEqual(result.code,0,result.log);assert.equal(await Bun.file(entry).text(),'preserve');
 }
}
`);
  },
);

test.skipIf(!sourceCompiler)(
  "authored SvelteKit $app/*, $env/*, $service-worker, @sveltejs/kit and @sveltejs/kit/hooks compile and render in SSR",
  async () => {
    const kitPage = `<script lang="ts">
import { page as pageState } from '$app/state';
import { page as pageStore } from '$app/stores';
import { goto } from '$app/navigation';
import { resolveRoute } from '$app/paths';
import { env } from '$env/dynamic/public';
import { files } from '$service-worker';
import { VERSION } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
const href = resolveRoute('/posts/[slug]', { slug: 'intro' });
const hasSequence = typeof sequence === 'function';
</script><a {href} onclick={() => goto(href)}>{pageState.url.pathname}|{$pageStore.params.slug ?? 'none'}|{env.PUBLIC_SITE ?? 'unset'}|{files.length}|{hasSequence}|{VERSION}</a>`;
    const privatePage = `<script lang="ts">
import { env as secretEnv } from '$env/dynamic/private';
</script><span>{secretEnv.SECRET_KEY ?? 'missing'}</span>`;
    await standalone(`
import assert from 'node:assert/strict';
const compiler=${JSON.stringify(sourceCompiler)};
await Bun.write('source/KitPage.svelte',${JSON.stringify(kitPage)});
await Bun.write('source/PrivatePage.svelte',${JSON.stringify(privatePage)});
for(const [target,out] of [['moonshine-dom','dom'],['moonshine-ssr','ssr']]){
 const proc=Bun.spawn([compiler,'web','build','--site','source','--entry','KitPage.svelte','--emit',target,'--out-dir',out],{stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,code]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);
 assert.equal(code,0,stdout+stderr);
}
const badDom=Bun.spawn([compiler,'web','build','--site','source','--entry','PrivatePage.svelte','--emit','moonshine-dom','--out-dir','bad-dom'],{stdout:'pipe',stderr:'pipe'});
assert.notEqual(await badDom.exited,0);
const okSsr=Bun.spawn([compiler,'web','build','--site','source','--entry','PrivatePage.svelte','--emit','moonshine-ssr','--out-dir','priv-ssr'],{stdout:'pipe',stderr:'pipe'});
assert.equal(await okSsr.exited,0);
const {setKitPage,version}=await import('@tschk/moonshine-svelte/navigation');
const {configureKitEnv,configureKitServiceWorker,resetKitEnv,resetKitServiceWorker}=await import('@tschk/moonshine-svelte/kit');
const {h,renderToString}=await import('@tschk/moonshine-dom/ssr');
const {default:KitPage}=await import(process.cwd()+'/ssr/CrepusEmit.moonshine-ssr.ts');
const {default:PrivatePage}=await import(process.cwd()+'/priv-ssr/CrepusEmit.moonshine-ssr.ts');
configureKitEnv({env:{PUBLIC_SITE:'moonshine',SECRET_KEY:'top-secret'}});
configureKitServiceWorker({files:['/icon.png','/sw.js']});
setKitPage({url:'http://localhost/posts/intro',params:{slug:'intro'}});
const html=renderToString(()=>h(KitPage,{}));
assert.equal(html,'<a href="/posts/intro">/posts/intro|intro|moonshine|2|true|'+version+'</a>');
const privHtml=renderToString(()=>h(PrivatePage,{}));
assert.equal(privHtml,'<span>top-secret</span>');
resetKitEnv();
resetKitServiceWorker();
`);
  },
);

test("stores, bridges and owner lifecycle work without host or optional packages", async () => {
  const pkg = await Bun.file(join(import.meta.dir, "../package.json")).json();
  expect(Object.keys(pkg.dependencies)).toEqual([
    "@tschk/moonshine",
    "@tschk/moonshine-dom",
  ]);
  for (const section of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ])
    for (const name of [
      "svelte",
      "react",
      "react-dom",
      "@tschk/crepuscularity-wasm",
      "@tschk/crepus-moonshine",
    ])
      expect(pkg[section] ?? {}).not.toHaveProperty(name);
  expect(pkg.peerDependenciesMeta["@tschk/moonshine-framework"].optional).toBe(
    true,
  );
  await standalone(`
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import * as root from '@tschk/moonshine-svelte';
import {writable,readable,derived,get} from '@tschk/moonshine-svelte/store';
import {onMount,onDestroy,tick,settled,flushSync,untrack as svelteUntrack,createEventDispatcher} from '@tschk/moonshine-svelte/svelte';
import {createState,createDerived,createProp,propsId,createRuneEffect,createRuneRoot,stateSnapshot} from '@tschk/moonshine-svelte/runes';
import {propsId as serverPropsId,settled as serverSettled,flushSync as serverFlushSync} from '@tschk/moonshine-svelte/ssr';
import {bindSelectValue,createInputGroup,bindValue,bindChecked,bindFiles,setOptionValue,setInputValue} from '@tschk/moonshine-svelte/binding';
import * as nativeBindings from '@tschk/moonshine-dom/binding';
import {classValue} from '@tschk/moonshine-svelte/class';
import {withRuneScheduler,createRunePreEffect} from '@tschk/moonshine-svelte/pre';
import {createRoot,createSignal,createRenderEffect} from '@tschk/moonshine-dom/reactive';
import {h,renderToString} from '@tschk/moonshine-dom/ssr';
for (const name of ['svelte','react','react-dom','@tschk/crepuscularity-wasm','@tschk/crepus-moonshine','@tschk/moonshine-framework']) {
 assert.equal(existsSync('node_modules/'+name),false);
 assert.throws(()=>Bun.resolveSync(name,process.cwd()));
}
for(const name of ['createBridgedWritable','fromMoonshineSignal','createMoonshineSignal','createResource','createMsSignal','createMemo','batch','untrack'])assert.equal(typeof root[name],'function',name);
assert.equal(typeof root.crepusRenderer.render,'function');
await Bun.write('bridge.ts',"export {createBridgedWritable} from '@tschk/moonshine-svelte';");
for(const target of ['browser','bun','node']){
 const built=await Bun.build({entrypoints:[process.cwd()+'/bridge.ts'],target,minify:true});
 assert.equal(built.success,true,String(built.logs));
 const output=await built.outputs[0].text();
 for(const forbidden of ['framework-source','@tschk/moonshine-framework','react-dom','@tschk/crepus','Server children'])assert.ok(!output.includes(forbidden),target+': '+forbidden);
}
const [phase,setPhase]=createSignal(0),phaseTrace=[];let phaseDOM=0;
const stopPre=createRoot(stop=>{withRuneScheduler(()=>{createRunePreEffect(()=>phaseTrace.push([phase(),phaseDOM]));createRenderEffect(()=>{phaseDOM=phase()})});return stop});
setPhase(1);setPhase(2);assert.equal(phaseDOM,0);await Promise.resolve();assert.equal(phaseDOM,2);assert.deepEqual(phaseTrace,[[0,0],[2,0]]);
stopPre();setPhase(3);await Promise.resolve();assert.equal(phaseDOM,2);assert.equal(phaseTrace.length,2);
assert.equal(classValue(['base',false,['active',{large:true,hidden:false}]]),'base active large');
assert.equal(renderToString(()=>h('p',{class:classValue([])},'empty')),'<p>empty</p>');
assert.equal(typeof createEventDispatcher,'function');
let manualCleanup=0;const stopManual=createRuneRoot(()=>()=>{manualCleanup++});stopManual();stopManual();assert.equal(manualCleanup,1);
assert.equal(typeof bindSelectValue,'function');assert.equal(typeof createInputGroup,'function');
assert.equal(typeof bindValue,'function');
for (const [name,helper] of Object.entries({bindChecked,bindFiles,setOptionValue,setInputValue}))assert.equal(helper,nativeBindings[name]);
assert.throws(()=>bindSelectValue(null,()=>null,()=>{}),/live native owner/);
createRoot(stop=>{const group=createInputGroup('radio',()=>null,()=>{});assert.equal(typeof group.bind,'function');stop();assert.throws(()=>group.bind(null),/live group/)});

const raw={nested:{count:0}};const native=createState(raw);native.value.nested.count=1;
assert.equal(raw.nested.count,0);assert.equal(native.value.nested.count,1);
const snapshot=stateSnapshot(native.value);snapshot.nested.count=8;assert.equal(native.value.nested.count,1);
const derivedState=createDerived(()=>native.value.nested.count%2);
assert.equal(derivedState.value,1);derivedState.value=9;assert.equal(derivedState.value,9);
native.value.nested.count=3;assert.equal(derivedState.value,1);
let stopEffect,effectRuns=0,effectCleanups=0;
createRoot(stop=>{stopEffect=stop;createRuneEffect(()=>{native.value.nested.count;effectRuns++;return()=>effectCleanups++})});
await tick();assert.equal(effectRuns,1);
native.value.nested.count=2;native.value.nested.count=3;
await tick();assert.equal(effectRuns,2);assert.equal(effectCleanups,1);
stopEffect();assert.equal(effectCleanups,2);
const localProp=createProp({},'missing',{fallback:()=>7});assert.equal(localProp.value,7);
localProp.value=8;assert.equal(localProp.value,8);
let starts=0,stops=0;
const input=readable(2,()=>{starts++;return ()=>stops++});
assert.equal(get(derived(input,n=>n*3)),6);assert.deepEqual([starts,stops],[1,1]);
const values=[];const state=writable(1);const stop=derived(state,n=>n+1).subscribe(n=>values.push(n));state.set(2);stop();assert.deepEqual(values,[2,3]);
const first=()=>1,second=()=>2;
const kernel=root.createMoonshineSignal(first);const bridge=root.fromMoonshineSignal(kernel);
const seen=[];const unsubscribe=bridge.subscribe(value=>seen.push(value));
bridge.set(second);assert.equal(kernel(),second);assert.equal(get(bridge),second);
bridge.update(value=>value===second?first:second);assert.equal(kernel(),first);
kernel.set(()=>second);assert.equal(get(bridge),second);unsubscribe();
assert.deepEqual(seen,[first,second,first,second]);
assert.equal(get(root.createBridgedWritable(first)),first);
let mounted=0,destroyed=0;
const html=renderToString(()=>{onMount(()=>mounted++);onDestroy(()=>destroyed++);return h('p',{id:serverPropsId()},'<native>&')});
assert.equal(html,'<p id="s-0">&lt;native&gt;&amp;</p>');assert.equal(destroyed,1);
await tick();await settled();await serverSettled();assert.equal(mounted,0);assert.equal(destroyed,1);
assert.equal(flushSync(()=>svelteUntrack(()=>42)),42);assert.equal(serverFlushSync(()=>7),7);
createRoot(stop=>{assert.equal(propsId(),'s-0');assert.equal(propsId(),'s-1');stop()});
assert.throws(()=>onDestroy(()=>{}),/component initialization/);
assert.throws(()=>propsId(),/component initialization/);
const {on}=await import('@tschk/moonshine-svelte/events');
const {cubicOut,linear}=await import('@tschk/moonshine-svelte/easing');
const {Spring,Tween,spring,tweened,prefersReducedMotion}=await import('@tschk/moonshine-svelte/motion');
assert.equal(linear(0.5),0.5);
assert.equal(cubicOut(1),1);
const et=new EventTarget();let pinged=0;const off=on(et,'ping',()=>{pinged++});et.dispatchEvent(new Event('ping'));off();et.dispatchEvent(new Event('ping'));assert.equal(pinged,1);
const sp=new Spring(1,{stiffness:1,damping:1});await sp.set(5);assert.equal(sp.current,5);
const tw=new Tween(2,{duration:0});await tw.set(8);assert.equal(tw.current,8);
const twStore=tweened(3,{duration:0});await twStore.set(9);assert.equal(get(twStore),9);
const spStore=spring(4,{stiffness:1,damping:1});await spStore.set(12,{hard:true});assert.equal(get(spStore),12);
assert.equal(typeof prefersReducedMotion.current,'boolean');
const {createAttachmentKey,fromAction,isAttachmentKey}=await import('@tschk/moonshine-svelte/attachments');
const {fade,fly,scale}=await import('@tschk/moonshine-svelte/transition');
const {flip}=await import('@tschk/moonshine-svelte/animate');
const attachKey=createAttachmentKey();assert.equal(isAttachmentKey(attachKey),true);
let actionDestroyed=false;const stopAttach=fromAction(()=>({destroy(){actionDestroyed=true}}))({});stopAttach?.();assert.equal(actionDestroyed,true);
assert.equal(fade({style:{opacity:'1'}},{duration:100}).css(0.5,0.5),'opacity: 0.5');
assert.ok(fly({style:{opacity:'1',transform:'none'}},{x:20}).css(0.5,0.5).includes('translate(10px, 0px)'));
assert.ok(scale({style:{opacity:'1',transform:'none'}},{start:0.5}).css(0.5,0.5).includes('scale(0.75)'));
assert.ok(flip({style:{transform:'none'}},{from:{left:0,top:0,width:50,height:50},to:{left:10,top:20,width:50,height:50}}).css(0.5,0.5).includes('translate(-5px, -10px)'));
const {render:serverRender}=await import('@tschk/moonshine-svelte/server');
const {once,preventDefault,handlers}=await import('@tschk/moonshine-svelte/legacy');
const srvOut=serverRender(p=>h('div',{id:serverPropsId()},p.text),{props:{text:'ok'},idPrefix:'p-'});
assert.equal(srvOut.body,'<div id="p-s-0">ok</div>');assert.equal(srvOut.html,srvOut.body);assert.equal(srvOut.head,'');
let onceCount=0;const fnOnce=once(preventDefault(()=>{onceCount++}));let prevented=false;fnOnce({preventDefault(){prevented=true}});fnOnce({preventDefault(){}});assert.equal(onceCount,1);assert.equal(prevented,true);
let hSum=0;handlers(n=>{hSum+=n},null,n=>{hSum+=n*2})(3);assert.equal(hSum,9);
const {page,goto,setKitPage,resolveRoute}=await import('@tschk/moonshine-svelte/navigation');
const {error:kitError,isHttpError,fail,isActionFailure,json:kitJson}=await import('@tschk/moonshine-svelte/kit');
setKitPage({url:'http://localhost/items/5',params:{id:'5'}});
assert.equal(page.url.pathname,'/items/5');
assert.equal(resolveRoute('/items/[id]',{id:'5'}),'/items/5');
await goto('/items/6');
assert.equal(page.url.pathname,'/items/6');
assert.equal(isActionFailure(fail(400,{bad:true})),true);
let httpErr;try{kitError(403,'Forbidden')}catch(e){httpErr=e}
assert.equal(isHttpError(httpErr,403),true);
assert.equal((await kitJson({ok:1}).json()).ok,1);
`);
});

test("optional framework compatibility renderer serves native SSR, API and SPA", async () => {
  await standalone(
    `
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {crepusRenderer} from '@tschk/moonshine-svelte';
for(const name of ['svelte','react','react-dom','@tschk/crepuscularity-wasm','@tschk/crepus-moonshine'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
const page=join(process.cwd(),'page.ts');
await writeFile(page,\`import {h} from '@tschk/moonshine-dom/ssr';
export const metadata={title:'native <title>',description:'safe<&'};
export default function Page({data}){return h('p',null,data.name);}\`);
const context={request:new Request('https://example.com/'),route:{id:'home',path:'/',file:page,mode:'ssr',runtime:'bun',decision:'standalone',clientEntries:[]},params:{},data:{name:'<alice>&'},signal:new AbortController().signal};
const response=await crepusRenderer.render(context);assert.equal(response.status,200);
const html=await response.text();assert.ok(html.includes('<title>native &lt;title&gt;</title>'));assert.ok(html.includes('<p>&lt;alice&gt;&amp;</p>'));assert.ok(html.includes('content="safe&lt;&amp;"'));
const api=await crepusRenderer.render({...context,route:{...context.route,mode:'api'}});assert.ok(api.headers.get('content-type').includes('application/json'));assert.deepEqual(await api.json(),context.data);
const spa=await crepusRenderer.prerender({...context,route:{...context.route,id:'counter',file:'missing-server-page.ts',mode:'spa',clientEntries:['/client.js']},params:{id:'2'},data:{name:'</script>'}});
assert.ok(spa.includes('data-moonshine-app="counter"'));assert.ok(spa.includes('src="/client.js"'));
const payload=spa.split('data-moonshine-props>')[1].split('</script>')[0];assert.ok(!payload.includes('<'));assert.deepEqual(JSON.parse(payload),{params:{id:'2'},data:{name:'</script>'}});
`,
    true,
  );
});

test("raw rune cells work in an isolated host-free package graph", async () => {
  await standalone(`
    import {createRawState,createRuneEffect} from '@tschk/moonshine-svelte/runes';
    import {createRoot} from '@tschk/moonshine-dom/reactive';
    for(const host of ['svelte','solid-js','react','react-dom']) {
      try { Bun.resolveSync(host,process.cwd());throw Error('host unexpectedly resolves: '+host); }
      catch(error) { if(!String(error).includes('Cannot find'))throw error; }
    }
    const initial={value:1},cell=createRawState(initial),seen=[];
    if(cell.value!==initial)throw Error('raw identity lost');
    const stop=createRoot(dispose=>{createRuneEffect(()=>{cell.value;return()=>seen.push(cell.value.value)});return dispose});
    await Promise.resolve();cell.value={value:2};cell.value={value:3};await Promise.resolve();
    if(JSON.stringify(seen)!=='[1]')throw Error('raw cleanup history lost');stop();
    const fn=()=>42,callback=createRawState(fn);callback.value=fn;if(callback.value!==fn)throw Error('function identity lost');
  `);
});

test("post component publication works in copied native packages without a DOM host", async () => {
  await standalone(`
import assert from 'node:assert/strict';
import {createRoot} from '@tschk/moonshine-dom/reactive';
import {createComponent} from '@tschk/moonshine-dom/component';
import {componentRef,exposeComponent} from '@tschk/moonshine-dom/component-instance';
import {withRuneScheduler} from '@tschk/moonshine-svelte/pre';
import {createRuneEffect} from '@tschk/moonshine-svelte/runes';
import {onMount} from '@tschk/moonshine-svelte/svelte';
for(const name of ['svelte','react','react-dom','@tschk/crepuscularity-wasm'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
let reference=null,stop;const trace=[];
function Child(){createRuneEffect(()=>trace.push(['child-post',!!reference]));onMount(()=>trace.push(['mount',!!reference]));exposeComponent({ready:true});return 'child'}
function Parent(){createRuneEffect(()=>trace.push(['parent-post',!!reference]));return createComponent(Child,{[componentRef]:{publication:'post',cleanup:'commit',get:()=>reference,set:next=>reference=next}},'dom')}
createRoot(dispose=>{stop=dispose;withRuneScheduler(()=>createComponent(Parent,{},'dom'))});
assert.equal(reference,null);await Promise.resolve();
assert.deepEqual(trace,[['child-post',false],['mount',false],['parent-post',true]]);assert.equal(reference.ready,true);
stop();assert.equal(reference,null);
`);
});

test("directives import and bundle without hosts and skip all SSR thunks", async () => {
  await standalone(`
import assert from 'node:assert/strict';
import {installAction,installAttachment} from '@tschk/moonshine-svelte/directives';
import {h,renderToString} from '@tschk/moonshine-dom/ssr';
import {createRoot} from '@tschk/moonshine-dom/reactive';
for(const name of ['svelte','solid-js','react','react-dom','@tschk/moonshine-framework','@tschk/crepuscularity-wasm'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
let calls=0;const forbidden=()=>{calls++;throw Error('SSR directive thunk ran')};
function install(){installAction(undefined,forbidden,forbidden);installAttachment(undefined,forbidden);return h('p',null,'<&')}
assert.equal(renderToString(install),'<p>&lt;&amp;</p>');
assert.equal(renderToString(()=>h(install,{})),'<p>&lt;&amp;</p>');
createRoot(stop=>{h(install,{});stop()});
assert.equal(calls,0);
await Bun.write('directives.ts',\`import{installAction,installAttachment}from'@tschk/moonshine-svelte/directives';import{withRuneScheduler}from'@tschk/moonshine-svelte/pre';import{h,render}from'@tschk/moonshine-dom/dom';export function mount(target){return render(()=>withRuneScheduler(()=>h('div',{ref:node=>{installAction(node,(element,value)=>({update(next){element.dataset.value=String(next)}}),()=>1);installAttachment(node,()=>element=>()=>{element.dataset.done='yes'})},'data-ready':'yes'},'content')),target)}\`);
const built=await Bun.build({entrypoints:['./directives.ts'],target:'browser',minify:true});
assert.ok(built.success,String(built.logs));
const source=await built.outputs[0].text();
assert.ok(!source.includes('Server children must be text or factory HTML'));
`);
});

test("await blocks render and bundle in copied host-free packages", async () => {
  await standalone(`
import assert from 'node:assert/strict';
import {awaitBlock} from '@tschk/moonshine-svelte/await';
import {withRuneScheduler} from '@tschk/moonshine-svelte/pre';
import {h,renderToString} from '@tschk/moonshine-dom/ssr';
for(const name of ['svelte','solid-js','react','react-dom','@tschk/moonshine-framework','@tschk/crepuscularity-wasm'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
let pending=0,then=0;
const view=input=>renderToString(()=>withRuneScheduler(()=>awaitBlock(()=>input,{pending:()=>{pending++;return h('i',null,'pending')},then:value=>{then++;return h('b',null,String(value()))},catch:()=>{throw Error('SSR must not await rejection')}})));
assert.equal(view(false),'<b>false</b>');assert.equal(view(null),'<b>null</b>');
assert.equal(view(Promise.resolve('ready')),'<i>pending</i>');assert.equal(view(Promise.reject('raw')),'<i>pending</i>');
await Promise.resolve();assert.deepEqual([pending,then],[2,2]);
await Bun.write('await.ts',\`import{awaitBlock}from'@tschk/moonshine-svelte/await';import{withRuneScheduler}from'@tschk/moonshine-svelte/pre';import{h,render}from'@tschk/moonshine-dom/dom';export function mount(target,read){return render(()=>withRuneScheduler(()=>awaitBlock(read,{pending:()=>h('i',null,'pending'),then:value=>h('b',null,()=>String(value()))})),target)}\`);
const built=await Bun.build({entrypoints:['./await.ts'],target:'browser',minify:true});assert.ok(built.success,String(built.logs));
const source=await built.outputs[0].text();assert.ok(!source.includes('Server children must be text or factory HTML'));
`);
});

test("store references cache SSR subscriptions and bundle without hosts", async () => {
  await standalone(`
import assert from 'node:assert/strict';
import {createStoreReference} from '@tschk/moonshine-svelte/store-binding';
import {withRuneScheduler} from '@tschk/moonshine-svelte/pre';
import {h,renderToString} from '@tschk/moonshine-dom/ssr';
for(const name of ['svelte','solid-js','react','react-dom','@tschk/moonshine-framework','@tschk/crepuscularity-wasm'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
let starts=0,stops=0;const store={subscribe(run){assert.equal(this,store);starts++;run({count:2});const subscription={unsubscribe(){assert.equal(this,subscription);stops++}};return subscription}};
function Page(){const reference=createStoreReference();const result=h('p',null,()=>reference.get(store).count,'/',()=>reference.get(store).count);reference.finish();return result}
for(let request=1;request<=2;request++){assert.equal(renderToString(()=>withRuneScheduler(()=>h(Page,{}))),'<p>2/2</p>');assert.deepEqual([starts,stops],[request,request])}
await Bun.write('store-reference.ts',\`import{createStoreReference}from'@tschk/moonshine-svelte/store-binding';import{withRuneScheduler}from'@tschk/moonshine-svelte/pre';import{h,render}from'@tschk/moonshine-dom/dom';export function mount(target,store){return render(()=>withRuneScheduler(()=>{const reference=createStoreReference();const node=h('p',null,()=>reference.get(store).count);reference.finish();return node}),target)}\`);
const built=await Bun.build({entrypoints:['./store-reference.ts'],target:'browser',minify:true});assert.ok(built.success,String(built.logs));assert.ok(!(await built.outputs[0].text()).includes('Server children must be text or factory HTML'));
`);
});

test.skipIf(!sourceCompiler)(
  "authored intrinsic and form spreads preserve SSR identity and order in isolated Bun and Node",
  async () => {
    const page = `<script lang="ts">
import Slot from './Slot.svelte';
let {attrs}=$props<{attrs:Record<string,unknown>}>();
const trace=(globalThis as unknown as {spreadTrace:string[]}).spreadTrace;
const selected={id:1};
let bound=$state('bound');
let opened=$state(true);
let group=$state(['a']);
let choice=$state('a');
const holder={get files():FileList|null{throw Error('SSR file model read');},set files(value:FileList|null){void value;}};
function read(label:string,value:string){trace.push(label);return value;}
function layer(){trace.push('spread');return attrs;}
</script><Slot><button data-before={read('before','b')} {...layer()} data-callback={()=>{throw Error('function data must not run')}} data-after={read('after','a')} onclick={()=>{throw Error('event must not run during render')}}>text</button><input {...{defaultValue:'seed',value:'live'}}/><input {...{value:'spread'}} bind:value={bound}/><input type="file" bind:files={holder.files} {...{files:'authored'}}/><select {...{value:selected}}><option {...{value:{id:1}}}>Different</option><option {...{value:selected}}>Same</option></select><details {...{open:false}} bind:open={opened}><summary>Title</summary>Body</details><input type="checkbox" {...{value:'a'}} bind:group={group}/><input type="checkbox" value="a" {...{checked:false}} bind:group={group}/><input type="radio" value="a" bind:group={choice} {...{checked:false}}/></Slot>`;
    const check = `import assert from 'node:assert/strict';
import Page from './ssr/CrepusEmit.moonshine-ssr.ts';
import {h,renderToString} from '@tschk/moonshine-dom/ssr';
assert.equal(typeof document,'undefined');
for(let request=0;request<3;request++){
 globalThis.spreadTrace=[];
 const attrs={get title(){globalThis.spreadTrace.push('getter');return 'value'},class:['a',{b:true}],hidden:false,ref:'data',children:'attr'};
 assert.equal(renderToString(()=>h(Page,{attrs})),'<aside><button data-before="b" title="value" class="a b" ref="data" children="attr" data-after="a">text</button><input value="live"><input value="bound"><input type="file" files="authored"><select><option value="[object Object]">Different</option><option value="[object Object]" selected="">Same</option></select><details open=""><summary>Title</summary>Body</details><input type="checkbox" value="a"><input type="checkbox" value="a" checked=""><input type="radio" value="a"></aside>');
 assert.deepEqual(globalThis.spreadTrace,['before','spread','getter','after']);
}`;
    await standalone(`import assert from 'node:assert/strict';
const compiler=${JSON.stringify(sourceCompiler)};
await Bun.write('source/Page.svelte',${JSON.stringify(page)});
await Bun.write('source/Slot.svelte','<script>let {children}=$props();</script><aside>{@render children?.()}</aside>');
for(const [target,out]of[['moonshine-dom','dom'],['moonshine-ssr','ssr']]){
 const child=Bun.spawn([compiler,'web','build','--site','source','--entry','Page.svelte','--emit',target,'--out-dir',out],{stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);assert.equal(code,0,stdout+stderr);
 const built=await Bun.build({entrypoints:[out+'/CrepusEmit.'+target+'.ts'],target:target==='moonshine-dom'?'browser':'node',minify:true,metafile:true});assert.ok(built.success,String(built.logs));
 assert.ok(!Object.keys(built.metafile.inputs).some(path=>['svelte','solid-js','react','react-dom'].some(name=>path.includes('node_modules/'+name+'/'))||path.endsWith('.wasm')));
}
await Bun.write('check.ts',${JSON.stringify(check)});await import(process.cwd()+'/check.ts');
const built=await Bun.build({entrypoints:['check.ts'],target:'node',minify:true,outdir:'dist'});assert.ok(built.success,String(built.logs));
const child=Bun.spawn(['node','dist/check.js'],{stdout:'pipe',stderr:'pipe'});
const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);assert.equal(code,0,out+err);
`);
  },
);

test.skipIf(!sourceCompiler)(
  "authored .svelte components using $app/server and @sveltejs/kit load/action helpers compile and run without host packages",
  async () => {
    const serverPage = `<script lang="ts">
import { getRequestEvent, query, prerender, command, form } from '$app/server';
import { page } from '$app/state';
const event = getRequestEvent();
const getGreeting = query((name: string) => \`Hello, \${name}!\`);
const getStaticBuild = prerender(() => '2026.10');
const pingCmd = command(async (msg: string) => ({ echoed: msg }));
const contactForm = form(async (data: { email: string }) => ({ ok: Boolean(data.email) }));
</script>
<section data-path={event.url.pathname} data-user={event.locals.user} data-page={page.url.pathname} data-form-method={contactForm.method} data-fn={typeof getGreeting + ':' + typeof getStaticBuild + ':' + typeof pingCmd}>{page.data.headline}</section>
`;
    await standalone(`import assert from 'node:assert/strict';
const compiler=${JSON.stringify(sourceCompiler)};
await Bun.write('source/ServerPage.svelte',${JSON.stringify(serverPage)});
const child=Bun.spawn([compiler,'web','build','--site','source','--entry','ServerPage.svelte','--emit','moonshine-ssr','--out-dir','ssr'],{stdout:'pipe',stderr:'pipe'});
const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
assert.equal(code,0,stdout+stderr);
const {default:ServerPage}=await import(process.cwd()+'/ssr/CrepusEmit.moonshine-ssr.ts');
const {h,renderToString}=await import('@tschk/moonshine-dom/ssr');
const {withKitRequestEvent,executeKitServerLoad,executeKitUniversalLoad,executeKitAction,fail}=await import('@tschk/moonshine-svelte/kit');
for(const name of ['svelte','@sveltejs/kit','react','react-dom','@tschk/crepuscularity-wasm'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
const ssrLoaded=await executeKitServerLoad(async ({params})=>({slug:params.slug}),{url:'http://localhost/blog/intro',params:{slug:'intro'}});
await executeKitUniversalLoad(async ({data})=>({headline:'Post:'+data.slug}),{url:'http://localhost/blog/intro',params:{slug:'intro'},data:ssrLoaded.data});
const html=withKitRequestEvent({url:'http://localhost/blog/intro',locals:{user:'ada'}},()=>renderToString(()=>h(ServerPage,{})));
assert.equal(html,'<section data-path="/blog/intro" data-user="ada" data-page="/blog/intro" data-form-method="POST" data-fn="function:function:function">Post:intro</section>');
const actionRes=await executeKitAction({default:async ()=>fail(400,{bad:true})},'default',{url:'http://localhost/blog/intro'});
assert.equal(actionRes.type,'failure');
assert.equal(actionRes.status,400);
`);
  },
);
