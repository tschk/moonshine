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
await Bun.write('source/SourceSlots.astro',${JSON.stringify('---\nimport Middle from \'./SourceSlotMiddle.astro\';\nimport Layout from \'./SourceSlotLayout.astro\';\nimport Item from \'./SourceSlotItem.astro\';\n---\n<Middle {...{children:"ordinary child",slots:"ordinary slots"}}><Item slot="title"/><i slot="title">named</i><p>body</p></Middle><Layout children="ordinary child" slots="ordinary slots"><Fragment slot="title"/><Fragment slot="default"/></Layout><Layout children="ordinary child" slots="ordinary slots"/>')});
await Bun.write('source/SourceSlotLayout.astro',${JSON.stringify("---\ninterface Props {children:string;slots:string}\nconst {children,slots}=Astro.props;\nif(children!=='ordinary child'||slots!=='ordinary slots')throw Error('slot channel leaked into props');\n---\n<header data-present={String(Astro.slots.has('title'))}><slot name=\"title\">fallback title</slot></header><main data-present={String(Astro.slots.has('default'))}><slot>fallback body</slot></main>")});
await Bun.write('source/SourceSlotMiddle.astro',${JSON.stringify('---\nimport Layout from \'./SourceSlotLayout.astro\';\ninterface Props {children:string;slots:string}\nconst {children,slots}=Astro.props;\n---\n<Layout {...Astro.props}><slot name="title" slot="title"/><slot/></Layout>')});
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
assert.equal(renderToString(()=>h(SourceSlots,{})),'<header data-present="true"><b>title</b><i>named</i></header><main data-present="true"><p>body</p></main><header data-present="true"></header><main data-present="true"></main><header data-present="false">fallback title</header><main data-present="false">fallback body</main>');
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

test.skipIf(!sourceCompiler)(
  "authored intrinsic spreads preserve ordered attributes and coercion in Bun and Node",
  async () => {
    await standalone(`
import assert from 'node:assert/strict';
const compiler=${JSON.stringify(sourceCompiler)};
await Bun.write('source/Page.astro',${JSON.stringify("---\nconst trace:string[]=[];\nconst spread=Object.create({inherited:'no'});\nObject.defineProperty(spread,'title',{enumerable:true,get(){trace.push('get-title');return {toString(){trace.push('coerce-title');return 'spread<&';}};}});\nObject.defineProperty(spread,'data-get',{enumerable:true,get(){trace.push('get-data');return 'once';}});\nObject.defineProperty(spread,Symbol('ignored'),{enumerable:true,get(){throw Error('symbol getter');}});\nfunction end(){trace.push('end');return 'end';}\nfunction child(){trace.push('child');return 'text';}\nfunction datum(){throw Error('function invoked');}\nObject.defineProperty(datum,'toString',{value:()=> 'function-data'});\nconst rows=[{title:'row-1'},{title:'row-2'}];\n---\n<main>\n<div data-case=\"ordered\" title=\"first\" {...spread} title-last={end()}>{child()}</div>\n<input data-case=\"form\" disabled=\"false\" {...{checked:false,required:'false',value:'<&'}} />\n<custom-input data-case=\"custom\" {...{disabled:false,popover:false,hidden:true}} />\n<div data-case=\"classes\" class=\"authored\" {...{class:'spread','class:list':['list'],style:{backgroundColor:'red','--accent':1}}} class:list={['end']} />\n<div data-case=\"function\" {...{title:datum,onClick:datum}} />\n{rows.map(row => <p data-case=\"row\" {...row}>{row.title}</p>)}\n<div data-case=\"nullish\" {...null} {...undefined} {...{title:Astro.props.title}} />\n<form data-case=\"reset\"><input data-case=\"editable\" {...{value:'seed',name:'draft'}} /><button type=\"reset\">Reset</button></form>\n<output data-case=\"trace\">{trace.join('|')}</output>\n</main>\n")});
const child=Bun.spawn([compiler,'web','build','--emit','moonshine-ssr','--site','source','--entry','Page.astro','--out-dir','out'],{stdout:'pipe',stderr:'pipe'});
const [output,error,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);assert.equal(code,0,output+error);
await Bun.write('check.ts',${JSON.stringify("import assert from 'node:assert/strict';import Page from './out/CrepusEmit.moonshine-ssr.ts';import {h,renderToString} from '@tschk/moonshine-astro/ssr';for(const host of ['astro','react','react-dom','@tschk/crepuscularity-wasm'])assert.throws(()=>import.meta.resolve(host));for(let i=0;i<3;i++){const html=renderToString(()=>h(Page,{title:'request'}));assert.ok(html.includes('title=\"first\" title=\"spread&lt;&amp;\"'));assert.ok(html.includes('disabled=\"false\" required=\"\" value=\"&lt;&amp;\"'));assert.ok(html.includes('class=\"spread\" class=\"list\" style=\"background-color:red;--accent:1\" class=\"authored end\"'));assert.ok(html.includes('title=\"function-data\"'));assert.ok(html.includes('get-title|coerce-title|get-data|end|child'));assert.ok(!html.includes('onclick='));assert.ok(!html.includes('inherited='));assert.ok(html.includes('data-case=\"nullish\" title=\"request\"'));}assert.equal(typeof document,'undefined');")});
for(const command of [['bun','--no-install','check.ts'],['bun','build','check.ts','--target=node','--minify','--outfile=check.mjs'],['node','check.mjs']]){
 const proc=Bun.spawn(command,{stdout:'pipe',stderr:'pipe'});const [out,err,status]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);assert.equal(status,0,out+err);
}
`);
  },
);

test("native Astro actions, context, transitions, and content collections run and bundle without Astro host or framework", async () => {
  await standalone(`
import assert from 'node:assert/strict';
import { defineAction, ActionError, isActionError } from '@tschk/moonshine-astro/actions';
import { AstroCookies, withAstroContext, useAstro } from '@tschk/moonshine-astro/context';
import { fade, slide, createAnimationScope, transition } from '@tschk/moonshine-astro/transitions';
import { defineCollection, registerCollections, seedCollection, getCollection, getEntry, render, z } from '@tschk/moonshine-astro/content';
for (const name of ['astro', 'react', 'react-dom', '@tschk/crepuscularity-wasm', '@tschk/moonshine-framework']) {
  assert.throws(() => Bun.resolveSync(name, process.cwd()));
}
const action = defineAction({
  name: 'ping',
  input: z.object({ msg: z.string() }),
  handler: async (input, ctx) => {
    if (input.msg === 'fail') throw new ActionError({ code: 'BAD_REQUEST', message: 'bad' });
    return { echo: input.msg, url: ctx.url.pathname };
  },
});
const ok = await withAstroContext({ url: 'https://example.com/api' }, () => action({ msg: 'hi' }));
assert.deepEqual(ok, { data: { echo: 'hi', url: '/api' }, error: undefined });
const fail = await action({ msg: 'fail' });
assert.equal(isActionError(fail.error), true);
assert.equal(fail.error?.status, 400);
const cookies = new AstroCookies('sid=xyz');
assert.equal(cookies.get('sid')?.value, 'xyz');
const scope = createAnimationScope('card', fade({ duration: 120 }), 'astro-card-1');
assert.equal(scope.attributes['data-astro-transition-scope'], 'astro-card-1');
assert.ok(transition({ name: 'nav', animate: slide() })['data-astro-transition-scope'].startsWith('astro-nav-'));
registerCollections({
  docs: defineCollection({
    schema: z.object({ title: z.string(), order: z.number().default(1) }),
  }),
});
seedCollection('docs', [{ id: 'intro.md', data: { title: 'Intro' }, body: '# Intro\\n\\nWelcome.' }]);
const docs = await getCollection('docs');
assert.equal(docs.length, 1);
assert.equal(docs[0].data.order, 1);
const intro = await getEntry('docs', 'intro');
const rendered = await render(intro);
assert.equal(rendered.headings[0].slug, 'intro');
assert.ok(rendered.Content().includes('<h1 id="intro">Intro</h1>'));
const { defineMiddleware, sequence, createContext, trySerializeLocals } = await import('@tschk/moonshine-astro/middleware');
const { configureI18n, getRelativeLocaleUrl, getAbsoluteLocaleUrl } = await import('@tschk/moonshine-astro/i18n');
const { envField, validateEnv } = await import('@tschk/moonshine-astro/env');
configureI18n({ defaultLocale: 'en', locales: ['en', 'fr'], site: 'https://example.com' });
assert.equal(getRelativeLocaleUrl('fr', 'about'), '/fr/about');
assert.equal(getAbsoluteLocaleUrl('en', 'about'), 'https://example.com/about');
const mw = sequence(
  defineMiddleware(async (ctx, next) => {
    ctx.locals.role = 'admin';
    return next();
  }),
);
const mwCtx = createContext({ url: 'https://example.com/about' });
const mwRes = await mw(mwCtx, async () => new Response(trySerializeLocals(mwCtx.locals)));
assert.equal(await mwRes.text(), '{"role":"admin"}');
const env = validateEnv(
  { PORT: envField.number({ context: 'server', access: 'public', default: 3000 }) },
  {},
);
assert.equal(env.PORT, 3000);
const { getImage, inferImageDimensions } = await import('@tschk/moonshine-astro/assets');
const { paginate } = await import('@tschk/moonshine-astro/routing');
const img = await getImage({ src: { src: '/hero.png', width: 800, height: 400, format: 'png' }, width: 400, alt: 'Hero' });
assert.equal(img.attributes.width, 400);
assert.equal(img.attributes.height, 200);
const svgDims = inferImageDimensions(new TextEncoder().encode('<svg viewBox="0 0 64 32"></svg>'));
assert.deepEqual(svgDims, { width: 64, height: 32, format: 'svg' });
const paginated = paginate(['a', 'b', 'c'], { pageSize: 2 });
assert.equal(paginated.length, 2);
assert.equal(paginated[0].props.page.url.next, '/2');
const { glob, file } = await import('@tschk/moonshine-astro/loaders');
const { AstroContainer, experimental_AstroContainer } = await import('@tschk/moonshine-astro/container');
const { h: ssrH } = await import('@tschk/moonshine-astro/ssr');
assert.equal(experimental_AstroContainer, AstroContainer);
await Bun.write('content-dir/post.md', '---\\ntitle: From Glob\\n---\\n# Glob Heading\\n\\nBody.');
await Bun.write('data.json', JSON.stringify([{ id: 'one', label: 'First' }]));
registerCollections({
  blog: defineCollection({
    loader: glob({ pattern: '**/*.md', base: 'content-dir' }),
    schema: z.object({ title: z.string() }),
  }),
  items: defineCollection({
    loader: file('data.json'),
    schema: z.object({ id: z.string(), label: z.string() }),
  }),
});
const blogEntries = await getCollection('blog');
assert.equal(blogEntries.length, 1);
assert.equal(blogEntries[0].data.title, 'From Glob');
const itemOne = await getEntry('items', 'one');
assert.equal(itemOne?.data.label, 'First');
const container = await AstroContainer.create({ locals: { env: 'test' } });
const renderedStr = await container.renderToString((props) => ssrH('div', { 'data-env': useAstro().locals.env }, props.greeting), {
  props: { greeting: 'Hello Container' },
});
assert.equal(renderedStr, '<div data-env="test">Hello Container</div>');
`);
});

test.skipIf(!sourceCompiler)(
  "authored .astro virtual modules (astro:assets, astro:transitions, astro/config), <Astro.self>, and Astro.* request context compile and render via AstroContainer",
  async () => {
    const pageSource = `---
import { Image, Picture } from "astro:assets";
import { ClientRouter } from "astro:transitions";
import { defineConfig } from "astro/config";
import { defineAction } from "astro:actions";
interface Props {
  altText: string;
  depth?: number;
}
const { altText, depth = 0 } = Astro.props;
const path = Astro.url.pathname;
const routePattern = Astro.routePattern;
const slug = Astro.params.slug;
const session = Astro.cookies.get("session")?.value ?? "guest";
const role = Astro.locals.role;
const locale = Astro.currentLocale ?? "en";
const cfg = defineConfig({ base: "/docs" });
const pingAction = defineAction({ name: "ping", handler: () => "pong" });
Astro.session.set("visited", path);
const actionData = Astro.getActionResult("ping")?.data ?? "idle";
const hero = { src: "/hero.jpg", width: 800, height: 400, format: "jpg" as const };
---
<head><ClientRouter fallback="swap" /></head>
<main data-path={path} data-route={routePattern} data-base={cfg.base} data-action={actionData} data-depth={depth} data-slug={slug} data-session={session} data-role={role} data-locale={locale}>
  <Image src={hero} width={400} alt={altText} priority />
  <Picture src={hero} width={400} formats={["avif", "webp"]} alt={altText} />
  {depth > 0 && <Astro.self altText={altText} depth={depth - 1} />}
  {Boolean(pingAction) && ""}
</main>
`;
    await standalone(`
import assert from 'node:assert/strict';
const compiler = ${JSON.stringify(sourceCompiler)};
await Bun.write('source/Page.astro', ${JSON.stringify(pageSource)});
const proc = Bun.spawn([compiler, 'web', 'build', '--emit', 'moonshine-ssr', '--site', 'source', '--entry', 'Page.astro', '--out-dir', 'out'], { stdout: 'pipe', stderr: 'pipe' });
const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
assert.equal(code, 0, out + err);
const { default: Page } = await import(process.cwd() + '/out/CrepusEmit.moonshine-ssr.ts');
const { AstroContainer } = await import('@tschk/moonshine-astro/container');
const { recordAstroActionResult, useAstro } = await import('@tschk/moonshine-astro/context');
const container = await AstroContainer.create({ locals: { role: 'editor' } });
const html = await container.renderToString(
  (props) => {
    recordAstroActionResult('ping', { data: 'done', error: undefined }, useAstro());
    return Page(props);
  },
  {
    request: new Request('https://example.com/blog/hello', { headers: { cookie: 'session=abc123' } }),
    routePattern: '/blog/[slug]',
    params: { slug: 'hello' },
    props: { altText: 'Banner', depth: 1 },
  },
);
assert.ok(html.includes('name="astro-view-transitions-fallback" content="swap"'), html);
assert.ok(html.includes('data-path="/blog/hello"'), html);
assert.ok(html.includes('data-route="/blog/[slug]"'), html);
assert.ok(html.includes('data-base="/docs"'), html);
assert.ok(html.includes('data-action="done"'), html);
assert.ok(html.includes('data-depth="1"'), html);
assert.ok(html.includes('data-depth="0"'), html);
assert.ok(html.includes('data-slug="hello"'), html);
assert.ok(html.includes('data-session="abc123"'), html);
assert.ok(html.includes('data-role="editor"'), html);
assert.ok(html.includes('alt="Banner"'), html);
assert.ok(html.includes('type="image/avif"'), html);
assert.ok(html.includes('fetchpriority="high"'), html);
`);
  },
);

test.skipIf(!sourceCompiler)(
  "authored .astro <Component server:defer> Server Islands, astro:prefetch, astro:schema, and astro/zod compile and resolve in eager and deferred modes",
  async () => {
    const userBadgeSource = `---
interface Props {
  userId: string;
}
const { userId } = Astro.props;
const role = Astro.locals.role ?? "guest";
---
<div class="user-badge" data-user={userId} data-role={role}><slot>Default Badge</slot></div>
`;
    const pageSource = `---
import UserBadge from "./UserBadge.astro";
import { prefetch, getPrefetchedUrls, clearPrefetchedUrls } from "astro:prefetch";
import { z } from "astro:schema";
import { z as zodAlias } from "astro/zod";
clearPrefetchedUrls();
prefetch("/account");
const prefetchedCount = getPrefetchedUrls().length;
const parsed = z.string().parse("verified");
const numParsed = zodAlias.number().parse(42);
---
<section data-prefetched={prefetchedCount} data-parsed={parsed} data-num={numParsed}>
  <UserBadge server:defer userId="u-100">
    <strong>Pro Member</strong>
    <span slot="fallback" class="island-fallback">Loading user...</span>
  </UserBadge>
</section>
`;
    await standalone(`
import assert from 'node:assert/strict';
const compiler = ${JSON.stringify(sourceCompiler)};
await Bun.write('source/UserBadge.astro', ${JSON.stringify(userBadgeSource)});
await Bun.write('source/Page.astro', ${JSON.stringify(pageSource)});
const proc = Bun.spawn([compiler, 'web', 'build', '--emit', 'moonshine-ssr', '--site', 'source', '--entry', 'Page.astro', '--out-dir', 'out'], { stdout: 'pipe', stderr: 'pipe' });
const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
assert.equal(code, 0, out + err);
const { default: Page } = await import(process.cwd() + '/out/CrepusEmit.moonshine-ssr.ts');
const { h, renderToString, withAstroContext } = await import('@tschk/moonshine-astro/ssr');

// Eager mode renders UserBadge immediately without the fallback slot
const eagerHtml = withAstroContext({ locals: { role: 'admin' } }, (astro) => {
  const rendered = renderToString(() => h(Page, {}));
  assert.equal(astro.serverIslands.length, 1);
  assert.equal(astro.serverIslands[0].componentName, 'UserBadge');
  assert.equal(astro.serverIslands[0].hasFallback, true);
  return rendered;
});
assert.ok(eagerHtml.includes('data-prefetched="1" data-parsed="verified" data-num="42"'), eagerHtml);
assert.ok(eagerHtml.includes('<div class="user-badge" data-user="u-100" data-role="admin"><strong>Pro Member</strong></div>'), eagerHtml);
assert.ok(!eagerHtml.includes('Loading user...'), eagerHtml);

// Deferred mode renders <astro-server-island> fallback shell, then resolves island on demand
withAstroContext({ locals: { role: 'owner' }, deferServerIslands: true }, (astro) => {
  const shellHtml = renderToString(() => h(Page, {}));
  assert.ok(shellHtml.includes('<astro-server-island data-island-id="island-1" data-component="UserBadge"><span class="island-fallback">Loading user...</span></astro-server-island>'), shellHtml);
  const resolved = astro.resolveAllServerIslands(shellHtml);
  assert.ok(resolved.includes('<div class="user-badge" data-user="u-100" data-role="owner"><strong>Pro Member</strong></div>'), resolved);
  assert.ok(!resolved.includes('astro-server-island'), resolved);
});
`);
  },
);

test.skipIf(!sourceCompiler)(
  "authored .astro define:vars and transition:name/animate/persist/persist-props directives compile and render CSS custom properties and View Transition attributes",
  async () => {
    const heroSource = `---
import { fade } from "astro:transitions";
const primaryColor = "crimson";
const spacing = "2rem";
const fadeAnim = fade({ duration: "250ms" });
---
<header
  style="display:flex"
  define:vars={{ primaryColor, spacing }}
  transition:name="site-header"
  transition:animate={fadeAnim}
>
  <video transition:persist="media-player" transition:persist-props src="/intro.mp4"></video>
</header>
`;
    await standalone(`
import assert from 'node:assert/strict';
const compiler = ${JSON.stringify(sourceCompiler)};
await Bun.write('source/Hero.astro', ${JSON.stringify(heroSource)});
const proc = Bun.spawn([compiler, 'web', 'build', '--emit', 'moonshine-ssr', '--site', 'source', '--entry', 'Hero.astro', '--out-dir', 'out'], { stdout: 'pipe', stderr: 'pipe' });
const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
assert.equal(code, 0, out + err);
const { default: Hero } = await import(process.cwd() + '/out/CrepusEmit.moonshine-ssr.ts');
const { h, renderToString } = await import('@tschk/moonshine-astro/ssr');
const html = renderToString(() => h(Hero, {}));
assert.ok(html.includes('style="display:flex;--primaryColor:crimson;--spacing:2rem;view-transition-name:site-header"'), html);
assert.ok(html.includes('data-astro-transition-scope="fade"'), html);
assert.ok(html.includes('data-astro-transition-persist="media-player"'), html);
assert.ok(html.includes('data-astro-transition-persist-props=""'), html);
`);
  },
);

test.skipIf(!sourceCompiler)(
  "authored .astro Astro.slots.render(name, args?), is:raw directive, and <Fragment> slot/content directives compile and render via AstroContainer",
  async () => {
    const cardSource = `---
const hasHeader = Astro.slots.has("header");
const headerHtml = hasHeader ? Astro.slots.render("header") : "";
const rowHtml = Astro.slots.has("row") ? Astro.slots.render("row", ["Ada", 1]) : "";
const defaultHtml = Astro.slots.render("default");
---
<article class="card">
  {hasHeader && <header class="card-header" set:html={headerHtml.toUpperCase()} />}
  {rowHtml && <ul class="card-rows" set:html={rowHtml} />}
  <div class="card-body" set:html={defaultHtml} />
  <code is:raw class="raw-snippet">{unparsed} &amp; <span>{literal}</span></code>
  <Fragment is:raw><pre class="raw-frag">{rawFrag}</pre></Fragment>
</article>
`;
    const pageSource = `---
import Card from "./Card.astro";
const badgeMarkup = "<em>Rich Slot</em>";
---
<Card>
  <Fragment slot="header" set:html={badgeMarkup} />
  <p>Default slot paragraph</p>
</Card>
`;
    await standalone(`
import assert from 'node:assert/strict';
const compiler = ${JSON.stringify(sourceCompiler)};
await Bun.write('source/Card.astro', ${JSON.stringify(cardSource)});
await Bun.write('source/Page.astro', ${JSON.stringify(pageSource)});
for (const [entry, out] of [['Card.astro', 'card-out'], ['Page.astro', 'page-out']]) {
  const proc = Bun.spawn([compiler, 'web', 'build', '--emit', 'moonshine-ssr', '--site', 'source', '--entry', entry, '--out-dir', out], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  assert.equal(code, 0, stdout + stderr);
}
const { default: Card } = await import(process.cwd() + '/card-out/CrepusEmit.moonshine-ssr.ts');
const { default: Page } = await import(process.cwd() + '/page-out/CrepusEmit.moonshine-ssr.ts');
const { AstroContainer } = await import('@tschk/moonshine-astro/container');
const { h, renderToString } = await import('@tschk/moonshine-astro/ssr');

const pageHtml = renderToString(() => h(Page, {}));
assert.ok(pageHtml.includes('<header class="card-header"><EM>RICH SLOT</EM></header>'), pageHtml);
assert.ok(pageHtml.includes('<div class="card-body"><p>Default slot paragraph</p></div>'), pageHtml);
assert.ok(pageHtml.includes('<code class="raw-snippet">{unparsed} &amp; <span>{literal}</span></code>'), pageHtml);
assert.ok(pageHtml.includes('<pre class="raw-frag">{rawFrag}</pre>'), pageHtml);

const container = await AstroContainer.create();
const cardHtml = await container.renderToString(Card, {
  slots: {
    header: '<span>Custom</span>',
    row: (name: unknown, idx: unknown) => \`<li data-idx="\${idx}">\${name}</li>\`,
    default: '<b>Body</b>',
  },
});
assert.ok(cardHtml.includes('<header class="card-header"><SPAN>CUSTOM</SPAN></header>'), cardHtml);
assert.ok(cardHtml.includes('<ul class="card-rows"><li data-idx="1">Ada</li></ul>'), cardHtml);
assert.ok(cardHtml.includes('<div class="card-body"><b>Body</b></div>'), cardHtml);
`);
  },
);
