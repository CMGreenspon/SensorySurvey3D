import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const controlStates = Object.freeze({
    ORBIT: 0,
    PAN: 1,
    PAINT: 2,
    ERASE: 3
});

const meshMaterial = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    flatShading: true,
    vertexColors: true,
    shininess: 0
});

export class SurveyViewport {
    /* SETUP */

    /*  constructor
        Sets up classes needed to operate the 3D environment of the survey.

        Inputs:
            parentElement: Element
                The element you want to parent the viewport
            defaultModelFilename: string
                The name of the gltf file that is to be loaded by default
    */
    constructor(parentElement, backgroundColor, defaultColor) {
        // Create the scene
        this.scene = new THREE.Scene();
        this.scene.background = backgroundColor;

        // Get the current style
        var style = window.getComputedStyle(parentElement, null);
		var width = parseInt(style.getPropertyValue("width"));
		var height = parseInt(style.getPropertyValue("height"));

        // Create the camera
        this.camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 1000);

        // Create the renderer
        this.renderer = new THREE.WebGLRenderer({antialias: true});
		this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(width, height);

        // Place the renderer element into the webpage
        this.parentElement = parentElement;
        this.parentElement.appendChild(this.renderer.domElement);

        // Set up controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controlState = controlStates.ORBIT;
        this.toOrbit();
        
        this.pointer = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();

        // Set an ambient level of light so that all sides of the mesh are lit
		this.ambientLight = new THREE.AmbientLight(0x404040, 15);
		this.scene.add(this.ambientLight);

		// Place lights above and below the mesh
		this.light1 = new THREE.DirectionalLight(0xffffff, 4);
		this.light1.position.set(2.75, 2, 2.5).normalize();
		this.scene.add(this.light1);

		this.light2 = new THREE.DirectionalLight(0xffffff, 3);
		this.light2.position.set(-2.75, -2, -2.5).normalize();
		this.scene.add(this.light2);

        // Set initial camera position and save them
		this.camera.position.set(0, 0.75, 0.75);
		this.controls.update();
        this.controls.saveState();

        // Set event listeners
        window.onresize = this.onWindowResize.bind(this);
        document.onpointermove = this.onPointerMove.bind(this);

        this.mesh = null;
        this.currentModel = null;
        this.defaultColor = defaultColor;
    }

    /*  animate
        Queues the next frame and handles control inputs depending on the current controlState.
        Must be called once to begin animating the scene.
    */
    animate() {
        // Queue the next frame
        requestAnimationFrame(this.animate.bind(this));
        
        // Update the controls
        this.controls.update();

        // Render the scene as seen from the camera
        this.renderer.render(this.scene, this.camera);
    }

    /* CONTROLS */

    /*  toOrbit
        Configures the control object to allow the user to rotate the camera with the left
        mouse button or a single-finger touch. Also updates the controlState object to "camera".
    */
    toOrbit() {
        this.controlState = controlStates.ORBIT;
		this.controls.enabled = true;
		this.controls.enablePan = false;
		this.controls.enableRotate = true;
		this.controls.mouseButtons = {
			LEFT: THREE.MOUSE.ROTATE,
		}
        this.controls.touches = {
            ONE: THREE.TOUCH.PAN
        }
    }

    /*  toPan
        Configures the control object to allow the user to pan the camera with the left
        mouse button or a single-finger touch. Also updates the controlState object to "panning".
    */
    toPan() {
        this.controlState = controlStates.PAN;
		this.controls.enabled = true;
		this.controls.enablePan = true;
		this.controls.enableRotate = false;
		this.controls.mouseButtons = {
			LEFT: THREE.MOUSE.PAN,
		}
        this.controls.touches = {
            ONE: THREE.TOUCH.PAN
        }
    }

    /*  toPaint
        Updates the controlState object to the "painting" state.
    */
    toPaint() {
        this.controlState = controlStates.PAINT;
        this.controls.enabled = false;
    }

    /*  toErase
        Updates the controlState object to the "erasing" state.
    */
    toErase() {
        this.controlState = controlStates.ERASE;
        this.controls.enabled = false;
    }

    /*  onPointerMove
        Behavior for when the user's pointer object moves; sets values important
        for raycasting

        Inputs:
            event: Event
                The input event from which data can be extracted
    */
    onPointerMove(event) {
        var style = window.getComputedStyle(this.parentElement, null);
        var width = parseInt(style.getPropertyValue("width"));
        var height = parseInt(style.getPropertyValue("height"));
        this.pointer.x = (((event.clientX - (0.25 * window.innerWidth)) / width)
                            * 2 - 1);
	    this.pointer.y = -(event.clientY / height)* 2 + 1;
    }

    /* 3D SPACE */

    /*  onWindowResize
        Behavior for the viewport when the window is resized; makes the viewport
        fit within the new 3D container dimensions
    */
    onWindowResize() {
        var style = window.getComputedStyle(this.parentElement, null);
        var width = parseInt(style.getPropertyValue("width"));
        var height = parseInt(style.getPropertyValue("height"));

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    /*  unloadModels
        Unloads all "mesh" objects in the scene
    */
    unloadModels() {
        var meshes = this.scene.getObjectsByProperty("isMesh", true);
    
        for (var i = 0; i < meshes.length; i++) {
            this.scene.remove(meshes[i]);
        }

        this.currentModel = null;
    }

    /*  loadModel
        Loads a given model from a given .gltf file in /public/3dmodels. If 
        successful, extracts that model's geometry and places the geometry into 
        the scene as a new mesh.

        Inputs:
            filename: str
                The name of the .gltf file you want to load in (should include 
                ".gltf" at the end)
    */
    loadModel(filename) {
        const that = this;
        if (filename != this.currentModel) {
            this.unloadModels();
            return new Promise(function(resolve, reject) {
                var modelPath = "/3dmodels/" + filename;
        
                // Load the model, and pull the geometry out and create a mesh 
                // from that. This step is necessary because vertex colors 
                // only work with three.js geometry
                var loader = new GLTFLoader();
                console.log(modelPath);
                loader.load(modelPath, function(gltf) {
                    var geometry = gltf.scene.children[0].geometry;
                    const count = geometry.attributes.position.count;
                    geometry.setAttribute('color', new THREE.BufferAttribute(
                                            new Float32Array(count * 3), 3));
                    that.mesh = new THREE.Mesh(geometry, meshMaterial);
                    that.scene.add(that.mesh);
                    that.currentModel = filename;
                    that.populateColor(that.defaultColor);
                    resolve();
                }, undefined, function() {
                    alert("Could not load model " + filename + ", please notify experiment team.")
                    reject();
                });
            }.bind(that))
        }
        else {
            this.populateColor(this.defaultColor);
            return null;
        }
    }

    /* MESH MANIPULATION */
    
    /*  populateColorOnFaces
        Takes a color and a list of vertices, then makes those vertices the 
        chosen color

        Inputs:
            color: THREE.Color
                The color to be put onto the faces
            vertices: list of ints corresponding to faces
                The vertices whose colors are to be changed
    */ 
    populateColorOnFaces(color, vertices) {
        const geometry = this.mesh.geometry;
        const colors = geometry.attributes.color;
    
        for (let i = 0; i < vertices.length; i++) {
            colors.setXYZ(vertices[i], color.r, color.g, color.b);
        }
    
        colors.needsUpdate = true;
    }

    /*  populateColor
        Takes a color and populates every face of the mesh with that color

        Inputs:
            color: THREE.Color
                The color to be put onto the faces
    */
    populateColor(color) {
        const geometry = this.mesh.geometry;
        const positions = geometry.attributes.position;
        const colors = geometry.attributes.color;
    
        for (let i = 0; i < positions.array.length; i++) {
            colors.setXYZ(i, color.r, color.g, color.b);
        }
    
        colors.needsUpdate = true;
    }
}