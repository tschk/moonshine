import { expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { compileCommand } from "../src/compile";
import { compileTemplates } from "../src/adopt/templates";

async function fixture(
  run: (dir: string, compiler: string, log: string) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "moonshine module compile "));
  const compiler = join(dir, "compiler with spaces");
  const log = join(dir, "calls.json");
  await writeFile(
    compiler,
    `#!${process.execPath}
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import{join,dirname}from'node:path';
const args=process.argv.slice(2),flag=name=>args[args.indexOf(name)+1],out=flag('--out-dir'),target=flag('--emit'),sourceEntry=flag('--entry');
writeFileSync(${JSON.stringify(log)},JSON.stringify({args,out}));
const input=readFileSync(join(flag('--site'),sourceEntry),'utf8'),entry='CrepusEmit.'+target+'.ts',prefix='modules/'+target+'/';
const files={[entry]:'// unchanged facade\\nexport {default} from "./'+prefix+sourceEntry+'";\\n',[prefix+sourceEntry]:'// unchanged module\\nexport {value as default} from "./helper";\\n',[prefix+dirname(sourceEntry)+'/helper.ts']:'// unchanged helper\\nexport const value='+JSON.stringify(input)+';\\n'};
for(const[path,source]of Object.entries(files)){if(input==='missing'&&path.endsWith('helper.ts'))continue;mkdirSync(dirname(join(out,path)),{recursive:true});writeFileSync(join(out,path),source);}
writeFileSync(join(out,'crepus-module-manifest.json'),JSON.stringify({version:1,target,entry,sourceEntry,files:Object.keys(files).map(path=>path.replace('/./','/'))}));
`,
  );
  await chmod(compiler, 0o755);
  try {
    await run(dir, compiler, log);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function value(path: string) {
  const bundle = await Bun.build({
    entrypoints: [path],
    target: "bun",
  });
  expect(bundle.success, JSON.stringify(bundle.logs)).toBe(true);
  const source = await bundle.outputs[0]!.text();
  return (
    await import(
      `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    )
  ).default;
}

test("template adoption rejects a module graph instead of dropping its companions", async () => {
  await fixture(async (dir, compiler) => {
    const script = await readFile(compiler, "utf8");
    await writeFile(
      compiler,
      script.replace(
        "sourceEntry=flag('--entry')",
        "sourceEntry=flag('--entry').replace('.svelte','.tsx')",
      ),
    );
    await writeFile(join(dir, "App.svelte"), "template source");
    await writeFile(join(dir, "App.tsx"), "compiled source");
    const [template] = await compileTemplates(
      dir,
      "svelte",
      ["**/*.svelte"],
      compiler,
    );
    expect(template?.ok).toBe(false);
    expect(template?.error).toContain("Module graph adoption is not supported");
    expect(existsSync(join(dir, "moonshine"))).toBe(false);
    expect(await readFile(join(dir, "App.svelte"), "utf8")).toBe(
      "template source",
    );
  });
}, 30_000);

test("publishes isolated unchanged module graphs for two sources and both native targets", async () => {
  await fixture(async (dir, compiler) => {
    for (const [name, content] of [
      ["counter", "one"],
      ["other", "two"],
    ]) {
      const input = join(dir, name + ".tsx");
      await writeFile(input, content!);
      await compileCommand([input, "--compiler", compiler]);
      expect(await value(join(dir, name + ".dom.ts"))).toBe(content);
    }
    await compileCommand([
      join(dir, "counter.tsx"),
      "--ssr",
      "--compiler",
      compiler,
    ]);
    expect(await value(join(dir, "counter.ssr.ts"))).toBe("one");
    expect(await value(join(dir, "other.dom.ts"))).toBe("two");
    for (const output of ["counter.dom.ts", "counter.ssr.ts", "other.dom.ts"]) {
      const store = join(dir, ".moonshine-compiled", output);
      const versions = await readdir(store);
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatch(/^[a-f0-9]{64}$/);
      const target = output.includes(".ssr.")
        ? "moonshine-ssr"
        : "moonshine-dom";
      const facade = `// unchanged facade\nexport {default} from "./modules/${target}/${output.split(".")[0]}.tsx";\n`;
      expect(
        await readFile(
          join(store, versions[0]!, `CrepusEmit.${target}.ts`),
          "utf8",
        ),
      ).toBe(facade);
      expect(
        await readFile(
          join(
            store,
            versions[0]!,
            `modules/${target}/${output.split(".")[0]}.tsx`,
          ),
          "utf8",
        ),
      ).toBe(
        '// unchanged module\nexport {value as default} from "./helper";\n',
      );
      expect(
        await readFile(
          join(store, versions[0]!, `modules/${target}/helper.ts`),
          "utf8",
        ),
      ).toBe(
        `// unchanged helper\nexport const value=${JSON.stringify(output.startsWith("other") ? "two" : "one")};\n`,
      );
    }
  });
}, 30000);

test("explicit site passes nested entry and rejects outside sources before compiler/output writes", async () => {
  await fixture(async (dir, compiler, log) => {
    const site = join(dir, "site"),
      input = join(site, "nested/counter.tsx");
    await mkdir(dirname(input), { recursive: true });
    await writeFile(input, "nested");
    await compileCommand([input, "--site", site, "--compiler", compiler]);
    const call = JSON.parse(await readFile(log, "utf8"));
    expect(call.args[call.args.indexOf("--site") + 1]).toBe(site);
    expect(call.args[call.args.indexOf("--entry") + 1]).toBe(
      "nested/counter.tsx",
    );
    expect(await value(join(site, "nested/counter.dom.ts"))).toBe("nested");
    expect(existsSync(call.out)).toBe(false);
    const previous = await readFile(log, "utf8");
    const outside = join(dir, "outside.tsx");
    await writeFile(outside, "outside");
    await expect(
      compileCommand([outside, "--site", site, "--compiler", compiler]),
    ).rejects.toThrow("inside --site");
    expect(await readFile(log, "utf8")).toBe(previous);
    expect(existsSync(join(dir, "outside.dom.ts"))).toBe(false);
  });
}, 30000);

test("missing companion preserves previous entry and graph with no staging leftovers", async () => {
  await fixture(async (dir, compiler, log) => {
    const input = join(dir, "counter.tsx"),
      output = join(dir, "counter.dom.ts");
    await writeFile(input, "valid");
    await compileCommand([input, "--compiler", compiler]);
    const previous = await readFile(output, "utf8");
    const before = await readdir(
      join(dir, ".moonshine-compiled/counter.dom.ts"),
    );
    await writeFile(input, "missing");
    await expect(
      compileCommand([input, "--compiler", compiler]),
    ).rejects.toThrow();
    expect(await readFile(output, "utf8")).toBe(previous);
    expect(await value(output)).toBe("valid");
    expect(
      await readdir(join(dir, ".moonshine-compiled/counter.dom.ts")),
    ).toEqual(before);
    expect(
      (await readdir(dir)).some((name) => name.startsWith(".moonshine-entry-")),
    ).toBe(false);
    expect(existsSync(JSON.parse(await readFile(log, "utf8")).out)).toBe(false);
  });
}, 30000);
