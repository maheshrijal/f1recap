/**
 * Shared UI Components
 * Header and Footer components used across all pages
 */

const Components = {
    /**
     * Generate the site header HTML
     * @param {string} activePage - The current active page ('home', 'archive', 'about')
     * @param {Object} options - Optional configuration
     * @param {string} options.subtitle - Custom subtitle text
     * @returns {string} Header HTML
     */
    header(activePage = 'home', options = {}) {
        const navLinks = [
            { href: 'index.html', label: 'Home', id: 'home' },
            { href: 'archive-2025.html', label: 'Archive (2025)', id: 'archive' },
            { href: 'about.html', label: 'About', id: 'about' }
        ];

        const navHTML = navLinks.map(link => 
            `<a href="${link.href}" class="nav-link${activePage === link.id ? ' active' : ''}">${link.label}</a>`
        ).join('\n                ');

        return `
    <header>
        <div class="header-inner">
            <a class="header-text" href="index.html" aria-label="Go to home">
                <h1>🏎️ F1 Highlights Hub</h1>
            </a>
        </div>
        <div class="header-actions">
            <button class="theme-toggle header-toggle" type="button" aria-label="Toggle theme">
                <span class="light-stack" aria-hidden="true">
                    <span class="light-dot"></span>
                    <span class="light-dot"></span>
                    <span class="light-dot"></span>
                </span>
                <span class="theme-toggle-icon">🌙</span>
                <span class="theme-toggle-label">Dark</span>
            </button>
        </div>
        <nav class="header-nav" aria-label="Main navigation">
            <div class="header-nav-inner">
                ${navHTML}
            </div>
        </nav>
    </header>`;
    },

    /**
     * Generate the site footer HTML
     * @returns {string} Footer HTML
     */
    footer() {
        const currentYear = new Date().getFullYear();
        
        return `
    <footer>
        <div class="footer-inner">
            <div class="footer-brand">
                <a href="index.html" class="footer-logo">🏎️ F1 Highlights Hub</a>
                <span class="footer-tagline">Your pit stop for F1 highlights</span>
            </div>
            
            <div class="footer-theme">
                <button class="theme-toggle" type="button" aria-label="Toggle theme">
                    <span class="light-stack" aria-hidden="true">
                        <span class="light-dot"></span>
                        <span class="light-dot"></span>
                        <span class="light-dot"></span>
                    </span>
                    <span class="theme-toggle-icon">🌙</span>
                    <span class="theme-toggle-label">Dark</span>
                </button>
            </div>
            
            <div class="footer-links">
                <a href="about.html" class="footer-link">About</a>
                <a href="disclosure.html" class="footer-link">Disclosure</a>
                <a href="data/f1-calendar_2026.ics" class="footer-link">Calendar (.ics)</a>
            </div>
        </div>
        
        <div class="footer-bottom">
            <span class="footer-tz" id="tzNote"></span>
            <span class="last-updated" id="lastUpdated"></span>
            <span class="footer-copyright">&copy; ${currentYear} F1 Recap</span>
        </div>
    </footer>`;
    },

    /**
     * Initialize components on page load
     * Call this after DOM is ready
     */
    init() {
        // Set initial theme from localStorage or system preference
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', initialTheme);

        // Re-initialize theme toggle listeners for dynamically added buttons
        document.querySelectorAll('.theme-toggle').forEach(btn => {
            if (!btn.dataset.initialized) {
                btn.addEventListener('click', () => {
                    const html = document.documentElement;
                    const currentTheme = html.getAttribute('data-theme');
                    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                    
                    html.classList.add('theme-transition');
                    html.setAttribute('data-theme', newTheme);
                    localStorage.setItem('theme', newTheme);
                    
                    // Update all toggle buttons
                    document.querySelectorAll('.theme-toggle').forEach(toggle => {
                        const icon = toggle.querySelector('.theme-toggle-icon');
                        const label = toggle.querySelector('.theme-toggle-label');
                        if (icon) icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
                        if (label) label.textContent = newTheme === 'dark' ? 'Light' : 'Dark';
                    });
                    
                    setTimeout(() => html.classList.remove('theme-transition'), 600);
                });
                btn.dataset.initialized = 'true';
            }
        });

        // Sync button states with current theme
        const currentTheme = document.documentElement.getAttribute('data-theme');
        document.querySelectorAll('.theme-toggle').forEach(toggle => {
            const icon = toggle.querySelector('.theme-toggle-icon');
            const label = toggle.querySelector('.theme-toggle-label');
            if (icon) icon.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
            if (label) label.textContent = currentTheme === 'dark' ? 'Light' : 'Dark';
        });
    },

    /**
     * Render header and footer into placeholder elements
     * @param {string} activePage - Current page identifier
     */
    render(activePage = 'home') {
        const headerEl = document.getElementById('site-header');
        const footerEl = document.getElementById('site-footer');
        
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
