// build.js
const esbuild = require('esbuild');
const isWatch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  target: 'es2017',
  logLevel: 'info',
};

async function build() {
  // 메인 스레드: code.ts → code.js
  const pluginCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['code.ts'],
    outfile: 'code.js',
    platform: 'browser',
  });

  // UI 스레드: src/ui/main.ts → ui.js
  const uiCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['src/ui/main.ts'],
    outfile: 'ui.js',
    platform: 'browser',
  });

  if (isWatch) {
    await pluginCtx.watch();
    await uiCtx.watch();
    console.log('Watching...');
  } else {
    await pluginCtx.rebuild();
    await uiCtx.rebuild();
    await pluginCtx.dispose();
    await uiCtx.dispose();
  }
}

build().catch(() => process.exit(1));
