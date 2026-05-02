/**
 * Shared Analytics (PostHog + Web Vitals)
 * Loaded on pages that need tracking. Reads config from window.__POSTHOG__.
 */
(function (window, document) {
    // Ensure config defaults
    (function () {
        if (!window.__POSTHOG__ || (!window.__POSTHOG__.host && !window.__POSTHOG__.key)) {
            const defaultEnv = window.location.hostname === 'localhost' ? 'local' : 'production';
            window.__POSTHOG__ = {
                key: '',
                host: 'https://app.posthog.com',
                uiHost: 'https://app.posthog.com',
                environment: defaultEnv,
                commitSha: ''
            };
        }
    })();

    const config = window.__POSTHOG__ || {};
    if (!config.key) {
        if (typeof console !== 'undefined') {
            console.info('PostHog public key not provided; analytics disabled.');
        }
        return;
    }

    const apiHost = (config.host || 'https://app.posthog.com').replace(/\/$/, '');
    const assetHost = apiHost.replace('.i.posthog.com', '-assets.i.posthog.com');
    const toolbarHost = (config.uiHost || apiHost).replace(/\/$/, '');
    const runtimeEnv = config.environment || (window.location.hostname === 'localhost' ? 'local' : 'production');

    // --- PostHog bootstrap ---
    (function (t, e) {
        var o, n, p, r;
        if (!e.__SV) {
            window.posthog = e.posthog = function () {
                posthog._i.push(arguments);
            };
            posthog._i = [];
            posthog.init = function (i, s, a) {
                function g(t, e) {
                    var o = e.split('.');
                    if (o.length === 2) { t = t[o[0]]; e = o[1]; }
                    t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); };
                }
                var u = posthog;
                if (typeof a !== 'undefined') { u = posthog[a] = []; } else { a = 'posthog'; }
                u.people = u.people || [];
                u.toString = function (t) {
                    var e = 'posthog';
                    if (a !== 'posthog') { e += '.' + a; }
                    if (!t) { e += ' (stub)'; }
                    return e;
                };
                u.people.toString = function () {
                    return u.toString(1) + '.people (stub)';
                };
                r = 'capture identify alias people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete group identify_account resetAutocompleteCounter register register_once unregister set_config opt_out_capturing has_opted_out_capturing has_opted_in_capturing opt_in_capturing clear_opt_in_out_capturing onLMTConsentChange group_identify'.split(' ');
                for (p = 0; p < r.length; p++) { g(u, r[p]); }
                posthog._i.push([i, s, a]);
            };
            posthog.__SV = 1;
            o = t.createElement('script');
            o.type = 'text/javascript';
            o.async = true;
            o.src = assetHost + '/static/array.js';
            o.crossOrigin = 'anonymous';
            n = t.getElementsByTagName('script')[0];
            n.parentNode.insertBefore(o, n);
        }
    })(document, window.posthog || []);

    if (typeof window.posthog.register === 'function') {
        const baseProperties = { environment: runtimeEnv };
        if (config.commitSha) { baseProperties.commit_sha = config.commitSha; }
        window.posthog.register(baseProperties);
    }

    window.posthog.init(config.key, {
        api_host: apiHost,
        ui_host: toolbarHost,
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: true,
        persistence: 'localStorage+cookie',
        session_recording: {
            maskAllInputs: true,
            maskTextSelector: '.ph-mask'
        }
    });

    // --- Web Vitals ---
    const WEB_VITALS_SRC = 'https://unpkg.com/web-vitals@3/dist/web-vitals.iife.js';

    const roundValue = function (value) {
        return typeof value === 'number' && Number.isFinite(value)
            ? Math.round(value * 1000) / 1000
            : value;
    };

    const getNavigationType = function () {
        if (typeof performance === 'undefined') { return undefined; }
        if (typeof performance.getEntriesByType === 'function') {
            const navEntry = performance.getEntriesByType('navigation')[0];
            if (navEntry && navEntry.type) { return navEntry.type; }
        }
        if (performance.navigation && typeof performance.navigation.type === 'number') {
            const legacyTypes = ['navigate', 'reload', 'back_forward', 'prerender'];
            return legacyTypes[performance.navigation.type] || 'navigate';
        }
        return undefined;
    };

    function sendToPosthog(metric) {
        if (!window.posthog || typeof window.posthog.capture !== 'function') { return; }
        window.posthog.capture('web_vital', {
            metric_name: metric.name,
            metric_id: metric.id,
            value: roundValue(metric.value),
            delta: roundValue(metric.delta),
            rating: metric.rating,
            environment: runtimeEnv,
            visibility_state: document.visibilityState,
            navigation_type: getNavigationType(),
            path: window.location.pathname,
            connection_type: navigator.connection && navigator.connection.effectiveType
        });
    }

    function bindWebVitals() {
        if (!window.webVitals) { return; }
        const options = { reportAllChanges: true };
        window.webVitals.onCLS && window.webVitals.onCLS(sendToPosthog, options);
        window.webVitals.onFID && window.webVitals.onFID(sendToPosthog, options);
        window.webVitals.onLCP && window.webVitals.onLCP(sendToPosthog, options);
        window.webVitals.onFCP && window.webVitals.onFCP(sendToPosthog, options);
        window.webVitals.onTTFB && window.webVitals.onTTFB(sendToPosthog, options);
        window.webVitals.onINP && window.webVitals.onINP(sendToPosthog, options);
    }

    function ensureWebVitalsLoaded() {
        if (window.webVitals) { bindWebVitals(); return; }
        if (document.querySelector('script[data-web-vitals="true"]')) { return; }

        const script = document.createElement('script');
        script.src = WEB_VITALS_SRC;
        script.defer = true;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.dataset.webVitals = 'true';
        script.onload = bindWebVitals;
        script.onerror = function (error) {
            if (typeof console !== 'undefined') {
                console.debug('Web Vitals script failed to load', error);
            }
        };
        document.head.appendChild(script);
    }

    if (document.readyState === 'complete') {
        ensureWebVitalsLoaded();
    } else {
        window.addEventListener('load', ensureWebVitalsLoaded, { once: true });
    }

    // --- Exception capture ---
    function captureException(error, source, extra) {
        if (!window.posthog || typeof window.posthog.capture !== 'function') { return; }
        const errorObj = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
        try {
            if (typeof window.posthog.captureException === 'function') {
                window.posthog.captureException(errorObj, Object.assign({ source: source }, extra || {}));
                return;
            }
            window.posthog.capture('$exception', Object.assign({
                $exception_message: errorObj.message,
                $exception_type: errorObj.name,
                $exception_stack_trace_raw: errorObj.stack,
                $exception_personURL: window.location.href,
                source: source
            }, extra || {}));
        } catch (e) {
            if (typeof console !== 'undefined') { console.debug('PostHog exception capture failed:', e); }
        }
    }

    window.addEventListener('error', function (event) {
        captureException(event.error || event.message, 'window.onerror', {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        });
    });

    window.addEventListener('unhandledrejection', function (event) {
        captureException(event.reason, 'unhandledrejection');
    });

    // --- Scroll depth ---
    (function () {
        const thresholds = [25, 50, 75, 100];
        const reached = new Set();
        let ticking = false;

        function checkScroll() {
            ticking = false;
            const doc = document.documentElement;
            const scrollable = (doc.scrollHeight || 0) - (window.innerHeight || 0);
            if (scrollable <= 0) { return; }
            const percent = Math.min(100, Math.round(((window.scrollY || doc.scrollTop || 0) / scrollable) * 100));
            thresholds.forEach(function (threshold) {
                if (percent >= threshold && !reached.has(threshold)) {
                    reached.add(threshold);
                    if (window.posthog && typeof window.posthog.capture === 'function') {
                        try {
                            window.posthog.capture('scroll_depth_reached', {
                                depth_percent: threshold,
                                path: window.location.pathname
                            });
                        } catch (e) { /* swallow */ }
                    }
                }
            });
        }

        window.addEventListener('scroll', function () {
            if (ticking) { return; }
            ticking = true;
            window.requestAnimationFrame(checkScroll);
        }, { passive: true });
    })();

    // --- PWA install ---
    window.addEventListener('beforeinstallprompt', function (event) {
        if (!window.posthog || typeof window.posthog.capture !== 'function') { return; }
        try {
            window.posthog.capture('pwa_install_prompt_shown', {
                platforms: event.platforms
            });
            if (event.userChoice && typeof event.userChoice.then === 'function') {
                event.userChoice.then(function (choice) {
                    window.posthog.capture('pwa_install_prompt_resolved', {
                        outcome: choice && choice.outcome
                    });
                });
            }
        } catch (e) { /* swallow */ }
    });

    window.addEventListener('appinstalled', function () {
        if (!window.posthog || typeof window.posthog.capture !== 'function') { return; }
        try { window.posthog.capture('pwa_installed'); } catch (e) { /* swallow */ }
    });
})(window, document);
