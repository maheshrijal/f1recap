/**
 * Shared UI Components
 * Header and Footer components used across all pages
 */

const Components = {
    /**
     * Generate the site header HTML
     * @param {string} activePage - The current active page ('home', 'standings', 'archive', 'about')
     * @param {Object} options - Optional configuration
     * @param {string} options.subtitle - Custom subtitle text
     * @returns {string} Header HTML
     */
    header(activePage = 'home', options = {}) {
        const navLinks = [
            { href: 'index.html', label: 'Calendar', id: 'home' },
            { href: 'standings.html', label: 'Standings', id: 'standings' },
            { href: 'archive-2025.html', label: '2025 Archive', id: 'archive' },
            { href: 'about.html', label: 'About', id: 'about' }
        ];

        const navHTML = navLinks.map((link) => {
            const isActive = activePage === link.id;
            const ariaCurrent = isActive ? ' aria-current="page"' : '';
            return `<a href="${link.href}" class="nav-link${isActive ? ' active' : ''}"${ariaCurrent}>${link.label}</a>`;
        }).join('\n                ');

        return `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header class="site-topbar">
        <div class="site-nav-shell">
            <a class="site-brand" href="index.html" aria-label="F1 Recap home">
                <span class="site-brand-mark" aria-hidden="true"></span>
                <span>F1 <em>Recap</em></span>
            </a>
            <nav class="site-nav" id="site-nav" aria-label="Main navigation">
                ${navHTML}
            </nav>
            <div class="site-season-chip" aria-label="Current season">
                <span>Season</span><strong>2026</strong>
            </div>
            <button class="nav-toggle site-menu-button" type="button" aria-label="Toggle navigation" aria-expanded="false" aria-controls="site-nav">
                <span class="nav-toggle-icon" aria-hidden="true"></span>
                <span class="nav-toggle-label">Menu</span>
            </button>
        </div>
    </header>`;
    },

    /**
     * Generate the site footer HTML
     * @returns {string} Footer HTML
     */
    footer() {
        const currentYear = new Date().getFullYear();

        return `
    <footer class="site-shell-footer">
        <div class="site-shell-footer-brand">
            <a class="site-brand" href="index.html" aria-label="F1 Recap home">
                <span class="site-brand-mark" aria-hidden="true"></span>
                <span>F1 <em>Recap</em></span>
            </a>
            <p>Your pit stop for Formula 1 highlights and session times.</p>
        </div>
        <nav class="site-footer-links" aria-label="Footer navigation">
            <a href="about.html">About</a>
            <a href="disclosure.html">Disclosure</a>
            <a href="https://github.com/maheshrijal/f1recap" target="_blank" rel="noopener noreferrer">Open source</a>
        </nav>
        <div class="site-footer-meta">
            <span id="tzNote"></span>
            <span id="lastUpdated"></span>
            <span>&copy; ${currentYear} F1 Recap</span>
        </div>
    </footer>`;
    },

    /**
     * Initialize components on page load
     * Call this after DOM is ready
     */
    init() {
        const captureAnalytics = (eventName, properties = {}) => {
            if (!window.posthog || typeof window.posthog.capture !== 'function') {
                return;
            }

            try {
                window.posthog.capture(eventName, properties);
            } catch (error) {
                console.debug('PostHog capture failed:', error);
            }
        };

        const setThemeState = (theme) => {
            const isDark = theme === 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
            const themeColor = document.querySelector('meta[name="theme-color"]');
            if (themeColor) {
                themeColor.setAttribute('content', isDark ? '#0d0d0d' : '#e10600');
            }
            document.querySelectorAll('.theme-toggle').forEach((toggle) => {
                const icon = toggle.querySelector('.theme-toggle-icon');
                const label = toggle.querySelector('.theme-toggle-label');
                toggle.classList.toggle('is-dark', isDark);
                if (icon) icon.textContent = isDark ? '☀️' : '🌙';
                if (label) label.textContent = isDark ? 'Light' : 'Dark';
            });
        };

        // Pit Wall is a dark-only visual system.
        setThemeState('dark');

        // Re-initialize theme toggle listeners for dynamically added buttons
        document.querySelectorAll('.theme-toggle').forEach(btn => {
            if (!btn.dataset.initialized) {
                btn.addEventListener('click', () => {
                    const currentTheme = document.documentElement.getAttribute('data-theme');
                    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

                    document.documentElement.classList.add('theme-transition');
                    setThemeState(newTheme);
                    localStorage.setItem('theme', newTheme);
                    setTimeout(() => document.documentElement.classList.remove('theme-transition'), 600);

                    captureAnalytics('theme_toggled', {
                        theme: newTheme,
                        previous_theme: currentTheme,
                        location: btn.closest('footer') ? 'footer' : 'header'
                    });
                });
                btn.dataset.initialized = 'true';
            }
        });

        // Mobile nav toggle
        const navToggle = document.querySelector('.nav-toggle');
        const nav = document.getElementById('site-nav');
        const updateToggleVisual = (toggle, isOpen) => {
            if (!toggle) return;
            const label = toggle.querySelector('.nav-toggle-label');
            if (label) label.textContent = isOpen ? 'Close' : 'Menu';
        };
        const setNavState = (navEl, toggleEl, isOpen, options = {}) => {
            if (!navEl || !toggleEl) return;
            const { focusToggle = true } = options;
            navEl.classList.toggle('is-open', isOpen);
            toggleEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            navEl.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
            updateToggleVisual(toggleEl, isOpen);
            if (!isOpen && focusToggle) {
                toggleEl.focus();
            }
        };

        if (navToggle && nav && !navToggle.dataset.initialized) {
            const firstNavLink = () => nav.querySelector('a');

            navToggle.addEventListener('click', (event) => {
                const isOpen = nav.classList.contains('is-open');
                const nextOpen = !isOpen;
                setNavState(nav, navToggle, nextOpen, { focusToggle: !nextOpen });

                captureAnalytics('mobile_nav_toggled', {
                    opened: nextOpen,
                    page: document.body && document.body.dataset ? document.body.dataset.page : undefined
                });

                let openedByKeyboard = event.detail === 0;
                if (!openedByKeyboard) {
                    try {
                        openedByKeyboard = navToggle.matches(':focus-visible');
                    } catch (error) {
                        openedByKeyboard = false;
                    }
                }

                if (nextOpen && openedByKeyboard) {
                    const firstLink = firstNavLink();
                    if (firstLink) firstLink.focus();
                }
            });

            nav.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => setNavState(nav, navToggle, false, { focusToggle: false }));
            });

            const mediaQuery = window.matchMedia('(max-width: 720px)');
            const syncNav = () => {
                if (!mediaQuery.matches) {
                    nav.classList.remove('is-open');
                    navToggle.setAttribute('aria-expanded', 'false');
                    nav.removeAttribute('aria-hidden');
                    updateToggleVisual(navToggle, false);
                    return;
                }
                nav.setAttribute('aria-hidden', nav.classList.contains('is-open') ? 'false' : 'true');
                updateToggleVisual(navToggle, nav.classList.contains('is-open'));
            };

            if (!this._navEscapeListenerAttached) {
                document.addEventListener('keydown', (event) => {
                    if (event.key !== 'Escape') return;
                    const activeNav = document.getElementById('site-nav');
                    const activeToggle = document.querySelector('.nav-toggle');
                    if (!activeNav || !activeToggle) return;
                    if (!activeNav.classList.contains('is-open')) return;
                    setNavState(activeNav, activeToggle, false);
                });
                this._navEscapeListenerAttached = true;
            }

            if (typeof mediaQuery.addEventListener === 'function') {
                mediaQuery.addEventListener('change', syncNav);
            } else if (typeof mediaQuery.addListener === 'function') {
                mediaQuery.addListener(syncNav);
            }
            syncNav();
            navToggle.dataset.initialized = 'true';
        }

        const tzNote = document.getElementById('tzNote');
        if (tzNote && !tzNote.dataset.initialized) {
            try {
                const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (timeZone) {
                    tzNote.textContent = timeZone;
                }
            } catch (_) {
                // Ignore runtime locale errors.
            }
            tzNote.dataset.initialized = 'true';
        }
    },

    /**
     * Render header and footer into placeholder elements
     * @param {string} activePage - Current page identifier
     */
    render(activePage = 'home') {
        const headerEl = document.getElementById('site-header');
        const footerEl = document.getElementById('site-footer');
        if (document.body) {
            document.body.dataset.page = activePage;
            document.body.classList.add(`page-${activePage}`);
        }

        if (headerEl) {
            headerEl.outerHTML = this.header(activePage);
        }

        if (footerEl) {
            footerEl.outerHTML = this.footer();
        }

        // Initialize after rendering
        this.init();
    }
};

// Remove auto-initialization since render() calls init() explicitly
// The inline script Components.render() will handle initialization
