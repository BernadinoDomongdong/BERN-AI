/**
 * codeRain.js — ambient "falling code" background.
 *
 * Renders on a single <canvas>, Matrix-style: columns of glyphs drift
 * downward at varying speed with a fading trail, colored with the
 * current theme's accent. Pure decoration (aria-hidden), GPU-light
 * (one canvas, no DOM churn per frame), and fully paused for
 * prefers-reduced-motion.
 */

const GLYPHS = '01SELECTFROMWHEREJOINCREATETABLEINDEXasyncawaitconst=>{}[]<>/*curlPOST01TRUNCATEMERGE01'.split('');
const FONT_SIZE = 14;
const FRAME_INTERVAL_MS = 60; // caps redraw rate independent of monitor refresh rate

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class CodeRain {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.columns = 0;
        this.dropY = [];
        this.rafId = null;
        this.lastFrameTime = 0;
        this._resizeObserver = new ResizeObserver(() => this._handleResize());
    }

    _handleResize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const { width, height } = this.canvas.getBoundingClientRect();

        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.columns = Math.max(1, Math.floor(width / FONT_SIZE));
        this.dropY = new Array(this.columns).fill(0).map(() => Math.random() * -100);
    }

    _accentColor() {
        return getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#ffc22e';
    }

    _drawFrame() {
        const { width, height } = this.canvas.getBoundingClientRect();
        const ctx = this.ctx;

        // Fading trail: translucent fill instead of clearRect so glyphs streak.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';

        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(0, 0, width, height);

        ctx.font = `${FONT_SIZE}px "Space Mono", monospace`;
        ctx.fillStyle = this._accentColor();

        for (let i = 0; i < this.columns; i++) {
            const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            const x = i * FONT_SIZE;
            const y = this.dropY[i] * FONT_SIZE;

            ctx.fillText(glyph, x, y);

            if (y > height && Math.random() > 0.975) {
                this.dropY[i] = 0;
            } else {
                this.dropY[i] += 0.4 + Math.random() * 0.5;
            }
        }
    }

    _loop(timestamp) {
        if (!this.lastFrameTime) this.lastFrameTime = timestamp;
        if (timestamp - this.lastFrameTime >= FRAME_INTERVAL_MS) {
            this._drawFrame();
            this.lastFrameTime = timestamp;
        }
        this.rafId = requestAnimationFrame((t) => this._loop(t));
    }

    start() {
        if (!this.canvas || prefersReducedMotion()) return;
        this._resizeObserver.observe(this.canvas);
        this._handleResize();
        this.rafId = requestAnimationFrame((t) => this._loop(t));
    }

    stop() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this._resizeObserver.disconnect();
    }
}
