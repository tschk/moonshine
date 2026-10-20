import { expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function standalone(script: string, framework = false) {
  const root = join(import.meta.dir, "..");
  const dir = await mkdtemp(join(tmpdir(), "moonshine-angular-independent-"));
  try {
    for (const [name, source] of [
      ["moonshine", join(root, "../core")],
      ["moonshine-dom", join(root, "../dom")],
      ["moonshine-angular", root],
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
    import * as root from '@tschk/moonshine-angular';
    for(const name of ['@angular/core','@angular/common','astro','nuxt','vue','react','react-dom','@tschk/crepuscularity-wasm','@tschk/crepus-moonshine','@tschk/moonshine-framework'])assert.throws(()=>Bun.resolveSync(name,process.cwd()));
    const entry=process.cwd()+'/bridge.ts';
    await Bun.write(entry,"export {createBridgedSignal, signal, computed, linkedSignal, effect, untracked, isSignal, isWritableSignal, toObservable, toSignal, resource} from '@tschk/moonshine-angular';");
    for(const target of ['browser','bun','node']){
      const built=await Bun.build({entrypoints:[entry],target,minify:true});
      assert.equal(built.success,true,String(built.logs));
      const source=await built.outputs[0].text();
      for(const forbidden of ['framework-source','@tschk/moonshine-framework','react-dom','@tschk/crepus','Server children'])assert.ok(!source.includes(forbidden),target+': '+forbidden);
    }
    assert.equal(root.crepusRenderer.name,'crepus');
    assert.equal(typeof root.crepusRenderer.render,'function');
    const value=root.createBridgedSignal(1);value.set(2);value.update(n=>n+1);assert.equal(value(),3);
    const count=root.signal(2);
    const doubled=root.computed(()=>count()*2);
    const linked=root.linkedSignal(()=>doubled()+1);
    assert.equal(root.isSignal(count),true);
    assert.equal(root.isWritableSignal(count),true);
    assert.equal(root.isSignal(doubled),true);
    assert.equal(root.isWritableSignal(doubled),false);
    assert.equal(linked(),5);
    linked.set(99);
    assert.equal(linked(),99);
    count.set(4);
    assert.equal(linked(),9);
    const obs=root.toObservable(count);
    const fromObs=root.toSignal(obs,{requireSync:true});
    assert.equal(fromObs(),4);
    const res=root.resource({request:()=>count(),defaultValue:0,loader:async({request})=>request*10});
    assert.equal(res.status(),'loading');
    res.destroy();
    const inp=root.input(5,{transform:(v:number)=>v*2});
    root.applyInputValue(inp,7);
    assert.equal(inp(),14);
    const mdl=root.model('a');
    const emitted:string[]=[];
    mdl.subscribe(v=>emitted.push(v));
    mdl.set('b');
    assert.deepEqual(emitted,['b']);
    const out=root.output<number>();
    const outVals:number[]=[];
    out.subscribe(v=>outVals.push(v));
    out.emit(42);
    assert.deepEqual(outVals,[42]);
    const TOKEN=new root.InjectionToken<string>('TOKEN',{factory:()=>'root-val'});
    const env=root.createEnvironmentInjector([{provide:TOKEN,useValue:'custom-val'}]);
    assert.equal(env.runInContext(()=>root.inject(TOKEN)),'custom-val');
    const vc=root.viewChild.required<string>('box');
    root.applyQueryValue(vc,'found-box');
    assert.equal(vc(),'found-box');
    const cc=root.contentChildren<number>('item');
    root.applyQueryValue(cc,[1,2,3]);
    assert.deepEqual(cc(),[1,2,3]);
    const tasks=env.runInContext(()=>root.inject(root.PendingTasks));
    assert.equal(tasks.hasPendingTasks(),false);
    const doneTask=tasks.add();
    assert.equal(tasks.hasPendingTasks(),true);
    doneTask();
    assert.equal(tasks.hasPendingTasks(),false);
    const rxRes=root.rxResource({
      request:()=>count(),
      defaultValue:0,
      loader:({request})=>({
        subscribe(obs){
          const next=typeof obs==='function'?obs:obs.next?.bind(obs);
          next?.(request*100);
          return {unsubscribe(){}};
        }
      })
    });
    assert.equal(rxRes.status(),'resolved');
    assert.equal(rxRes.value(),400);
    rxRes.destroy();
    const renderPhases:string[]=[];
    const areRef=root.afterRenderEffect({
      earlyRead:()=>count(),
      write:(v)=>{renderPhases.push('w:'+v);return v+1;},
      read:(v)=>{renderPhases.push('r:'+v);}
    });
    assert.deepEqual(renderPhases,['w:4','r:5']);
    areRef.destroy();
    root.assertNotInReactiveContext(function setupCheck(){});
    const httpMod=await import('@tschk/moonshine-angular/http');
    const hdrs=new httpMod.HttpHeaders({'X-Test':'ok'}).append('x-test','more');
    assert.deepEqual(hdrs.getAll('X-TEST'),['ok','more']);
    const prms=new httpMod.HttpParams({fromObject:{a:1,b:['x','y']}});
    assert.equal(prms.toString(),'a=1&b=x&b=y');
    const httpEnv=root.createEnvironmentInjector([
      httpMod.provideHttpClient(
        httpMod.withFetch(async(u)=>new Response(JSON.stringify({u:String(u)}),{status:200,headers:{'x-ok':'1'}})),
        httpMod.withInterceptors([(req,next)=>next(req.clone({setParams:{i:'1'}}))])
      )
    ]);
    const data=await httpEnv.get(httpMod.HttpClient).get('/ping');
    assert.deepEqual(data,{u:'/ping?i=1'});
    const formsMod=await import('@tschk/moonshine-angular/forms');
    const fc=new formsMod.FormControl('hi',{nonNullable:true,validators:[formsMod.Validators.minLength(3)]});
    assert.equal(fc.valid,false);
    fc.setValue('hello');
    assert.equal(fc.valid,true);
    assert.equal(fc.valueSignal(),'hello');
    const routerMod=await import('@tschk/moonshine-angular/router');
    const routerEnv=root.createEnvironmentInjector([
      routerMod.provideRouter([{path:'items/:id',title:r=>'Item '+r.params.id}])
    ]);
    const rtr=routerEnv.get(routerMod.Router);
    const act=routerEnv.get(routerMod.ActivatedRoute);
    assert.equal(await rtr.navigateByUrl('/items/42?sort=asc'),true);
    assert.equal(act.paramsSignal().id,'42');
    assert.equal(act.queryParamsSignal().sort,'asc');
    assert.equal(act.titleSignal(),'Item 42');
    const platformMod=await import('@tschk/moonshine-angular/platform');
    const titleSvc=routerEnv.get(platformMod.Title);
    titleSvc.setTitle('Standalone Angular');
    assert.equal(titleSvc.getTitle(),'Standalone Angular');
    const ts=routerEnv.get(platformMod.TransferState);
    const key=platformMod.makeStateKey<number>('count');
    ts.set(key,99);
    assert.equal(ts.get(key,0),99);
    assert.equal(new platformMod.TitleCasePipe().transform('hello world'),'Hello World');
    routerEnv.destroy();
    httpEnv.destroy();
    env.destroy();
    assert.equal(env.destroyed,true);
  `);
});

test("optional framework renderer serves native SSR, API and SPA and rejects legacy React output", async () => {
  await standalone(
    `
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {crepusRenderer} from '@tschk/moonshine-angular';
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

const sourceCompiler = process.env.MOONSHINE_CREPUS_COMPILER;
test.skipIf(!sourceCompiler)(
  "authored Angular .component.ts compiles via crepus web build to moonshine-dom and moonshine-ssr without Angular host runtime",
  async () => {
    const componentSource = `import { Component, Injectable, Input, Output, EventEmitter, HostBinding, ViewChild, signal, computed, input, model, viewChild } from "@angular/core";
import { CommonModule, UpperCasePipe } from "@angular/common";
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";

@Injectable({ providedIn: "root" })
export class StepService {
  step = 3;
}

@Component({
  selector: "app-route-leaf",
  standalone: true,
  template: \`<section class="route-leaf">Route Leaf: {{ section() }}</section>\`,
})
export class RouteLeafComponent {
  section = input("overview");
}

@Component({
  selector: "app-badge-box",
  standalone: true,
  template: \`<aside class="badge-box"><b (click)="bump()">{{ val() }}</b><ng-content>Default Slot</ng-content></aside>\`,
})
export class BadgeBoxComponent {
  val = model(10);
  bump() {
    this.val.update((n) => n + 1);
  }
}

@Component({
  selector: "app-counter",
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, UpperCasePipe, BadgeBoxComponent, RouteLeafComponent],
  styles: [".counter { color: navy; }"],
  host: {
    "role": "region",
    "[class.is-positive]": "count() > 0",
  },
  template: \`
    @let summaryLabel = (title() | uppercase) + ': ' + doubled();
    <div class="counter" [attr.data-step]="step" [style.color]="accent()" [style.padding.px]="12" [ngStyle]="{ border: '1px solid' }" [ngClass]="{ highlighted: count() > 0 }">
      <nav>
        <a
          routerLink="/items"
          routerLinkActive="nav-active"
          [routerLinkActiveOptions]="{ exact: false }"
          [queryParams]="{ section: 'catalog' }"
          fragment="list"
          ariaCurrentWhenActive="page"
          #rla="routerLinkActive"
        >Catalog ({{ rla.isActive }})</a>
      </nav>
      <input #noteInput [value]="note()" />
      <small>{{ noteInput.value }}</small>
      <span>{{ summaryLabel }}</span>
      @if (doubled(); as dbl) {
        <em>Active ({{ dbl }})</em>
      } @else {
        <em>Idle</em>
      }
      @switch (mode()) {
        @case ('edit') {
          <strong>Editing</strong>
        }
        @default {
          <strong>Viewing</strong>
        }
      }
      <ul>
        @for (item of items(); track item; let idx = $index, total = $count, isFirst = $first, isLast = $last) {
          <li [class.first-row]="isFirst" [class.last-row]="isLast">{{ idx }}/{{ total }}:{{ item }}</li>
        }
      </ul>
      <div class="empty-check">
        @for (row of emptyRows(); track row) {
          <span>{{ row }}</span>
        } @empty {
          <i>No rows</i>
        }
      </div>
      <form [formGroup]="profileForm" (ngSubmit)="submitProfile()">
        <input formControlName="username" />
        <div formGroupName="address">
          <input formControlName="city" />
        </div>
      </form>
      <form #tplForm="ngForm">
        <input name="email" required minlength="3" [(ngModel)]="emailModel" #emailCtrl="ngModel" />
        <u class="tpl-status">{{ emailCtrl.valid }}:{{ tplForm.valid }}</u>
      </form>
      @defer (when count() > 0) {
        <mark class="deferred-ready">Deferred Ready</mark>
      } @placeholder {
        <mark class="deferred-wait">Waiting</mark>
      }
      <ng-container>
        <app-badge-box [(val)]="syncedCount">Projected Content</app-badge-box>
      </ng-container>
      <router-outlet></router-outlet>
      <button (click)="increment()">+</button>
    </div>
  \`,
})
export class CounterComponent {
  title = input("Count");
  @Input() step = 2;
  @Output() changed = new EventEmitter<number>();
  @HostBinding("attr.data-mode") modeAttr = "live";
  count = signal(4);
  syncedCount = signal(25);
  accent = signal("teal");
  mode = signal("edit");
  note = signal("ready");
  emailModel = signal("ada@example.com");
  items = signal(["x", "y"]);
  emptyRows = signal<string[]>([]);
  doubled = computed(() => this.count() * 2);
  profileForm = new FormGroup({
    username: new FormControl("ada"),
    address: new FormGroup({
      city: new FormControl("London"),
    }),
  });
  submittedCount = 0;
  noteRef = viewChild("noteInput");
  @ViewChild("noteInput") decoratedNoteRef?: any;
  viewReady = false;

  ngAfterViewInit() {
    this.viewReady = Boolean(this.noteRef() && this.decoratedNoteRef);
  }

  submitProfile() {
    this.submittedCount += 1;
  }

  increment() {
    this.count.update((n) => n + this.step);
    this.changed.emit(this.count());
  }
}
`;
    const check = `import assert from 'node:assert/strict';
import CounterComponent, { CounterComponent as NamedCounter, RouteLeafComponent, StepService } from './ssr/CrepusEmit.moonshine-ssr.ts';
import { h, renderToString } from '@tschk/moonshine-dom/ssr';
import { Router, bootstrapApplication, createEnvironmentInjector, provideRouter, runInInjectionContext, withComponentInputBinding } from '@tschk/moonshine-angular';

const routeInjector = createEnvironmentInjector([
  provideRouter(
    [{ path: 'items', component: RouteLeafComponent }],
    withComponentInputBinding(),
  ),
]);
const router = routeInjector.get(Router);
await router.navigateByUrl('/items?section=catalog#list');

const html = runInInjectionContext(routeInjector, () =>
  renderToString(() => h(CounterComponent, { title: 'score', step: 5 }))
);
assert.ok(html.includes('role="region"'), html);
assert.ok(html.includes('data-mode="live"'), html);
assert.ok(html.includes('is-positive'), html);
assert.ok(html.includes('highlighted'), html);
assert.ok(html.includes('border: 1px solid; color: teal; padding: 12px'), html);
assert.ok(html.includes('data-step="5"'), html);
assert.ok(html.includes('href="/items?section=catalog#list"'), html);
assert.ok(html.includes('nav-active'), html);
assert.ok(html.includes('aria-current="page"'), html);
assert.ok(html.includes('Catalog (true)'), html);
assert.ok(html.includes('<small>ready</small>'), html);
assert.ok(html.includes('SCORE: 8'), html);
assert.ok(html.includes('<em>Active (8)</em>'), html);
assert.ok(html.includes('<strong>Editing</strong>'), html);
assert.ok(html.includes('<li class="first-row">0/2:x</li><li class="last-row">1/2:y</li>'), html);
assert.ok(html.includes('<i>No rows</i>'), html);
assert.ok(html.includes('value="ada"'), html);
assert.ok(html.includes('value="London"'), html);
assert.ok(html.includes('value="ada@example.com"'), html);
assert.ok(html.includes('<u class="tpl-status">true:true</u>'), html);
assert.ok(html.includes('<mark class="deferred-ready">Deferred Ready</mark>'), html);
assert.ok(html.includes('ng-untouched ng-pristine ng-valid'), html);
assert.ok(html.includes('<b>25</b>Projected Content'), html);
assert.ok(html.includes('Route Leaf: catalog'), html);

const appRef = await bootstrapApplication(NamedCounter, {
  providers: [
    provideRouter(
      [{ path: 'items', component: RouteLeafComponent }],
      withComponentInputBinding(),
    ),
  ],
});
assert.equal(appRef.components.length, 1);
const inst = appRef.components[0].instance;
assert.equal(inst.doubled(), 8);
assert.equal(inst.viewReady, true);
assert.equal(inst.noteRef()?.nativeElement?.value, 'ready');
assert.equal(inst.profileForm.get('address.city')?.value, 'London');
const emitted: number[] = [];
inst.changed.subscribe((v: number) => emitted.push(v));
inst.increment();
assert.equal(inst.count(), 6);
assert.equal(inst.doubled(), 12);
assert.deepEqual(emitted, [6]);
assert.equal(appRef.injector.get(StepService).step, 3);
appRef.destroy();
`;
    await standalone(`
import assert from 'node:assert/strict';
const compiler = ${JSON.stringify(sourceCompiler)};
async function compile(entry, target, out) {
  const proc = Bun.spawn([compiler, 'web', 'build', '--site', 'source', '--entry', entry, '--emit', target, '--out-dir', out], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, log: stdout + stderr };
}
await Bun.write('source/Counter.component.ts', ${JSON.stringify(componentSource)});
for (const [target, out] of [['moonshine-dom', 'dom'], ['moonshine-ssr', 'ssr']]) {
  const result = await compile('Counter.component.ts', target, out);
  assert.equal(result.code, 0, result.log);
  const built = await Bun.build({
    entrypoints: [out + '/CrepusEmit.' + target + '.ts'],
    target: target === 'moonshine-dom' ? 'browser' : 'node',
    minify: true,
    metafile: true,
  });
  assert.ok(built.success, String(built.logs));
  assert.ok(!Object.keys(built.metafile.inputs).some(path => ['@angular/core', '@angular/common', 'react', 'react-dom'].some(name => path.includes('node_modules/' + name + '/')) || path.endsWith('.wasm')));
}
await Bun.write('check.ts', ${JSON.stringify(check)});
await import(process.cwd() + '/check.ts');
`);
  },
);
