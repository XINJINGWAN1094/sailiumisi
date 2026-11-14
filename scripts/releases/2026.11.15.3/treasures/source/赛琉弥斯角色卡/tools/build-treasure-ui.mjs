import webpack from 'webpack';
import { VueLoaderPlugin } from 'vue-loader';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
const card = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(card, '..');
const source = path.join(card, 'src/角色卡玩法规则包/界面/人物与宝物');
const output = path.join(root, 'dist/角色卡玩法规则包/界面/人物与宝物');
const optionalAssets = Object.fromEntries(
  [7, 8, 9].map(number => {
    const name = 'foil151-iri-' + number + '.webp';
    return [name, '/user/images/selyumis-treasure-ui/' + name];
  }),
);
const licenseNotice =
  'Inspira UI GlareCard adaptation (MIT):\n' +
  (await readFile(path.join(source, 'licenses/inspira-ui/LICENSE.txt'), 'utf8')) +
  '\nIndependent Pokemon Cards 151 adaptation by Simon Goellner (simeydotme), GPL-3.0. Modified 2026-11-12. Full license: licenses/pokemon-cards-151/LICENSE.txt; corresponding source: source/. ';
const sourceFiles = new Set();
const collectSources = stats => {
  const visit = modules => {
    for (const module of modules ?? []) {
      const filename = module.nameForCondition?.split('?')[0];
      if (
        filename &&
        filename.startsWith(root + path.sep) &&
        !filename.includes(path.sep + 'node_modules' + path.sep) &&
        !filename.startsWith(output + path.sep)
      )
        sourceFiles.add(filename);
      visit(module.modules);
    }
  };
  visit(stats.toJson({ all: false, modules: true, nestedModules: true }).modules);
};
const config = {
  mode: 'production',
  target: ['web', 'es2022'],
  devtool: false,
  entry: path.join(source, 'index.ts'),
  output: { path: output, filename: 'app.js', clean: true },
  resolve: { extensions: ['.ts', '.js', '.vue'], alias: { vue: 'vue/dist/vue.runtime.esm-bundler.js' } },
  module: {
    rules: [
      { test: /\.vue$/, loader: 'vue-loader' },
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: {
          transpileOnly: true,
          appendTsSuffixTo: [/\.vue$/],
          onlyCompileBundledFiles: true,
          configFile: path.join(root, 'tsconfig.json'),
        },
      },
      { test: /\.css$/, use: [MiniCssExtractPlugin.loader, { loader: 'css-loader', options: { url: false } }] },
    ],
  },
  plugins: [
    new VueLoaderPlugin(),
    new webpack.BannerPlugin({ banner: licenseNotice }),
    new MiniCssExtractPlugin({ filename: 'style.css' }),
    new webpack.DefinePlugin({
      __VUE_OPTIONS_API__: false,
      __VUE_PROD_DEVTOOLS__: false,
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    }),
    new HtmlWebpackPlugin({
      templateContent:
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>赛琉弥斯 · 人物与宝物</title></head><body><div id="treasure-ui"></div></body></html>',
    }),
  ],
  performance: { hints: false },
};
const compiler = webpack(config);
compiler.run(async (error, stats) => {
  try {
    if (error || stats?.hasErrors()) throw error ?? new Error(stats.toString({ all: false, errors: true }));
    collectSources(stats);
    const stylesheet = path.join(output, 'style.css');
    await writeFile(stylesheet, (await readFile(stylesheet, 'utf8')).trimEnd() + '\n');
    await cp(path.join(source, 'assets'), path.join(output, 'assets'), {
      recursive: true,
      filter: assetPath => !/\.(png|jpe?g)$/i.test(assetPath) && path.basename(assetPath) !== '.gitignore',
    });
    const bundle = {
      optionalAssets,
      javascript: await readFile(path.join(output, 'app.js'), 'utf8'),
      stylesheet: await readFile(stylesheet, 'utf8'),
      assets: (await readdir(path.join(output, 'assets'))).filter(name => name.endsWith('.webp')).sort(),
    };
    // Compile the launcher and shared panel bridge together; keep all images as external URLs.
    await new Promise((resolve, reject) => {
      const launcherCompiler = webpack({
        mode: 'production',
        target: ['web', 'es2022'],
        devtool: false,
        entry: path.join(source, 'launcher.ts'),
        output: { path: output, filename: 'launcher.js', clean: false },
        resolve: config.resolve,
        module: { rules: config.module.rules.filter(rule => String(rule.test) === String(/\.ts$/)) },
        plugins: [
          new webpack.BannerPlugin({ banner: licenseNotice }),
          new webpack.BannerPlugin({ banner: `const __TREASURE_BUNDLE__ = ${JSON.stringify(bundle)};`, raw: true }),
        ],
        performance: { hints: false },
      });
      launcherCompiler.run((launcherError, launcherStats) =>
        launcherCompiler.close(closeError => {
          if (launcherError || closeError || launcherStats?.hasErrors())
            reject(launcherError ?? closeError ?? new Error(launcherStats.toString({ all: false, errors: true })));
          else {
            collectSources(launcherStats);
            resolve();
          }
        }),
      );
    });
    const content = await readFile(path.join(output, 'launcher.js'), 'utf8');
    const script = {
      type: 'script',
      enabled: true,
      name: '人物与宝物 · 独立界面',
      id: 'a0e0b39c-7c82-4e3e-a5e7-f6e5fbe2d818',
      content,
      info: 'INT-18 独立入口。只复用已安装的 v3 变量接口，不注册变量或世界书。图片需先经 serve-treasure-install.mjs 安装到目标酒馆，assetUrls 保存在本脚本数据中；独立预览不写入聊天。',
      button: {
        enabled: true,
        buttons: [
          { name: '领地人物', visible: true },
          { name: '宝物藏室', visible: true },
        ],
      },
      data: {},
    };
    const delivery = path.join(card, 'output/角色卡玩法规则包/人物与宝物');
    await mkdir(delivery, { recursive: true });
    await writeFile(path.join(delivery, '人物与宝物-入口.json'), JSON.stringify(script, null, 2) + '\n');
    await writeFile(path.join(delivery, '人物与宝物-入口更新-直接粘贴.js'), content);
    await cp(path.join(source, 'assets/button-frame.webp'), path.join(delivery, 'button-frame.webp'));
    const textureDelivery = path.join(delivery, '新增纹理资源');
    await mkdir(textureDelivery, { recursive: true });
    for (const name of Object.keys(optionalAssets))
      await cp(path.join(source, 'assets', name), path.join(textureDelivery, name));
    await writeFile(path.join(textureDelivery, 'assetUrls.json'), JSON.stringify(optionalAssets, null, 2) + '\n');
    for (const directory of [delivery, output])
      await cp(path.join(source, 'licenses'), path.join(directory, 'licenses'), { recursive: true });
    // Ship the preferred source, build entry and its local dependencies alongside GPL-derived output.
    // Webpack erases type-only imports; include their preferred source as well.
    for (const filename of sourceFiles) {
      if (!/\.(?:[jt]sx?|vue)$/.test(filename)) continue;
      const text = await readFile(filename, 'utf8');
      const references = /\bfrom\s*['"](\.[^'"]+)['"]|\bimport\s*['"](\.[^'"]+)['"]/g;
      for (const match of text.matchAll(references)) {
        const base = path.resolve(path.dirname(filename), match[1] ?? match[2]);
        if (!base.startsWith(root + path.sep)) throw new Error('Source dependency outside repository');
        for (const candidate of [
          base,
          ...['.ts', '.tsx', '.js', '.mjs', '.vue', '.json', '/index.ts', '/index.js'].map(
            extension => base + extension,
          ),
        ]) {
          try {
            if ((await stat(candidate)).isFile()) {
              sourceFiles.add(candidate);
              break;
            }
          } catch (error) {
            if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
          }
        }
      }
    }
    const sourceDelivery = path.join(delivery, 'source');
    await mkdir(sourceDelivery, { recursive: true });
    for (const file of sourceFiles) {
      const destination = path.join(sourceDelivery, path.relative(root, file));
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(file, destination);
    }
    await cp(source, path.join(sourceDelivery, path.relative(root, source)), { recursive: true });
    for (const relative of [
      'package.json',
      'pnpm-lock.yaml',
      'tsconfig.json',
      '赛琉弥斯角色卡/tools/build-treasure-ui.mjs',
      '赛琉弥斯角色卡/tools/tsconfig.treasure-ui.json',
      '赛琉弥斯角色卡/tools/tsconfig.character-gameplay.json',
    ]) {
      const destination = path.join(sourceDelivery, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(root, relative), destination);
    }
    await cp(path.join(root, '@types'), path.join(sourceDelivery, '@types'), { recursive: true });
    for (const name of (await readdir(root)).filter(name => name.endsWith('.d.ts')))
      await cp(path.join(root, name), path.join(sourceDelivery, name));
    await writeFile(
      path.join(sourceDelivery, '构建说明.txt'),
      '保留根目录结构，从此目录安装 pnpm-lock.yaml 所列依赖后运行：\nnode 赛琉弥斯角色卡/tools/build-treasure-ui.mjs\n依赖版本和上游许可证由原项目 package.json、锁文件及 licenses 记录。包含 GPL 改编代码，分发时须保留许可及相应源码。\n',
    );
    await writeFile(
      path.join(delivery, '手动替换说明.txt'),
      [
        '本次已接入本地项目并构建；未自动改写当前酒馆。不要新增第二份入口脚本。',
        '1. 将“新增纹理资源”内三张 WebP 复制到酒馆当前用户 images/selyumis-treasure-ui/，保持文件名。对应 /user/images/selyumis-treasure-ui/。',
        '   旧的 42 张图片和 assetUrls 映射保持不变。若使用自定义路径，只将 assetUrls.json 中这三个键合并到原 assetUrls，不能整体替换。',
        '2. 将原“人物与宝物”脚本代码完整替换为“人物与宝物-入口更新-直接粘贴.js”。保留原脚本 ID、按钮、数据及人物图片。',
        '3. button-frame.webp 沿用原交付；若此前尚未更新透明按钮底图，按原 assetUrls["button-frame.webp"] 指向的文件名覆盖对应本地图片。',
        '4. 重载原脚本，卡面下方可选“关闭／原版柔光／151 全息”。选择会记住；151 与原版为独立实现。',
        '装备槽及已装备图标恢复羊皮纸底图。顶部互跳按钮、蓝色底栏和装饰外框继续移除。',
        '人物建档按钮支持鼠标／触屏拖动并记住位置；Alt + 方向键微调，Alt + Home 恢复默认。建档面板随按钮选择可见位置。',
        '本次不涉及玩法变量脚本或世界书，不重跑初始化。实际操作由用户在酒馆内验收。',
        'GPL/MIT 许可保存在 licenses/，相应项目源码及构建入口在 source/；对外分发请一并提供。',
      ].join('\n') + '\n',
    );
    // Keep the original installation record truthful; produce a separate update using its image mapping.
    let installed;
    try {
      installed = JSON.parse(await readFile(path.join(delivery, '人物与宝物-当前酒馆已配置.json'), 'utf8'));
    } catch (readError) {
      if (readError.code !== 'ENOENT') throw readError;
    }
    if (
      installed?.id === script.id &&
      bundle.assets.every(name => typeof (installed.data?.assetUrls?.[name] ?? optionalAssets[name]) === 'string')
    ) {
      await writeFile(
        path.join(delivery, '人物与宝物-保留图片映射更新.json'),
        JSON.stringify(
          {
            ...installed,
            content,
            data: { ...installed.data, assetUrls: { ...optionalAssets, ...installed.data.assetUrls } },
          },
          null,
          2,
        ) + '\n',
      );
      console.log('已生成保留现有图片映射的本地入口更新包；尚未安装到酒馆。');
    }
    await writeFile(path.join(output, 'launcher.js'), content);
    console.log(stats.toString({ all: false, assets: true, warnings: true }));
    console.log(`UI output: ${output}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    compiler.close(() => {});
  }
});
