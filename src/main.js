import GeraWebGL            from 'gerawebgl';
import { GRID, RippleGrid } from './ripple-grid.js';

const VIEWS = {
    perspective : { azimuthRadians: 0.55, polarRadians: -0.76, targetY: 0.42 },
    top         : { azimuthRadians: 0.0, polarRadians: -1.47, targetY: 0.34 }
};

class App {
    #canvas;
    #engine;
    #grid;
    #orbit;
    #resizeObserver;
    #pointerStart    = null;
    #time            = 0;
    #speed           = GRID.initialSpeed;
    #strength        = GRID.initialStrength;
    #damping         = GRID.initialDamping;
    #playing         = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    #events          = new AbortController();
    #playButton      = document.querySelector('#play');
    #mouseNdc        = { x: 0, y: 0 };
    #clickDistance   = 5;

    constructor(canvas) {
        this.#canvas = canvas;
        GeraWebGL.WebGLContext.setDefaultClearColor(16 / 255, 25 / 255, 26 / 255, 1);
        this.#engine = GeraWebGL.createEngine(canvas, { near: 0.1, far: 100 });

        const light = new GeraWebGL.DirectionalLight();
        light.setDirection([-0.48, 0.96, 0.38]);
        light.setStrength(0.92);
        this.#engine.scene.add(light);

        const ambient = new GeraWebGL.AmbientLight();
        ambient.setStrength(0.30);
        this.#engine.scene.add(ambient);
        this.#grid = new RippleGrid(this.#engine);

        if (this.#playing)
            this.#grid.pulseCenter(this.#time);

        this.#setView('perspective');
        this.#bindControls();
        this.#updatePlayButton();
        this.#resizeObserver = new ResizeObserver(() => this.#fitCamera());
        this.#resizeObserver.observe(canvas);
        this.#start();
    }

    dispose() {
        this.#engine.stop();
        this.#events.abort();
        this.#resizeObserver.disconnect();
        this.#orbit.dispose();
        this.#grid.dispose();
    }

    #start() {
        if (document.hidden)
            return;

        this.#engine.start(deltaSeconds => {
            if (this.#playing)
                this.#time += deltaSeconds;

            this.#grid.setTime(this.#time, this.#speed, this.#strength, this.#damping);
            this.#orbit.update();
        });
    }

    #bindControls() {
        const options = { signal: this.#events.signal };

        this.#playButton.addEventListener('click', () => {
            this.#playing = !this.#playing;
            this.#updatePlayButton();
        }, options);

        document.querySelector('#center').addEventListener('click', () => {
            this.#grid.pulseCenter(this.#time);
        }, options);

        document.querySelector('#speed').addEventListener('input', event => {
            this.#speed = event.target.valueAsNumber;
            document.querySelector('#speed-value').value = this.#speed.toFixed(1);
        }, options);

        document.querySelector('#strength').addEventListener('input', event => {
            this.#strength = event.target.valueAsNumber;
            document.querySelector('#strength-value').value = this.#strength.toFixed(1);
        }, options);

        document.querySelector('#damping').addEventListener('input', event => {
            this.#damping = event.target.valueAsNumber;
            document.querySelector('#damping-value').value = this.#damping.toFixed(1);
        }, options);

        for (const button of document.querySelectorAll('[data-view]'))
            button.addEventListener('click', () => this.#setView(button.dataset.view), options);

        this.#canvas.addEventListener('pointerdown', event => {
            this.#pointerStart = {
                pointerId : event.pointerId,
                x         : event.clientX,
                y         : event.clientY
            };
        }, options);

        this.#canvas.addEventListener('pointerup', event => {
            if (!this.#pointerStart || event.pointerId !== this.#pointerStart.pointerId)
                return;

            const distance = Math.hypot(
                event.clientX - this.#pointerStart.x,
                event.clientY - this.#pointerStart.y
            );

            this.#pointerStart = null;

            if (distance > this.#clickDistance)
                return;

            App.#updateMouseNdc(event, this.#canvas, this.#mouseNdc);
            this.#grid.trigger(this.#mouseNdc, this.#engine.camera, this.#time);
        }, options);

        this.#canvas.addEventListener('pointercancel', () => this.#pointerStart = null, options);

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.#engine.stop();
            } else {
                this.#start();
            }
        }, options);

        window.addEventListener('pagehide', event => {
            if (!event.persisted)
                this.dispose();
        }, options);
    }

    #setView(name) {
        this.#orbit?.dispose();
        this.#orbit = new GeraWebGL.Controls.OrbitControls(this.#engine.camera, this.#canvas, {
            ...VIEWS[name],
            distance        : 11.5,
            minDistance     : 6.5,
            maxDistance     : 28,
            minPolarRadians : -1.49,
            maxPolarRadians : -0.10,
            rotationSpeed   : 0.65,
            zoomSpeed       : 0.4
        });

        this.#fitCamera();

        for (const button of document.querySelectorAll('[data-view]'))
            button.setAttribute('aria-pressed', String(button.dataset.view === name));
    }

    #fitCamera() {
        const aspect = this.#canvas.clientWidth / this.#canvas.clientHeight;
        this.#orbit.setDistance(Math.max(9.8, 12.5 / aspect));
    }

    #updatePlayButton() {
        this.#playButton.textContent = this.#playing ? 'Pause' : 'Play';
    }

    static #updateMouseNdc(event, canvas, outMouseNdc) {
        const rect      = canvas.getBoundingClientRect();
        const relativeX = (event.clientX - rect.left) / rect.width;
        const relativeY = (event.clientY - rect.top) / rect.height;
        outMouseNdc.x   = relativeX * 2 - 1;
        outMouseNdc.y   = 1 - relativeY * 2;
    }
}

try {
    new App(document.querySelector('#scene'));
} catch (error) {
    console.error(error);

    const message = document.querySelector('#error');
    message.textContent = 'The scene could not start. This demo needs WebGL2. Try another browser or check the console for details.';
    message.hidden = false;

    for (const control of document.querySelectorAll('button, input'))
        control.disabled = true;
}
