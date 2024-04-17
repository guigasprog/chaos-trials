import 'localstorage-polyfill'

global['localStorage'] = localStorage;

export { AppServerModule as default } from './app/app.module.server';
