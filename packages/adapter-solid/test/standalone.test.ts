import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function standalone(script: string, framework = false) {
  const root = join(import.meta.dir, "..");
  const dir = await mkdtemp(join(tmpdir(), "moonshine-solid-independent-"));
  try {
    for (const [name, source] of [
      ["moonshine", join(root, "../core")],
      ["moonshine-dom", join(root, "../dom")],
      ["moonshine-solid", root],
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

test("all native compatibility surfaces work without Solid, React, WASM or framework", async () => {
  const pkg = await Bun.file(join(import.meta.dir, "../package.json")).json();
  expect(Object.keys(pkg.dependencies)).toEqual([
    "@tschk/moonshine",
    "@tschk/moonshine-dom",
  ]);
  expect(Object.keys(pkg.optionalDependencies ?? {})).toEqual([]);
  for (const section of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ])
    expect(pkg[section] ?? {}).not.toHaveProperty("solid-js");
  for (const peer of Object.keys(pkg.peerDependencies))
    expect(pkg.peerDependenciesMeta[peer]?.optional).toBe(true);
  await standalone(`
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import * as root from '@tschk/moonshine-solid';
import * as solid from '@tschk/moonshine-solid/solid';
import * as store from '@tschk/moonshine-solid/store';
import h, {h as namedH} from '@tschk/moonshine-solid/h';
import * as reactive from '@tschk/moonshine-solid/reactive';
import * as dom from '@tschk/moonshine-solid/dom';
import * as control from '@tschk/moonshine-solid/control';
import * as ssr from '@tschk/moonshine-solid/ssr';
import * as portal from '@tschk/moonshine-solid/portal';
import * as nativeReactive from '@tschk/moonshine-dom/reactive';
import * as nativeDOM from '@tschk/moonshine-dom';
import * as nativeControl from '@tschk/moonshine-dom/control';
import * as nativeSSR from '@tschk/moonshine-dom/ssr';
import * as nativeStore from '@tschk/moonshine-dom/store';
import * as nativeResource from '@tschk/moonshine-dom/resource';
for (const name of ['solid-js','react','react-dom','@tschk/crepuscularity-wasm','@tschk/moonshine-framework']) {
 assert.equal(existsSync('node_modules/'+name),false);
 assert.throws(()=>Bun.resolveSync(name,process.cwd()));
}
for(const [compat,native] of [[reactive,nativeReactive],[dom,nativeDOM],[control,nativeControl],[ssr,nativeSSR],[store,nativeStore]])
 for(const name of Object.keys(native)){if(compat===dom&&(name==='h'||name==='render')){assert.notEqual(compat[name],native[name],name);continue}if(compat===ssr&&name==='runWithOwner'){assert.equal(compat[name],solid[name]);continue}assert.equal(compat[name],native[name],name);}
assert.equal(h,namedH);assert.equal(h,dom.h);assert.notEqual(h,nativeDOM.h);
solid.createRoot(dispose=>{
 const owner=solid.getOwner();const [read,write]=solid.createSignal(0);let calls=0;
 const memo=ssr.createMemo(()=>{calls++;ssr.runWithOwner(owner,()=>read());return 0;});
 memo();write(1);memo();assert.equal(calls,1);dispose();
});
const cleanupOrder=[];const stopOrder=solid.createRoot(stop=>{solid.onCleanup(()=>cleanupOrder.push(1));solid.onCleanup(()=>cleanupOrder.push(2));return stop});stopOrder();assert.deepEqual(cleanupOrder,[2,1]);
assert.equal(typeof portal.h,'function');assert.equal(typeof portal.Portal,'function');
const unreadPortal={get mount(){throw Error('mount read')},get children(){throw Error('children read')}};
assert.equal(ssr.renderToString(()=>ssr.h(ssr.Portal,unreadPortal)),'');
assert.equal(ssr.renderToString(()=>portal.Portal(unreadPortal)),'');
assert.equal(solid.createResource,nativeResource.createResource);
assert.equal(solid.on,nativeReactive.on);
for(const name of ['renderCrepusNodeSolid','renderCrepusIrSolid','createBridgedSignal','fromMoonshineSignal','hydrateSolid'])assert.equal(typeof root[name],'function',name);
assert.equal(typeof root.solidRenderer.render,'function');
assert.throws(()=>root.hydrateSolid(()=>null,{},null),/hydration is not implemented/);
let stop;const seen=[];
solid.createRoot(dispose=>{
 stop=dispose;
 const [state,setState]=store.createStore({count:1,nested:{name:'first'}});
 solid.createComputed(solid.on(()=>state.count,(value)=>seen.push(value)));
 setState('count',2);setState(store.produce(draft=>{draft.count=3;}));
 setState(store.reconcile({count:4,nested:{name:'second'}}));
 assert.equal(state.nested.name,'second');assert.deepEqual(seen,[1,2,3,4]);
 const kernel=root.createMoonshineSignal(1);const [read,write]=root.fromMoonshineSignal(kernel);
 write(2);assert.equal(kernel(),2);kernel.set(3);assert.equal(read(),3);
 const [prop,setProp]=solid.createSignal('first');
 const props=solid.mergeProps({title:'default'},()=>({title:prop()}));
 const [local,rest]=solid.splitProps(props,['title']);
 assert.equal(local.title,'first');setProp(undefined);assert.equal(local.title,'default');assert.deepEqual(Object.keys(rest),[]);
 const [resource,actions]=solid.createResource(()=>7);
 assert.equal(resource(),7);assert.equal(resource.state,'ready');actions.mutate(8);assert.equal(resource.latest,8);
 const kernelResource=root.createResource(async()=>9,{immediate:false});assert.equal(kernelResource.status(),'pending');
 assert.equal(solid.createUniqueId(),'cl-0');assert.equal(solid.createUniqueId(),'cl-1');
 const [selected,setSelected]=solid.createSignal(1);const isSelected=solid.createSelector(selected);
 const selHits=[];solid.createComputed(()=>selHits.push('a:'+isSelected(1)));solid.createComputed(()=>selHits.push('b:'+isSelected(2)));
 setSelected(2);assert.deepEqual(selHits,['a:true','b:false','a:false','b:true']);
 const [rxVal,setRxVal]=solid.createSignal(10);let rxRuns=0;
 const track=solid.createReaction(()=>rxRuns++);track(()=>rxVal());setRxVal(20);setRxVal(30);assert.equal(rxRuns,1);
 let renderEff=0;solid.createRenderEffect(()=>{renderEff=rxVal()});assert.equal(renderEff,30);
 const mirrored=solid.from(solid.observable(rxVal));assert.equal(mirrored(),30);setRxVal(40);assert.equal(mirrored(),40);
});
stop();
const web=await import('@tschk/moonshine-solid/web');
assert.equal(web.isServer,false);assert.equal(web.isDev,false);assert.equal(web.NoHydration({children:'ok'}),'ok');
assert.equal(ssr.renderToString(()=>ssr.h('div',{id:ssr.createUniqueId()},[String(ssr.createSelector(()=>2)(2)),ssr.Show({when:'!',keyed:true,children:v=>v}),ssr.Suspense({fallback:'?',children:'ok'})])),'<div id="cl-0">true!ok</div>');
assert.equal(ssr.renderToString(()=>ssr.renderCrepusIrSolid({version:1,root:[{kind:'text',content:'<native>&'}]})),'<div data-crepus-root="true" data-crepus-target="solid" data-crepus-ir-version="1"><span>&lt;native&gt;&amp;</span></div>');
`);
});

test("optional framework facade renders SSR, API and SPA without host packages", async () => {
  await standalone(
    `
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {solidRenderer} from '@tschk/moonshine-solid';
import {createNativeRenderer} from '@tschk/moonshine-solid/framework-native';
import {createNativeRenderer as nativeFactory} from '@tschk/moonshine-dom/framework-native';
assert.equal(createNativeRenderer,nativeFactory);
const page=join(process.cwd(),'page.ts');
await writeFile(page,\`import {h} from '@tschk/moonshine-solid/ssr';
export const metadata={title:'native title',description:'safe<&'};
export default function Page({data}){return h('p',null,data.name);}\`);
const context={request:new Request('https://example.com/'),route:{id:'home',path:'/',file:page,mode:'ssr',runtime:'bun',decision:'standalone',clientEntries:[]},params:{},data:{name:'<alice>&'},signal:new AbortController().signal};
const response=await solidRenderer.render(context);assert.equal(response.status,200);
const html=await response.text();assert.ok(html.includes('<title>native title</title>'));assert.ok(html.includes('<p>&lt;alice&gt;&amp;</p>'));assert.ok(html.includes('content="safe&lt;&amp;"'));
const api=await solidRenderer.render({...context,route:{...context.route,mode:'api'}});assert.match(api.headers.get('content-type'),/application\\/json/);assert.deepEqual(await api.json(),context.data);
const spa=await solidRenderer.prerender({...context,route:{...context.route,id:'counter',file:'missing-server-page.ts',mode:'spa',clientEntries:['/client.js']},params:{id:'2'},data:{name:'</script>'}});
assert.ok(spa.includes('data-moonshine-app="counter"'));assert.ok(spa.includes('src="/client.js"'));
const payload=spa.match(/data-moonshine-props>(.*?)<\\/script>/s)[1];assert.ok(!payload.includes('<'));assert.deepEqual(JSON.parse(payload),{params:{id:'2'},data:{name:'</script>'}});
`,
    true,
  );
});

test("context providers render independently without a Solid host", async () => {
  await standalone(`
    import {createContext,useContext} from '@tschk/moonshine-solid/solid';
    import {h,renderToString} from '@tschk/moonshine-dom/ssr';
    const Context=createContext('default');
    const App=()=>h(Context.Provider,{value:'native',get children(){return h('p',null,useContext(Context))}});
    if(renderToString(()=>h(App,{}))!=='<p>native</p>')throw Error('provider context lost');
    if(useContext(Context)!=='default')throw Error('provider leaked');
    try{Bun.resolveSync('solid-js',process.cwd());throw Error('host unexpectedly resolves')}catch(error){if(!String(error).includes('Cannot find'))throw error}
  `);
});

test("lazy loading shares one module and owns instances without host packages", async () => {
  await standalone(`
import assert from 'node:assert/strict';
import {createRoot,createSignal,onCleanup,lazy} from '@tschk/moonshine-solid/solid';
for(const name of ['solid-js','react','react-dom','@tschk/crepuscularity-wasm'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
let resolve,loads=0;const setups=[],cleaned=[];
const Lazy=lazy(()=>{loads++;return new Promise(done=>resolve=done)});
const promise=Lazy.preload();assert.equal(Lazy.preload(),promise);
const [label,setLabel]=createSignal('before');const views=[],stops=[];
for(const id of ['one','two','canceled'])createRoot(stop=>{stops.push(stop);views.push(Lazy({id,get label(){return label()}}))});
assert.deepEqual(views.map(read=>read()),['','','']);stops[2]();
resolve({default:props=>{setups.push(props.id);onCleanup(()=>cleaned.push(props.id));return()=>props.id+':'+props.label}});
await promise;await new Promise(done=>setTimeout(done,0));
assert.equal(loads,1);assert.deepEqual(setups,['one','two']);assert.equal(views[0]()(),'one:before');assert.equal(views[1]()(),'two:before');
setLabel('after');assert.equal(views[0]()(),'one:after');assert.equal(views[1]()(),'two:after');
stops[0]();stops[1]();setLabel('late');assert.deepEqual(cleaned,['one','two']);assert.equal(Lazy.preload(),promise);
`);
});

test("optional dynamic factories bundle independently for browser and SSR", async () => {
  await standalone(`
import assert from 'node:assert/strict';
await Bun.write('dynamic-browser.ts',"export {Dynamic,createDynamic} from '@tschk/moonshine-solid/dynamic'");
const browser=await Bun.build({entrypoints:['./dynamic-browser.ts'],target:'browser',minify:true,plugins:[{name:'no-server',setup(build){build.onLoad({filter:/moonshine-dom\\/src\\/ssr\\.ts$/},()=>{throw Error('browser imported SSR serializer')})}}]});
assert.ok(browser.success);assert.ok(browser.outputs.length);
await Bun.write('dynamic-server.ts',\`import assert from 'node:assert/strict';import{Dynamic,createDynamic,h,renderToString}from'@tschk/moonshine-solid/ssr';assert.equal(typeof document,'undefined');for(let request=0;request<2;request++){let reads=0;assert.equal(renderToString(()=>createDynamic(()=>{reads++;return(props)=>h('p',null,props.label)},{label:'<&'})),'<p>&lt;&amp;</p>');assert.equal(reads,1);assert.equal(renderToString(()=>Dynamic({component:undefined})),'')}console.log('dynamic SSR standalone PASS');\`);
const server=await Bun.build({entrypoints:['./dynamic-server.ts'],target:'bun',minify:true,plugins:[{name:'no-browser',setup(build){build.onLoad({filter:/moonshine-dom\\/src\\/dom\\.ts$/},()=>{throw Error('SSR imported browser factory')})}}]});
assert.ok(server.success);await Bun.write('dynamic-server.js',await server.outputs[0].text());
const child=Bun.spawn([process.execPath,'--no-install','dynamic-server.js'],{stdout:'pipe',stderr:'pipe'});const error=await new Response(child.stderr).text();assert.equal(await child.exited,0,error);assert.equal(error,'');
for(const name of ['solid-js','react','react-dom','@tschk/moonshine-framework'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
`);
});

test("server resources stay host-free in fresh Bun and minified Node", async () => {
  const program = `import assert from 'node:assert/strict';
import {createResource,h,renderToString} from '@tschk/moonshine-solid/ssr';
import {createResource as clientResource} from '@tschk/moonshine-dom/resource';
assert.equal(typeof document,'undefined');
for(const host of ['solid-js','react','@tschk/crepuscularity-wasm'])assert.throws(()=>import.meta.resolve(host));
let fetched=0;
for(let request=0;request<3;request++)assert.equal(renderToString(()=>h(()=>{
 const [read,actions]=createResource(()=>true,()=>{fetched++;return 'fetched'},{initialValue:'seed'});
 assert.equal(actions.refetch(),true);assert.equal(read.state,'ready');
 assert.equal(actions.mutate('changed'),'changed');assert.equal(read.latest,'changed');
 assert.throws(()=>clientResource(()=>{fetched++;return 'client'}),/Client createResource/);
 return h('p',null,[read.state,read.loading,read()].join(':'));
},{})),'<p>ready:true:changed</p>');
assert.equal(fetched,0);
assert.throws(()=>createResource(()=>''),/active SSR/);
console.log('server resources standalone PASS');`;
  await standalone(`
import assert from 'node:assert/strict';
await Bun.write('resource-server.ts',${JSON.stringify(program)});
const build=await Bun.build({entrypoints:['./resource-server.ts'],target:'node',minify:true,metafile:true});
assert.ok(build.success,JSON.stringify(build.logs));
assert.ok(!Object.keys(build.metafile.inputs).some(path=>/node_modules\\/(solid-js|react|react-dom)\\//.test(path)||/crepuscularity-wasm|\\.wasm$/.test(path)));
await Bun.write('resource-server.mjs',build.outputs[0]);
for(const command of [['bun','resource-server.ts'],['node','resource-server.mjs']]){
 const child=Bun.spawn(command,{stdout:'pipe',stderr:'pipe'});
 const [output,error,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 assert.equal(code,0,output+error);assert.equal(error,'');assert.ok(output.includes('standalone PASS'));
}
`);
});
