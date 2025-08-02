class F1VideoTracker {
    constructor() {
        this.videoContainer = document.getElementById('videoContainer');
        this.loading = document.getElementById('loading');
        this.error = document.getElementById('error');
        this.lastUpdated = document.getElementById('lastUpdated');
        
        this.init();
    }

    async init() {
        try {
            await this.loadVideos();
        } catch (error) {
            console.error('Failed to load videos:', error);
            this.showError();
        }
    }

    async loadVideos() {
        try {
            const response = await fetch('videos.json');
            if (!response.ok) {
                throw new Error('Failed to fetch videos');
            }
            
            const data = await response.json();
            this.displayGrandPrixWeekends(data.grandPrixWeekends || []);
            this.updateLastUpdated(data.lastUpdated);
            
        } catch (error) {
            console.error('Error loading videos:', error);
            this.showError();
        }
    }

    displayGrandPrixWeekends(grandPrixWeekends) {
        this.loading.style.display = 'none';
        this.error.style.display = 'none';
        this.videoContainer.style.display = 'block';

        if (!grandPrixWeekends || grandPrixWeekends.length === 0) {
            this.videoContainer.innerHTML = '<p style="color: white; text-align: center;">No Grand Prix weekends found.</p>';
            return;
        }

        this.videoContainer.innerHTML = grandPrixWeekends.map((grandPrix, index) => 
            this.createGrandPrixSection(grandPrix, index)
        ).join('');
    }

    createGrandPrixSection(grandPrix, index) {
        const isRecent = index === 0;
        const statusBadge = isRecent ? '<span class="status-badge current">Current Weekend</span>' : 
                           index === 1 ? '<span class="status-badge recent">Last Weekend</span>' : 
                           '<span class="status-badge past">Past Weekend</span>';
        
        return `
            <div class="grandprix-section ${isRecent ? 'current-weekend' : ''}">
                <div class="grandprix-header">
                    <h2 class="grandprix-title">${this.escapeHtml(grandPrix.name)}</h2>
                    ${statusBadge}
                    <div class="video-count">${grandPrix.videos.length} video${grandPrix.videos.length !== 1 ? 's' : ''}</div>
                </div>
                <div class="grandprix-videos">
                    ${grandPrix.videos.map(video => this.createVideoCard(video)).join('')}
                </div>
            </div>
        `;
    }

    createVideoCard(video) {
        const videoType = this.getVideoType(video.title);
        const formattedDate = this.formatDate(video.publishedAt);
        
        return `
            <div class="video-card">
                <div class="video-thumbnail-container" onclick="window.open('https://youtube.com/watch?v=${video.videoId}', '_blank')">
                    <div class="video-thumbnail" style="background-image: url('${video.thumbnail}')">
                        <div class="play-overlay">
                            <div class="play-button">▶</div>
                        </div>
                    </div>
                </div>
                <div class="video-info">
                    <h3 class="video-title">${this.escapeHtml(video.title)}</h3>
                    <div class="video-date">${formattedDate}</div>
                    <div class="video-actions">
                        <span class="video-type ${videoType.toLowerCase().replace(/\s+/g, '-')}">${videoType}</span>
                        <a href="https://youtube.com/watch?v=${video.videoId}" target="_blank" class="watch-button">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                            </svg>
                            WATCH
                        </a>
                    </div>
                </div>
            </div>
        `;
    }



    getVideoType(title) {
        const titleLower = title.toLowerCase();
        
        // Check for specific session types
        if (titleLower.includes('fp1')) {
            return 'FP1';
        } else if (titleLower.includes('fp2')) {
            return 'FP2';
        } else if (titleLower.includes('sprint') && (titleLower.includes('qualifying') || titleLower.includes('quali'))) {
            return 'Sprint Quali';
        } else if (titleLower.includes('sprint')) {
            return 'Sprint';
        } else if (titleLower.includes('race') && (titleLower.includes('qualifying') || titleLower.includes('quali'))) {
            return 'Race Quali';
        } else if (titleLower.includes('qualifying') || titleLower.includes('quali')) {
            return 'Qualifying';
        } else if (titleLower.includes('race') && !titleLower.includes('practice')) {
            return 'Race';
        }
        
        return 'Other';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    updateLastUpdated(timestamp) {
        if (timestamp) {
            const date = new Date(timestamp);
            this.lastUpdated.textContent = date.toLocaleString();
            
            // Update page title with current weekend info
            this.updatePageTitle();
        }
    }
    
    updatePageTitle() {
        // Get current weekend from the data
        const currentSection = document.querySelector('.grandprix-section.current-weekend');
        if (currentSection) {
            const weekendName = currentSection.querySelector('.grandprix-title').textContent;
            document.title = `${weekendName} Highlights - F1 Video Hub`;
            
            // Update meta description
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) {
                metaDesc.content = `Watch the latest ${weekendName} highlights including FP1, FP2, Qualifying, Sprint, and Race sessions. Updated every 30 minutes.`;
            }
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showError() {
        this.loading.style.display = 'none';
        this.videoContainer.style.display = 'none';
        this.error.style.display = 'block';
    }
}



// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new F1VideoTracker();
});