import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function standalone(script: string, framework = false) {
  const root = join(import.meta.dir, "..");
  const dir = await mkdtemp(join(tmpdir(), "moonshine-astro-independent-"));
  try {
    for (const [name, source] of [
      ["moonshine", join(root, "../core")],
      ["moonshine-dom", join(root, "../dom")],
      ["moonshine-astro", root],
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

test("root bridges load without hosts, React, parser WASM or the optional framework", async () => {
  const pkg = await Bun.file(join(import.meta.dir, "../package.json")).json();
  expect(Object.keys(pkg.dependencies).toSorted()).toEqual([
    "@tschk/moonshine",
    "@tschk/moonshine-dom",
  ]);
  expect(pkg.peerDependenciesMeta["@tschk/moonshine-framework"]).toEqual({
    optional: true,
  });
  await standalone(`
    import assert from 'node:assert/strict';
    import * as root from '@tschk/moonshine-astro';
    for(const name of ['@angular/core','@angular/common','astro','nuxt','vue','react','react-dom','@tschk/crepuscularity-wasm','@tschk/crepus-moonshine','@tschk/moonshine-framework'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
    const entry=process.cwd()+'/bridge.ts';
    await Bun.write(entry,"export {createBridgedReadable} from '@tschk/moonshine-astro';");
    for(const target of ['browser','bun','node']){
      const built=await Bun.build({entrypoints:[entry],target,minify:true});
      assert.equal(built.success,true,String(built.logs));
      const source=await built.outputs[0].text();
      for(const forbidden of ['framework-source','@tschk/moonshine-framework','react-dom','@tschk/crepus','Server children'])assert.ok(!source.includes(forbidden),target+': '+forbidden);
    }
    assert.equal(root.crepusRenderer.name,'crepus');
    assert.equal(typeof root.crepusRenderer.render,'function');
    const value=root.createBridgedReadable(1),seen=[];const stop=value.subscribe(n=>seen.push(n));assert.equal(value.get(),1);stop();assert.deepEqual(seen,[1]);
  `);
});

test("optional framework renderer serves native SSR, API and SPA and rejects legacy React output", async () => {
  await standalone(
    `
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {crepusRenderer} from '@tschk/moonshine-astro';
for(const name of ['@angular/core','@angular/common','astro','nuxt','vue','svelte','react','react-dom','@tschk/crepuscularity-wasm','@tschk/crepus-moonshine'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
const page=join(process.cwd(),'page.ts');
await writeFile(page,\`import {h} from '@tschk/moonshine-dom/ssr';
export const metadata={title:'native <title>',description:'safe<&'};
export default function Page({data}){return h('p',null,data.name);}\`);
const context={request:new Request('https://example.com/'),route:{id:'home',path:'/',file:page,mode:'ssr',runtime:'bun',decision:'standalone',clientEntries:[]},params:{},data:{name:'<alice>&'},signal:new AbortController().signal};
const response=await crepusRenderer.render(context);assert.equal(response.status,200);
const html=await response.text();assert.ok(html.includes('<title>native &lt;title&gt;</title>'));assert.ok(html.includes('<p>&lt;alice&gt;&amp;</p>'));assert.ok(html.includes('content="safe&lt;&amp;"'));
const legacy=join(process.cwd(),'legacy.ts');
await writeFile(legacy,\`export default function Page(){return {$$typeof:Symbol.for('react.transitional.element'),type:'p',props:{children:'legacy'}}}\`);
await assert.rejects(()=>crepusRenderer.prerender({...context,route:{...context.route,file:legacy}}),/Server children must be text or factory HTML/);
const api=await crepusRenderer.render({...context,route:{...context.route,mode:'api'}});assert.ok(api.headers.get('content-type').includes('application/json'));assert.deepEqual(await api.json(),context.data);
const spa=await crepusRenderer.prerender({...context,route:{...context.route,id:'counter',file:'missing-server-page.ts',mode:'spa',clientEntries:['/client.js']},params:{id:'2'},data:{name:'</script>'}});
assert.ok(spa.includes('data-moonshine-app="counter"'));assert.ok(spa.includes('src="/client.js"'));
const payload=spa.split('data-moonshine-props>')[1].split('</script>')[0];assert.ok(!payload.includes('<'));assert.deepEqual(JSON.parse(payload),{params:{id:'2'},data:{name:'</script>'}});
`,
    true,
  );
});

test("native Astro SSR factories load without hosts, parser WASM or framework", async () => {
  await standalone(`
import assert from 'node:assert/strict';
import {h,renderToString,classList,sourceChild} from '@tschk/moonshine-astro/ssr';
for(const name of ['astro','react','react-dom','@tschk/crepuscularity-wasm','@tschk/moonshine-framework'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
assert.equal(renderToString(()=>h('p',{'data-ready':()=>true},sourceChild([true,false,0,'<&']))),'<p data-ready="true">true0&lt;&amp;</p>');
assert.equal(classList(['a',{active:true}]),'a active');
`);
});

const sourceCompiler = process.env.MOONSHINE_CREPUS_COMPILER;
test.skipIf(!sourceCompiler)(
  "authored Astro captures expressions and defers component bodies and slots",
  async () => {
    await standalone(`
import assert from 'node:assert/strict';
const compiler=${JSON.stringify(sourceCompiler)};
await Bun.write('source/state.ts',\`export const log:string[]=[];
export const payload={value:'same'};
export const record=(name:string)=>(log.push(name),name);
export function callback(){return record('callback');}\`);
await Bun.write('source/Probe.astro',\`---
import {record,callback,payload} from './state';
interface Props {cb:typeof callback;data:typeof payload;value:string;children:string}
const {cb,data,value,children}=Astro.props;
if(children!=='ordinary prop')throw Error('children prop was overwritten');
if(cb!==callback||data!==payload)throw Error('prop identity');
record('probe');
const result=cb();
---
<strong data-value={value}>{result}</strong>\`);
await Bun.write('source/Page.astro',\`---
import Probe from './Probe.astro';
import {log,record,callback,payload} from './state';
log.length=0;
const items=['row'];
const first='prefix';
const second=false;
function missing():string[]|undefined{return undefined;}
const absent=missing();
let reads=0;
function next(){reads++;return 0;}
---
<section data-start={record('attribute')} data-callback={callback}>{record('text')}{record('branch') && <b>{record('branch-child')}</b>}<Probe cb={callback} data={payload} value={record('prop')} children="ordinary prop"/>{items.map(item => <i data-row={record(item+'-attribute')}>{record(item+'-child')}</i>)}{0 && <u/>}{first || second && <u/>}{absent?.map(item => <u>{item}</u>)}{first || items.map(item => <u>{item}</u>)}{next() && <u/>}<em>{reads}:{log.join('|')}</em></section><pre>
  x
</pre><textarea>
  y
</textarea><b>end</b> <i>space</i>\`);
await Bun.write('source/Punctuation.astro',\`---
interface Props {enabled:boolean}
const {enabled}=Astro.props;
const items=['a','b'];
---
<section>{enabled && <p>Don't: really? a && b .map(x)</p>}{enabled ? <b title="a>b?:}">Note: it's fine?</b> : <q>No: why?</q>}<ul>{items.map(item => <li>{item}'s: ready?</li>)}</ul></section>\`);
await Bun.write('source/Template.astro',${JSON.stringify('---\nconst value="v";\n---\n<p title={`a${`b}c${value}`}d`} data-literal="{unclosed">{`a${`b}c${value}`}d`}</p>')});
await Bun.write('source/Regex.astro',${JSON.stringify("---\nconst text=\"ab:c}\";\nlet n=6;\nconst items=['ab','zz'];\nconst absent=undefined as string[] | undefined;\n---\n<section>{(/a?b:c/.test(text) ? <br> : <input>)}<b>{n++ / 2}</b><em>{n}</em><i>{8 / /}/.source.length}</i><p title={/}/.source}>{`a${/}/.test(text) ? `b}c` : 'none'}d`}</p>{items?.map(item => /z{2}/.test(item) ? <u>{item}</u> : <s>{item}</s>)}{absent?.map(item => <q>{item}</q>)}{(()=>{if(true) /}/.test(text);return true;})() ? <input data-ok=\"yes\"> : <br>}</section>")});
await Bun.write('source/Classes.astro',${JSON.stringify("---\nconst log:string[]=[];\nfunction mark<T>(label:string,value:T):T{log.push(label);return value;}\nconst Card=(props:{class?:string})=>props.class;\nconst Empty=(props:{class?:string})=>Object.hasOwn(props,'class')?'present:'+String(props.class):'absent';\n---\n<section><p class:list={mark('list',['active',{on:true}])} id={mark('id','x')} class={mark('class','base')}/><p class=\"a&amp;b\" class:list={['c',false,null,undefined,0,{yes:true,no:false}]}/><p class={false} class:list={[]}/><p class={['a','b']} class:list={['b']}/><Card class:list={['child']} class=\"base\"/><Empty class:list={[]}/><Empty class=\"\" class:list={false}/><Empty class=\"\"/><em>{log.join('|')}</em></section>")});
await Bun.write('source/SourceSlots.astro',${JSON.stringify('---\nimport Middle from \'./SourceSlotMiddle.astro\';\nimport Layout from \'./SourceSlotLayout.astro\';\nimport Item from \'./SourceSlotItem.astro\';\n---\n<Middle children="ordinary child" slots="ordinary slots"><Item slot="title"/><i slot="title">named</i><p>body</p></Middle><Layout children="ordinary child" slots="ordinary slots"><Fragment slot="title"/><Fragment slot="default"/></Layout><Layout children="ordinary child" slots="ordinary slots"/>')});
await Bun.write('source/SourceSlotLayout.astro',${JSON.stringify("---\ninterface Props {children:string;slots:string}\nconst {children,slots}=Astro.props;\nif(children!=='ordinary child'||slots!=='ordinary slots')throw Error('slot channel leaked into props');\n---\n<header><slot name=\"title\">fallback title</slot></header><main><slot>fallback body</slot></main>")});
await Bun.write('source/SourceSlotMiddle.astro',${JSON.stringify('---\nimport Layout from \'./SourceSlotLayout.astro\';\ninterface Props {children:string;slots:string}\nconst {children,slots}=Astro.props;\n---\n<Layout children={children} slots={slots}><slot name="title" slot="title"/><slot/></Layout>')});
await Bun.write('source/SourceSlotItem.astro',${JSON.stringify("---\ninterface Props {slot:string}\nconst {slot}=Astro.props;\n---\n<b>{slot}</b>")});
for(const [entry,out] of [['Page.astro','out'],['Punctuation.astro','punctuation-out'],['Template.astro','template-out'],['Regex.astro','regex-out'],['Classes.astro','classes-out'],['SourceSlots.astro','slots-out']]){
const built=Bun.spawn([compiler,'web','build','--emit','moonshine-ssr','--site','source','--entry',entry,'--out-dir',out],{stdout:'pipe',stderr:'pipe'});
const [stdout,stderr,code]=await Promise.all([new Response(built.stdout).text(),new Response(built.stderr).text(),built.exited]);
assert.equal(code,0,stdout+stderr);
}
await Bun.write('check.ts',\`import assert from 'node:assert/strict';
import Page from './out/CrepusEmit.moonshine-ssr.ts';
import {log as pageLog} from './out/modules/moonshine-ssr/state.ts';
import Punctuation from './punctuation-out/CrepusEmit.moonshine-ssr.ts';
import Template from './template-out/CrepusEmit.moonshine-ssr.ts';
import Regex from './regex-out/CrepusEmit.moonshine-ssr.ts';
import Classes from './classes-out/CrepusEmit.moonshine-ssr.ts';
import SourceSlots from './slots-out/CrepusEmit.moonshine-ssr.ts';
import{h,renderToString}from'@tschk/moonshine-astro/ssr';
assert.equal(renderToString(()=>h(Template,{})),'<p title="ab}cvd" data-literal="{unclosed">ab}cvd</p>');
assert.equal(renderToString(()=>h(SourceSlots,{})),'<header><b>title</b><i>named</i></header><main><p>body</p></main><header></header><main></main><header>fallback title</header><main>fallback body</main>');
assert.equal(renderToString(()=>h(Classes,{})),'<section><p class="base active on" id="x"></p><p class="a&amp;b c yes"></p><p></p><p class="a b b"></p>base childabsentabsentpresent:<em>class|list|id</em></section>');
assert.equal(renderToString(()=>h(Regex,{})),'<section><br><b>3</b><em>7</em><i>8</i><p title="}">ab}cd</p><s>ab</s><u>zz</u><input data-ok="yes"></section>');
for(const enabled of [true,false]){
const html=renderToString(()=>h(Punctuation,{enabled}));
assert.ok(html.includes(enabled?'<p>Don&#39;t: really? a &amp;&amp; b .map(x)</p>':'<q>No: why?</q>'),html);
assert.ok(html.includes('<li>a&#39;s: ready?</li><li>b&#39;s: ready?</li>'),html);
if(enabled)assert.ok(html.includes('title="a&gt;b?:}"'),html);
}
const newline=String.fromCharCode(10);
const whitespace='<pre>'+newline+'  x'+newline+'</pre><textarea>'+newline+'  y'+newline+'</textarea><b>end</b> <i>space</i>';
const expected='<section data-start="attribute">text<b>branch-child</b><strong data-value="prop">callback</strong><i data-row="row-attribute">row-child</i>0prefixprefix0<em>1:attribute|text|branch|branch-child|prop|row-attribute|row-child</em></section>'+whitespace;
for(let request=0;request<2;request++){const html=renderToString(()=>h(Page,{}));assert.ok(html.includes(' data-callback='));assert.equal(html.replace(/ data-callback="[^"]*"/,''),expected);assert.deepEqual(pageLog,['attribute','text','branch','branch-child','prop','row-attribute','row-child','probe','callback']);}\`);
await import(process.cwd()+'/check.ts');
const bundle=await Bun.build({entrypoints:['check.ts'],target:'node',outdir:'dist',metafile:true,minify:true});
assert.ok(bundle.success,String(bundle.logs));
assert.ok(!Object.keys(bundle.metafile.inputs).some(path=>/node_modules\\/(@astrojs|astro|react|react-dom|solid-js|svelte)\\//.test(path)||path.endsWith('.wasm')));
const node=Bun.spawn(['node','dist/check.js'],{stdout:'pipe',stderr:'pipe'});
const [nodeOut,nodeErr,nodeCode]=await Promise.all([new Response(node.stdout).text(),new Response(node.stderr).text(),node.exited]);
assert.equal(nodeCode,0,nodeOut+nodeErr);
`);
  },
);
