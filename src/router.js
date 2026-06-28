import { HomeView } from './views/home.js';
import { ImportView } from './views/import.js';
import { SettingsView } from './views/settings.js';
import { EditorView } from './views/editor.js';
import { JournalView } from './views/journal.js';

export class Router {
    constructor() {
        this.routes = {
            'home': HomeView,
            'import': ImportView,
            'settings': SettingsView,
            'editor': EditorView,
            'journal': JournalView,
        };
        this.currentView = null;
        this.appElement = document.getElementById('app');
    }

    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    }

    handleRoute() {
        const hash = window.location.hash.slice(1) || 'home';
        const ViewClass = this.routes[hash] || HomeView;

        this.appElement.innerHTML = ''; // Clear current view
        this.currentView = new ViewClass();
        this.appElement.appendChild(this.currentView.render());

        // Lifecycle hook for mounting
        if (this.currentView.onMount) {
            this.currentView.onMount();
        }
    }

    navigate(route) {
        window.location.hash = route;
    }
}
