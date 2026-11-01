import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=path.join(project,'.tests/package-verify');
const packDir=path.join(work,'archive');
const consumer=path.join(work,'consumer');
const npmCli=process.env.npm_execpath;
function run(command,args,options={}) {
  const result=spawnSync(command,args,{cwd:project,encoding:'utf8',...options});
  if(result.error)throw result.error;
  if(result.status!==0) {
    const output=[result.stdout,result.stderr].filter(Boolean).join('\n').trim();
    throw Error(`Command failed (${result.status}): ${command} ${args.join(' ')}${output?`\n${output}`:''}`);
  }
  return result;
}
function npm(args,options={}) {
  if(!npmCli)throw Error('Run this command through npm so npm_execpath is available: npm run verify:package');
  return run(process.execPath,[npmCli,...args],options);
}
async function requireFiles(files) {
  for(const file of files) {
    try{await fs.access(path.join(project,file));}
    catch{throw Error(`Missing ${file}; run npm run build first.`);}
  }
}
async function main() {
  await requireFiles(['dist/sankey-plus.js','dist/index.d.ts','dist/SankeyDiagram.d.ts','dist/types.d.ts','dist/style.css','dist/style.css.d.ts']);
  await fs.rm(work,{recursive:true,force:true});
  await fs.mkdir(packDir,{recursive:true});
  const packed=JSON.parse(npm(['pack','--json','--pack-destination',packDir],{cwd:project}).stdout);
  if(!Array.isArray(packed)||typeof packed[0]?.filename!=='string')throw Error('npm pack did not return an archive.');
  const archive=path.resolve(packDir,packed[0].filename);
  console.log(`Packed ${path.basename(archive)}.`);

  await fs.mkdir(consumer,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8'));
  await fs.writeFile(path.join(consumer,'package.json'),JSON.stringify({name:'sankey-plus-package-consumer',version:'0.0.0',private:true,type:'module'},null,2));
  const dependencies=['typescript','react','react-dom','@types/react','@types/react-dom'].map(name=>`${name}@${manifest.devDependencies[name]??'latest'}`);
  npm(['install','--no-save','--no-package-lock','--ignore-scripts','--no-audit','--no-fund','--loglevel=error',archive,...dependencies],{cwd:consumer});
  const installed=JSON.parse(await fs.readFile(path.join(consumer,'node_modules/@bwin/sankey-plus/package.json'),'utf8'));
  if(installed.name!==manifest.name||installed.version!==manifest.version)throw Error(`Installed ${installed.name}@${installed.version}, expected ${manifest.name}@${manifest.version}.`);
  console.log(`Installed ${installed.name}@${installed.version} in a fresh consumer.`);

  await fs.writeFile(path.join(consumer,'consumer.ts'),"import { SankeyDiagram, type SankeyGraph } from '@bwin/sankey-plus';\nimport '@bwin/sankey-plus/style.css';\nconst graph: SankeyGraph = {stages: [], nodes: [], links: []};\nvoid [SankeyDiagram, graph];\n");
  await fs.writeFile(path.join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{noEmit:true,strict:true,noUncheckedSideEffectImports:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext'},include:['consumer.ts']},null,2));
  run(process.execPath,[path.join(consumer,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer});
  console.log('Strict NodeNext consumer typecheck passed.');

  const runtimeCheck="const pkg = await import('@bwin/sankey-plus');\nfor (const name of ['SankeyDiagram', 'SankeyInputError']) {\n  if (typeof pkg[name] !== 'function') throw new Error(`Missing runtime export: ${name}`);\n}";
  run(process.execPath,['--input-type=module','--eval',runtimeCheck],{cwd:consumer});
  await fs.access(path.join(consumer,'node_modules/@bwin/sankey-plus/dist/style.css'));
  console.log('Runtime exports and packaged stylesheet verified.');
}
await main();
