import { assertSupportedRuntime } from '../../../../util/platform-guard';
import $ from 'jquery';
import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

$(() => {
  assertSupportedRuntime();
  const app = createApp(App);
  app.mount('#treasure-ui');
  $(window).one('pagehide', () => app.unmount());
});
