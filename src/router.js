import { HomeView } from './views/home.js';
import { ImportView } from './views/import.js';
import { SettingsView } from './views/settings.js';
import { EditorView } from './views/editor.js';
import { ShareView } from './views/share.js';

export class Router {
    constructor() {
        this.routes = {
            'home': HomeView,
            'import': ImportView,
            'settings': SettingsView,
            'editor': EditorView,
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

        this.appElement.innerHTML = ''; // Clear current view
        if (hash.startsWith('share/')) {
            // 共有リンク (#share/<code>) はコード付きビューとして扱う。
            this.currentView = new ShareView(decodeURIComponent(hash.slice('share/'.length)));
        } else {
            const ViewClass = this.routes[hash] || HomeView;
            this.currentView = new ViewClass();
        }
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
