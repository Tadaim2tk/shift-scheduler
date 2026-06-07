import './style.css';
import { Router } from './router.js';
import { Store } from './store/store.js';

// Global instances
window.app = {
  store: new Store(),
  router: new Router()
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.app.store.load(); // Load data from local storage
  window.app.router.init();
});
