async function loadComponent(file: string) {
  // Simulate delay
  await new Promise(resolve => setTimeout(resolve, 10));
  return () => `Component ${file}`;
}

async function seq(layouts: string[]) {
  let body = "page";
  if (layouts) {
    for (let i = layouts.length - 1; i >= 0; i--) {
      const Layout = await loadComponent(layouts[i]);
      body = `Layout(${Layout()}) -> ${body}`;
    }
  }
  return body;
}

async function concurrent(layouts: string[]) {
  let body = "page";
  if (layouts) {
    const comps = await Promise.all(layouts.map(l => loadComponent(l)));
    for (let i = layouts.length - 1; i >= 0; i--) {
      const Layout = comps[i];
      body = `Layout(${Layout()}) -> ${body}`;
    }
  }
  return body;
}

async function run() {
  const layouts = Array.from({length: 5}, (_, i) => `layout-${i}`);

  console.time('seq');
  await seq(layouts);
  console.timeEnd('seq');

  console.time('concurrent');
  await concurrent(layouts);
  console.timeEnd('concurrent');
}

run();
