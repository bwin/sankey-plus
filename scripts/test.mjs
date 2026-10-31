import {compile,project} from './build.mjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
compile('tsconfig.test.json');
await import(pathToFileURL(path.join(project,'.tests/tests/core.test.js')).href);
await import(pathToFileURL(path.join(project,'.tests/tests/paths.test.js')).href);
