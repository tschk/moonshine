import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function standalone(script: string, framework = false) {
  const root = join(import.meta.dir, "..");
  const dir = await mkdtemp(join(tmpdir(), "moonshine-vue-independent-"));
  try {
    for (const [name, source] of [
      ["moonshine", join(root, "../core")],
      ["moonshine-dom", join(root, "../dom")],
      ["moonshine-vue", root],
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
  "props-less setup components compile and render independently",
  async () => {
    const page = `<script setup lang="ts">
import {ref,computed,useId,onBeforeMount,onErrorCaptured} from 'vue';
import Child from './Child.vue';
import SetChild from './SetChild.vue';
import ModelChild from './ModelChild.vue';
import DefineModelChild from './DefineModelChild.vue';
const selected=ref(new Set(['x']));
const entries=ref(new Map([['x',7]]));
const count=ref(2);
const label=ref('label');
const id=useId();
const doubled=computed(()=>count.value*2);
onBeforeMount(()=>{count.value+=10;});
onErrorCaptured(()=>false);
function increment(){count.value++;}
</script><template><div :id="id"><button @click="increment">{{count}}/{{doubled}}</button><input type="number" v-model.number="count"/><input type="checkbox" v-model="selected" value="missing"/><input type="radio" v-model="count" :value="2"/><select v-model="count"><option :value="2">two</option><option :value="3">three</option></select><Child/><SetChild :values="selected" :entries="entries"/><ModelChild v-model="count" v-model:label.trim="label"/><DefineModelChild v-model.trim="label" active/><output>{{count}}/{{label}}</output></div></template>`;
    const child = `<script setup>import {useId} from 'vue';const id=useId();const label='<b>&';</script><template><p :id="id">{{label}}</p></template>`;
    const setChild = `<script setup lang="ts">const props=defineProps<{values:Set<string>;entries:Map<string,number>}>();</script><template><em>{{props.values.size}}/{{props.entries.get('x')}}</em></template>`;
    const modelChild = `<script setup lang="ts">const props=defineProps<{modelValue:number;label:string}>();const emit=defineEmits<{'update:modelValue':[number];'update:label':[string]}>();if(typeof document==='undefined'){emit('update:modelValue',props.modelValue+1);emit('update:label',' '+props.label+'-ssr ');}</script><template><strong>{{props.modelValue}}/{{props.label}}</strong></template>`;
    const defineModelChild = `<script setup lang="ts">const [model,mods]=defineModel<string,'trim'>({default:'fallback',get:(v)=>mods.trim?v.trim():v});const active=defineModel<boolean>('active',{default:false});if(typeof document==='undefined'){model.value=' '+model.value+'-dm ';}</script><template><kbd>{{model}}/{{active}}</kbd></template>`;
    const check = `import assert from 'node:assert/strict';
import Page from './ssr/CrepusEmit.moonshine-ssr.ts';
import {h,renderToString} from '@tschk/moonshine-dom/ssr';
assert.equal(typeof document,'undefined');
for(let request=0;request<3;request++)assert.equal(renderToString(()=>h(Page,{})),'<div id="v-0"><button>2/4</button><input type="number" value="2"><input type="checkbox" value="missing" checked=""><input type="radio" value="2" checked=""><select><option value="2" selected="">two</option><option value="3">three</option></select><p id="v-1">&lt;b&gt;&amp;</p><em>1/7</em><strong>2/label</strong><kbd>label-ssr-dm/true</kbd><output>3/label-ssr-dm</output></div>');
assert.equal(typeof document,'undefined');`;
    await standalone(`
import assert from 'node:assert/strict';
const compiler=${JSON.stringify(sourceCompiler)};
async function compile(entry,target,out){
 const proc=Bun.spawn([compiler,'web','build','--site','source','--entry',entry,'--emit',target,'--out-dir',out],{stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,code]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);return {code,log:stdout+stderr};
}
await Bun.write('source/Page.vue',${JSON.stringify(page)});
await Bun.write('source/Child.vue',${JSON.stringify(child)});
await Bun.write('source/SetChild.vue',${JSON.stringify(setChild)});
await Bun.write('source/ModelChild.vue',${JSON.stringify(modelChild)});
await Bun.write('source/DefineModelChild.vue',${JSON.stringify(defineModelChild)});
for(const[target,out]of[['moonshine-dom','dom'],['moonshine-ssr','ssr']]){
 const result=await compile('Page.vue',target,out);assert.equal(result.code,0,result.log);
 const built=await Bun.build({entrypoints:[out+'/CrepusEmit.'+target+'.ts'],target:target==='moonshine-dom'?'browser':'node',metafile:true,minify:true});assert.ok(built.success,String(built.logs));
 assert.ok(!Object.keys(built.metafile.inputs).some(path=>['vue','svelte','solid-js','react','react-dom'].some(name=>path.includes('node_modules/'+name+'/'))||path.includes('node_modules/@vue/')||path.endsWith('.wasm')));
}
await Bun.write('check.ts',${JSON.stringify(check)});await import(process.cwd()+'/check.ts');
const built=await Bun.build({entrypoints:['check.ts'],target:'node',outdir:'dist',minify:true});assert.ok(built.success,String(built.logs));
const node=Bun.spawn(['node','dist/check.js'],{stdout:'pipe',stderr:'pipe'});const[out,err,code]=await Promise.all([new Response(node.stdout).text(),new Response(node.stderr).text(),node.exited]);assert.equal(code,0,out+err);
for(const body of ['defineExpose({}, {});','const props=defineProps();','await Promise.resolve();']){
 await Bun.write('source/Bad.vue','<script setup lang="ts">'+body+'</script><template><p>x</p></template>');
 for(const target of ['moonshine-dom','moonshine-ssr']){
  const entry='keep/CrepusEmit.'+target+'.ts';await Bun.write(entry,'preserve');const result=await compile('Bad.vue',target,'keep');assert.notEqual(result.code,0,result.log);assert.equal(await Bun.file(entry).text(),'preserve');
 }
}
`);
  },
);

test("native entries work without Vue, framework, React, Crepus or WASM installed", async () => {
  const pkg = await Bun.file(join(import.meta.dir, "../package.json")).json();
  expect(Object.keys(pkg.dependencies)).toEqual([
    "@tschk/moonshine",
    "@tschk/moonshine-dom",
  ]);
  expect(pkg.peerDependenciesMeta.vue.optional).toBe(true);
  expect(pkg.peerDependenciesMeta["@tschk/moonshine-framework"].optional).toBe(
    true,
  );
  for (const name of [
    "vue",
    "react",
    "react-dom",
    "@tschk/crepuscularity-wasm",
    "@tschk/crepus-moonshine",
    "@tschk/moonshine-framework",
  ])
    expect(pkg.dependencies).not.toHaveProperty(name);
  await standalone(`
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import * as root from '@tschk/moonshine-vue';
import {crepusRenderer} from '@tschk/moonshine-vue/framework';
import {ref,shallowRef,reactive,toRefs,proxyRefs,computed,watch,watchSyncEffect,useId as reactiveUseId} from '@tschk/moonshine-vue/reactive';
import {toDisplayString,toDisplayStringSSR} from '@tschk/moonshine-vue/text';
import {bindTextModel,createTextModel} from '@tschk/moonshine-vue/model';
import {createServerTextModel} from '@tschk/moonshine-vue/model/ssr';
import {withComponentErrorHandler} from '@tschk/moonshine-vue/errors';
import {createDefaultProps,createServerDefaultProps,withVueScheduler} from '@tschk/moonshine-vue/props';
import {provide,inject,hasInjectionContext,useId} from '@tschk/moonshine-vue/context';
import {onBeforeMount,onMounted,onBeforeUnmount,onUnmounted,onErrorCaptured} from '@tschk/moonshine-vue/lifecycle';
import {createRoot} from '@tschk/moonshine-dom/reactive';
import {h,renderToString} from '@tschk/moonshine-dom/ssr';
for(const name of ['vue','react','react-dom','@tschk/crepuscularity-wasm','@tschk/crepus-moonshine','@tschk/moonshine-framework']) {
 assert.equal(existsSync('node_modules/'+name),false);
 assert.throws(()=>Bun.resolveSync(name,process.cwd()));
}
for(const name of ['createBridgedRef','fromMoonshineSignal','createMoonshineSignal','createResource','createMsSignal','createMemo','batch','untrack'])assert.equal(typeof root[name],'function',name);
assert.equal(root.crepusRenderer,crepusRenderer);
assert.equal(typeof bindTextModel,'function');assert.equal(typeof createTextModel,'function');
assert.equal(renderToString(()=>createServerTextModel('input',{},()=>null)),'<input>');
assert.equal(toDisplayString(ref(false)),'false');
assert.equal(toDisplayString({toJSON:()=>undefined}),undefined);
assert.equal(renderToString(()=>h('p',{},toDisplayStringSSR({toJSON:()=>undefined}))),'<p>undefined</p>');
await Bun.write('bridge.ts',"export {createBridgedRef} from '@tschk/moonshine-vue';");
for(const target of ['browser','bun','node']){
 const built=await Bun.build({entrypoints:[process.cwd()+'/bridge.ts'],target,minify:true});
 assert.equal(built.success,true,String(built.logs));
 const output=await built.outputs[0].text();
 for(const forbidden of ['framework-source','@tschk/moonshine-framework','react-dom','@tschk/crepus','Server children'])assert.ok(!output.includes(forbidden),target+': '+forbidden);
}
const first=()=>1,second=()=>2;
const signal=root.createMoonshineSignal(first), bridge=root.fromMoonshineSignal(signal);
bridge.value=second;assert.equal(signal(),second);signal.set(()=>first);assert.equal(bridge.value,first);
assert.equal(root.createBridgedRef(first).value,first);
const count=ref(2), doubled=computed(()=>count.value*2), state=reactive({nested:{count}});
const values=[];let stop;
createRoot(dispose=>{stop=dispose;watch(doubled,value=>values.push(value),{flush:'sync',immediate:true})});
state.nested.count=3;assert.deepEqual(values,[4,6]);stop();count.value=4;assert.deepEqual(values,[4,6]);assert.equal(doubled.value,8);
const policyValue=ref(0),policyFailure={original:true},policyErrors=[];let stopPolicy,rejectPolicy;
createRoot(dispose=>{stopPolicy=dispose;withComponentErrorHandler((error,info)=>policyErrors.push([error,info.phase,info.component]),()=>watch(policyValue,()=>new Promise((_,reject)=>{rejectPolicy=reject}),{flush:'sync'}))});
policyValue.value=1;stopPolicy();rejectPolicy(policyFailure);await Promise.resolve();
assert.deepEqual(policyErrors,[[policyFailure,'watch callback',undefined]]);

const linked=toRefs(state);linked.nested.value.count=5;assert.equal(state.nested.count,5);
const proxiedRefs=proxyRefs({count});assert.equal(proxiedRefs.count,5);proxiedRefs.count=6;assert.equal(count.value,6);
const sync=ref(0), syncTrace=[];
const endSync=watchSyncEffect(clean=>{const value=sync.value;syncTrace.push(value);clean(()=>syncTrace.push('clean:'+value));});
sync.value=1;endSync();sync.value=2;assert.deepEqual(syncTrace,[0,'clean:0',1,'clean:1']);
const external={count:1},shallow=shallowRef(external);assert.equal(shallow.value,external);shallow.value=external;assert.equal(shallowRef(shallow),shallow);
const literal=ref(first);literal.value=second;assert.equal(literal.value,second);
assert.equal(renderToString(()=>h('p',null,'<native>&')),'<p>&lt;native&gt;&amp;</p>');
let defaultCalls=0;
createRoot(stop=>{withVueScheduler(()=>{const {props}=createDefaultProps({label:undefined},['label'],[],[['label',()=>{defaultCalls++;return '<default>'},true]]);assert.equal(props.label,'<default>')});stop()});
assert.equal(defaultCalls,1);
for(let request=0;request<2;request++)assert.equal(renderToString(()=>h(()=>withVueScheduler(()=>{const props=createServerDefaultProps({},['label'],[],[['label',()=>{defaultCalls++;return '<server>'},true]]);return h('p',null,props.label)}),null)),'<p>&lt;server&gt;</p>');
assert.equal(defaultCalls,3);
assert.equal(hasInjectionContext(),false);
assert.equal(reactiveUseId,useId);
let lifecycleCalls=0;
const capturedErrors=[];
assert.equal(renderToString(()=>h(()=>{onBeforeMount(()=>lifecycleCalls++);onMounted(()=>lifecycleCalls++);onBeforeUnmount(()=>lifecycleCalls++);onUnmounted(()=>lifecycleCalls++);onErrorCaptured((err,_inst,info)=>{capturedErrors.push([err.message,info]);return false;});return h(()=>{watchSyncEffect(()=>{throw new Error('ssr-boom');});return h('p',{id:useId()},'server');},null)},null)),'<p id="v-0">server</p>');
assert.equal(lifecycleCalls,0);
assert.deepEqual(capturedErrors,[['ssr-boom','watch effect']]);
assert.equal(renderToString(()=>h(()=>{provide('value','<context>');return h(()=>h('p',null,inject('value')),null)},null)),'<p>&lt;context&gt;</p>');
const reactiveMod=await import('@tschk/moonshine-vue/reactive');
assert.equal(reactiveMod.version,'3.5.13');
assert.equal(reactiveMod.mergeProps({class:'a'},{class:'b'}).class,'a b');
assert.equal(await reactiveMod.nextTick(()=>42),42);
`);
});

test("optional framework compatibility renderer serves native SSR, API and SPA", async () => {
  await standalone(
    `
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {crepusRenderer} from '@tschk/moonshine-vue';
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
