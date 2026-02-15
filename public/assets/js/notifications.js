class NotificationManager {
    constructor(calendar) {
        this.calendar = calendar;
        this.isSupported = typeof window !== 'undefined' && 'Notification' in window;
        this.permission = this.isSupported ? Notification.permission : 'unsupported';
        this.notifiedSessions = new Set();
        this.checkInterval = null;
        this.permissionStatus = null;
        this.buttonHandler = () => this.requestPermission();

        this.init();
    }

    init() {
        this.setupButton();
        this.updateUI();

        if (!this.isSupported) {
            return;
        }

        this.checkPermissionStatus();
        this.startChecking();
    }

    async checkPermissionStatus() {
        if (!this.isSupported) {
            return;
        }

        if (navigator.permissions && navigator.permissions.query) {
            try {
                const status = await navigator.permissions.query({ name: 'notifications' });
                this.permissionStatus = status;
                this.permission = status.state;
                this.updateUI();

                status.onchange = () => {
                    this.permission = status.state;
                    this.updateUI();
                };
                return;
            } catch (_) {
                // Permissions API not fully supported (for example Safari).
            }
        }

        this.permission = Notification.permission;
        this.updateUI();
    }

    setupButton() {
        const btn = document.getElementById('notificationBtn');
        if (!btn) {
            return;
        }

        btn.removeEventListener('click', this.buttonHandler);
        btn.addEventListener('click', this.buttonHandler);
    }

    async requestPermission() {
        if (!this.isSupported || this.permission === 'denied') {
            this.updateUI();
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            this.permission = permission;
            this.updateUI();

            if (permission === 'granted') {
                new Notification('F1 Recap', {
                    body: 'You will be notified when sessions start.',
                    icon: '/assets/images/og-image.png'
                });
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error);
        }
    }

    startChecking() {
        if (!this.isSupported) {
            return;
        }

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        // Check every minute.
        this.checkInterval = setInterval(() => this.checkSessions(), 60 * 1000);
        this.checkSessions();
    }

    checkSessions() {
        if (!this.isSupported || this.permission !== 'granted') {
            return;
        }

        const upcoming = this.calendar?.upcomingGPs;
        if (!Array.isArray(upcoming) || upcoming.length === 0) {
            return;
        }

        const now = Date.now();
        const PRE_NOTIFY_WINDOW = 5 * 60 * 1000;
        const SESSION_START_WINDOW = 2 * 60 * 1000;

        upcoming.forEach((gp) => {
            const sessions = Array.isArray(gp.sessions) ? gp.sessions : [];

            sessions.forEach((session) => {
                const sessionTime = Date.parse(session.publishedAt || '');
                if (Number.isNaN(sessionTime)) {
                    return;
                }

                const timeDiff = sessionTime - now;
                const sessionId = `${gp.name}|${session.title}|${new Date(sessionTime).toISOString()}`;

                if (timeDiff > 0 && timeDiff <= PRE_NOTIFY_WINDOW) {
                    this.sendNotification(
                        `${sessionId}|starting-soon`,
                        'Starting Soon',
                        `${session.title} at ${gp.name} starts in ${Math.ceil(timeDiff / 60000)} minutes.`
                    );
                } else if (timeDiff <= 0 && Math.abs(timeDiff) < SESSION_START_WINDOW) {
                    this.sendNotification(
                        `${sessionId}|session-live`,
                        'Session Live',
                        `${session.title} at ${gp.name} is now live.`
                    );
                }
            });
        });
    }

    sendNotification(id, title, body) {
        if (!this.isSupported || this.notifiedSessions.has(id)) {
            return;
        }

        try {
            const notification = new Notification(`F1 Recap: ${title}`, {
                body,
                icon: '/assets/images/og-image.png',
                tag: id
            });

            this.notifiedSessions.add(id);

            notification.onclick = function () {
                window.focus();
                this.close();
            };
        } catch (error) {
            console.error('Notification failed:', error);
        }
    }

    updateUI() {
        const btn = document.getElementById('notificationBtn');
        if (!btn) {
            return;
        }

        btn.classList.remove('active', 'disabled');
        btn.disabled = false;

        if (!this.isSupported) {
            btn.classList.add('disabled');
            btn.disabled = true;
            btn.setAttribute('aria-label', 'Notifications unsupported');
            btn.title = 'This browser does not support desktop notifications';
            return;
        }

        if (this.permission === 'granted') {
            btn.classList.add('active');
            btn.setAttribute('aria-label', 'Notifications enabled');
            btn.title = "You'll be notified when F1 sessions start";
            return;
        }

        if (this.permission === 'denied') {
            btn.classList.add('disabled');
            btn.disabled = true;
            btn.setAttribute('aria-label', 'Notifications blocked');
            btn.title = 'Notifications are blocked. Enable them in browser settings.';
            return;
        }

        btn.setAttribute('aria-label', 'Enable notifications');
        btn.title = 'Click to get notified when F1 sessions start';
    }

    destroy() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        if (this.permissionStatus) {
            this.permissionStatus.onchange = null;
            this.permissionStatus = null;
        }

        const btn = document.getElementById('notificationBtn');
        if (btn) {
            btn.removeEventListener('click', this.buttonHandler);
        }

        this.notifiedSessions.clear();
    }
}
