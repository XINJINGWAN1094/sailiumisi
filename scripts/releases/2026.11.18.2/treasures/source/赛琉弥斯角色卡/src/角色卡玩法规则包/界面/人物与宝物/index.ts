import { isSupportedRuntime } from '../../../../util/platform-guard';
import $ from 'jquery';
import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

$(() => {
  if (!isSupportedRuntime()) return;
  const app = createApp(App);
  app.mount('#treasure-ui');
  $(window).one('pagehide', () => app.unmount());
});
