import ts from 'typescript';
import {rollup} from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function compile(configName,override={}) {
  const file=ts.readConfigFile(path.join(project,configName),ts.sys.readFile);
  if(file.error)throw Error(ts.flattenDiagnosticMessageText(file.error.messageText,'\n'));
  const parsed=ts.parseJsonConfigFileContent(file.config,ts.sys,project,override);
  const program=ts.createProgram(parsed.fileNames,parsed.options),diagnostics=ts.getPreEmitDiagnostics(program);
  if(diagnostics.length)throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>project,getNewLine:()=> '\n'}));
  if(!parsed.options.noEmit) {const result=program.emit();if(result.emitSkipped)throw Error('TypeScript emit failed.');}
}
function sourcePlugin() {
  return {name:'local-typescript-and-css',
    resolveId(source,importer) {
      if(importer&&source.startsWith('.')&&source.endsWith('.js')) {
        const file=path.resolve(path.dirname(importer),source.slice(0,-3));
        for(const ext of ['.ts','.tsx'])if(existsSync(file+ext))return file+ext;
      }
    },
    async load(id) {
      if(id.endsWith('.css')){this.emitFile({type:'asset',fileName:path.basename(id),source:await fs.readFile(id,'utf8')});return '';}
      if(id.endsWith('.json'))return `export default ${await fs.readFile(id,'utf8')};`;
    },
    transform(code,id) {
      if(/\.[cm]?tsx?$/.test(id)&&!id.includes('node_modules'))return {code:ts.transpileModule(code,{fileName:id,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,sourceMap:false}}).outputText,map:null};
      if(id.includes('node_modules')&&code.includes('process.env.NODE_ENV'))return {code:code.replaceAll('process.env.NODE_ENV','"production"'),map:null};
    }
  };
}
async function verifyPackageTypes() {
  // Resolve the built package in this working tree like a strict NodeNext
  // consumer, including its explicitly imported stylesheet. This checks the
  // emitted declaration graph, not npm's packaged `files`; run
  // `npm run verify:package` before publishing to test the tarball.
  const dir=path.join(project,'.tests');await fs.mkdir(dir,{recursive:true});
  const example=path.join(dir,'built-package-consumer.ts');
  await fs.writeFile(example,"import { SankeyDiagram, type SankeyGraph } from '@bwin/sankey-plus';\nimport '@bwin/sankey-plus/style.css';\nconst graph: SankeyGraph = {stages: [], nodes: [], links: []};\nvoid [SankeyDiagram, graph];\n");
  const program=ts.createProgram([example],{noEmit:true,strict:true,noUncheckedSideEffectImports:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext});
  const diagnostics=ts.getPreEmitDiagnostics(program);
  if(diagnostics.length)throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>project,getNewLine:()=> '\n'}));
}
export async function build() {
  compile('tsconfig.json');
  const library=await rollup({input:path.join(project,'src/index.ts'),external:['react','react-dom','react/jsx-runtime'],plugins:[sourcePlugin()]});
  await library.write({file:path.join(project,'dist/sankey-plus.js'),format:'es',sourcemap:false});await library.close();compile('tsconfig.lib.json');
  // The stylesheet is a separate package export, not a side effect of the
  // library entry, so copy it like the declarations instead of importing it.
  await fs.copyFile(path.join(project,'src/style.css'),path.join(project,'dist/style.css'));
  await fs.copyFile(path.join(project,'src/style.css.d.ts'),path.join(project,'dist/style.css.d.ts'));
  await verifyPackageTypes();
  const demo=await rollup({input:path.join(project,'demo/main.tsx'),plugins:[sourcePlugin(),nodeResolve({extensions:['.js','.ts','.tsx','.json'],browser:true}),commonjs()]});
  await demo.write({file:path.join(project,'demo-dist/demo.js'),format:'es',sourcemap:true});await demo.close();
  await fs.copyFile(path.join(project,'demo/index.html'),path.join(project,'demo-dist/index.html'));
  console.log('Built dist/ (React library) and demo-dist/ (standalone browser demo).');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await build();
