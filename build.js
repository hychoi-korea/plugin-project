// build.js
const esbuild = require('esbuild');
const fs = require('fs');
const isWatch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  target: 'es2017',
  logLevel: 'info',
};

async function inlineUiJs() {
  // ui.template.html + ui.js → ui.html (script inlined)
  const template = fs.readFileSync('ui.template.html', 'utf8');
  const uiJs = fs.readFileSync('ui.js', 'utf8');
  const output = template.replace(
    '<script src="ui.js"></script>',
    `<script>\n${uiJs}\n</script>`
  );
  fs.writeFileSync('ui.html', output, 'utf8');
  console.log('[build] ui.html generated (inline script)');
}

async function build() {
  // 메인 스레드: code.ts → code.js
  const pluginCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['code.ts'],
    outfile: 'code.js',
    platform: 'browser',
  });

  // UI 스레드: src/ui/main.ts → ui.js (intermediate)
  const uiCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['src/ui/main.ts'],
    outfile: 'ui.js',
    platform: 'browser',
  });

  if (isWatch) {
    await pluginCtx.watch();
    // watch mode: rebuild ui.js then inline on each change
    const origRebuild = uiCtx.watch.bind(uiCtx);
    await uiCtx.watch();
    // initial inline
    await inlineUiJs();
    console.log('Watching... (ui.html auto-inlined on ui.js rebuild)');
  } else {
    await pluginCtx.rebuild();
    await uiCtx.rebuild();
    await inlineUiJs();
    await pluginCtx.dispose();
    await uiCtx.dispose();
  }
}

build().catch((err) => { console.error(err); process.exit(1); });
