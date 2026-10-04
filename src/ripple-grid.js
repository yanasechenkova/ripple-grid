import GeraWebGL from 'gerawebgl';

export const GRID = Object.freeze({
    count           : 15,
    spacing         : 0.50,
    tileWidth       : 0.39,
    baseHeight      : 0.24,
    minHeight       : 0.08,
    maxHeight       : 1.55,
    initialSpeed    : 2.4,
    initialStrength : 0.9,
    initialDamping  : 1.2
});

const PLATFORM = {
    height  : 0.18,
    padding : 0.62
};

const WAVE = {
    frontWidth           : 0.34,
    troughDistance       : 0.62,
    secondCrestDistance  : 1.18,
    troughStrength       : 0.46,
    secondCrestStrength  : 0.24,
    verticalScale        : 0.82,
    lifetimeDampingScale : 0.22,
    lifetimeSeconds      : 6.0,
    maxRipples           : 6
};

const COLORS = {
    platform : [0.048, 0.066, 0.066],
    tileA    : [0.070, 0.31, 0.33],
    tileB    : [0.090, 0.38, 0.39]
};

export class RippleGrid {
    #scene;
    #geometries;
    #materials;
    #root       = new GeraWebGL.Object3D();
    #tiles      = [];
    #tileLookup = new Map();
    #ripples    = [];
    #raycaster  = new GeraWebGL.Raycaster();

    constructor(engine) {
        const context = engine.webglRenderingContext;
        this.#scene = engine.scene;

        this.#geometries = {
            box : new GeraWebGL.Geometries.BoxGeometry(context)
        };

        this.#materials = {
            platform : new GeraWebGL.Materials.PhongMaterial(context, {
                color            : COLORS.platform,
                specularColor    : [0.28, 0.38, 0.37],
                specularStrength : 0.26,
                shininess        : 30
            }),

            tileA : new GeraWebGL.Materials.PhongMaterial(context, {
                color            : COLORS.tileA,
                specularColor    : [0.70, 0.94, 0.90],
                specularStrength : 0.70,
                shininess        : 58
            }),

            tileB : new GeraWebGL.Materials.PhongMaterial(context, {
                color            : COLORS.tileB,
                specularColor    : [0.80, 1.00, 0.95],
                specularStrength : 0.78,
                shininess        : 64
            })
        };

        this.#buildPlatform();
        this.#buildTiles();
        engine.scene.add(this.#root);
    }

    setTime(seconds, speed, strength, damping) {
        this.#removeExpiredRipples(seconds);

        for (const tile of this.#tiles) {
            let displacement = 0;

            for (const ripple of this.#ripples) {
                const age = seconds - ripple.startedAt;

                if (age < 0)
                    continue;

                const distance = Math.hypot(
                    tile.x - ripple.x,
                    tile.z - ripple.z
                );

                const radius = age * speed;
                const offset = distance - radius;
                const fade   = Math.exp(-damping * age * WAVE.lifetimeDampingScale);

                const crest = RippleGrid.#gaussian(
                    offset,
                    WAVE.frontWidth
                );

                const trough = RippleGrid.#gaussian(
                    offset + WAVE.troughDistance,
                    WAVE.frontWidth * 1.15
                );

                const secondCrest = RippleGrid.#gaussian(
                    offset + WAVE.secondCrestDistance,
                    WAVE.frontWidth * 1.35
                );

                displacement += (
                    crest
                    - trough * WAVE.troughStrength
                    + secondCrest * WAVE.secondCrestStrength
                ) * strength * fade;
            }

            const height = Math.max(
                GRID.minHeight,
                Math.min(GRID.maxHeight, GRID.baseHeight + displacement * WAVE.verticalScale)
            );

            tile.mesh.scale.y    = height;
            tile.mesh.position.y = PLATFORM.height + height / 2;
        }
    }

    trigger(mouseNdc, camera, seconds) {
        const intersections = this.#raycaster.raycast(
            this.#scene,
            camera,
            mouseNdc,
            {
                filter : mesh => this.#tileLookup.has(mesh),
                sort   : true
            }
        );

        if (intersections.length === 0)
            return false;

        const tile = this.#tileLookup.get(intersections[0].object);
        this.#addRipple(tile.x, tile.z, seconds);
        return true;
    }

    pulseCenter(seconds) {
        this.#addRipple(0, 0, seconds);
    }

    dispose() {
        this.#root.parent?.remove(this.#root);
        this.#root.traverse(object => {
            if (object instanceof GeraWebGL.Mesh)
                object.dispose();
        });

        for (const geometry of Object.values(this.#geometries))
            geometry.dispose();

        for (const material of Object.values(this.#materials))
            material.dispose();
    }

    #buildPlatform() {
        const span = (GRID.count - 1) * GRID.spacing + GRID.tileWidth + PLATFORM.padding * 2;
        this.#box(
            this.#root,
            [0, PLATFORM.height / 2, 0],
            [span, PLATFORM.height, span],
            this.#materials.platform
        );
    }

    #buildTiles() {
        const first = -((GRID.count - 1) * GRID.spacing) / 2;

        for (let row = 0; row < GRID.count; row += 1) {
            for (let column = 0; column < GRID.count; column += 1) {
                const x = first + column * GRID.spacing;
                const z = first + row * GRID.spacing;

                const material = (row + column) % 2 === 0
                    ? this.#materials.tileA
                    : this.#materials.tileB;

                const mesh = this.#box(
                    this.#root,
                    [x, PLATFORM.height + GRID.baseHeight / 2, z],
                    [GRID.tileWidth, GRID.baseHeight, GRID.tileWidth],
                    material
                );

                const tile = { mesh, x, z };
                this.#tiles.push(tile);
                this.#tileLookup.set(mesh, tile);
            }
        }
    }

    #addRipple(x, z, seconds) {
        this.#ripples.push({ x, z, startedAt: seconds });

        while (this.#ripples.length > WAVE.maxRipples)
            this.#ripples.shift();
    }

    #removeExpiredRipples(seconds) {
        while (this.#ripples.length > 0 && seconds - this.#ripples[0].startedAt > WAVE.lifetimeSeconds)
            this.#ripples.shift();
    }

    #box(parent, position, size, material) {
        const mesh = this.#mesh(parent, this.#geometries.box, material);
        mesh.position.set(...position);
        mesh.scale.set(...size);
        return mesh;
    }

    #mesh(parent, geometry, material) {
        const mesh = new GeraWebGL.Mesh(geometry, material, {
            ownsGeometry : false,
            ownsMaterial : false
        });

        parent.add(mesh);
        return mesh;
    }

    static #gaussian(value, width) {
        const normalized = value / width;
        return Math.exp(-0.5 * normalized * normalized);
    }
}
