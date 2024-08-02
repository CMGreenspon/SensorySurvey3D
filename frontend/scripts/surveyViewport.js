import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

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

const brushMaterial = new THREE.MeshStandardMaterial( {
    color: 0xEC407A,
    roughness: 0.75,
    metalness: 0,
    transparent: true,
    opacity: 0.5,
    premultipliedAlpha: true,
    emissive: 0xEC407A,
    emissiveIntensity: 0.5,
} );

class EventQueue {
    /*  constructor
        Sets up the objects needed to operate the queue

        Inputs:
            queueLength: int
                The maximum number of events to be kept in the queue
    */
    constructor(queueLength) {
        this.queueLength = queueLength;
        this.queuePosition = 0;
        this.queue = [];
    }

    /*  push
        Pushes a new event onto the queue, removing all elements after
        the current queuePosition. Culls events off of the front
        if the length of the queue exceeds the queueLength

        Inputs:
            eventType: str
                The type of event to be added to the queue
            vertices: list of int
                The vertices affected by the event
    */
    push(eventType, vertices) {
        this.queue.splice(this.queue.length - this.queuePosition);
        this.queue.push([eventType, vertices]);

        if (this.queue.length > this.queueLength) {
            this.queue.slice(this.queue.length - this.queueLength, 
                this.queueLength);
        }
    }

    /*  next
        Gives the user the next event in the queue starting from the
        end, according to the current queuePosition

        Outputs:
            output: list[2] of str and list of int
    */
    next() {
        return this.queue.slice(
            this.queue.length - this.queuePosition
            ).pop();
    }

    /*  reset
        Resets the queuePosition and queue
    */
    reset() {
        this.queuePosition = 0;
        this.queue = [];
    }
}

export class CameraController {
    /*  constructor
        Takes a controls object to allow the camera controller to manipulate it

        Inputs:
            controls: THREE.OrbitControls
                The controller object to be manipulated by the controller
            rendererElement:
                The renderer element of the SurveyViewport object
            minZoom: int
                The minimum zoom level
            maxZoom: int
                The maximum zoom level
    */
    constructor(controls, rendererElement, minZoom, maxZoom) {
        this.controls = controls;
        this.camera = controls.object;
        this.rendererElement = rendererElement;
        this.minZoom = minZoom;
        this.maxZoom = maxZoom;
        this.sliderElement = null;

        const that = this;

        this.rendererElement.onwheel = function(event) {
            if (event.deltaY > 0) {
                this.decrementZoom();
            }
            else if (event.deltaY < 0) {
                this.incrementZoom()
            }

            if (this.sliderElement) {
                this.sliderElement.value = this.camera.zoom;
            }
        }.bind(that);

        this.reset();
    }

    /*  capZoom
        Checks the current zoom value against the min and max, and sets the
        value to be within bounds if outside
    */
    capZoom() {
        this.camera.zoom = Math.min(Math.max(parseInt(this.camera.zoom), 
                                    this.minZoom), 
                                    this.maxZoom);
    }

    /*  incrementZoom
        Increments the zoom value by 1, then updates the screen

        Outputs:
            this.camera.zoom: int
                The current zoom value
    */
    incrementZoom() {
        this.camera.zoom += 1
        this.capZoom();
        this.camera.updateProjectionMatrix();
        return this.camera.zoom;
    }
    
    /*  decrementZoom
        Decrements the zoom value by 1, then updates the screen

        Outputs:
            this.camera.zoom: int
                The current zoom value
    */
    decrementZoom() {
        this.camera.zoom -= 1;
        this.capZoom();
        this.camera.updateProjectionMatrix();
        return this.camera.zoom;
    }

    /*  setZoom
        Sets the zoom to a given value, then updates the screen

        Inputs:
            value: int
                The value the zoom should be set to

        Outputs:
            this.camera.zoom: int
                The current zoom value
    */
    setZoom(value) {
        this.camera.zoom = value;
        this.capZoom();
        this.camera.updateProjectionMatrix();
        return this.camera.zoom;
    }

    /*  reset
        Resets the camera value to the minZoom value, then updates the screen

        Outputs:
            this.camera.zoom: int
                The current zoom value
    */
    reset() {
        this.controls.reset();
        this.setZoom(this.minZoom);
        return this.camera.zoom;
    }

    /*  createZoomSlider
        Appends two buttons and a slider as children to a given parentElement
        and assigns them behvior allowing the user to increment and
        decrement the zoom

        Inputs:
            parentElement: element
                The element to which the children will be appended
    */
    createZoomSlider(parentElement) {
        const zoomOut = document.createElement("button");
        zoomOut.id = "zoomOut";
        zoomOut.innerHTML = "-";
        zoomOut.onpointerup = function() {
            var value = this.decrementZoom();
            document.getElementById("zoomSlider").value = value;
        }.bind(this);

        const zoomIn = document.createElement("button");
        zoomIn.id = "zoomIn";
        zoomIn.innerHTML = "+";
        zoomIn.onpointerup = function() {
            var value = this.incrementZoom();
            document.getElementById("zoomSlider").value = value;
        }.bind(this);

        const zoomSlider = document.createElement("input");
        zoomSlider.type = "range";
        zoomSlider.value = this.camera.zoom;
        zoomSlider.min = this.minZoom.toString();
        zoomSlider.max = this.maxZoom.toString();
        zoomSlider.step = "1";
        zoomSlider.id = "zoomSlider";
        zoomSlider.style.width = "192px";
        zoomSlider.oninput = function() {
                var value = document.getElementById("zoomSlider").value;
                this.setZoom(value);
        }.bind(this);

        parentElement.appendChild(zoomOut);
        parentElement.appendChild(zoomSlider);
        parentElement.appendChild(zoomIn); 

        this.sliderElement = zoomSlider;
    }
}

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
    constructor(parentElement, backgroundColor, defaultColor, eventQueueLength) {
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
        this.controls.enableZoom = false;
        this.controlState = controlStates.ORBIT;
        this.toOrbit();
        
        this.pointer = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.raycaster.firstHitOnly = true;

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

        // Set up other important objects
        this.mesh = null;
        this.currentModelFile = null;
        this.defaultColor = defaultColor;

        this.brushSize = 0;
        this.brushMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 40),
                                        brushMaterial);
        this.scene.add(this.brushMesh);

        this.eventQueue = new EventQueue(eventQueueLength);

        this.pointerDownViewport = true;

        // Set event listeners
        window.onresize = this.onWindowResize.bind(this);
        document.onpointermove = this.onPointerMove.bind(this);
        document.onpointerup = this.onPointerUp.bind(this);
        this.renderer.domElement.onpointerdown = 
            this.onPointerDownViewport.bind(this);
    }

    /*  animate
        Queues the next frame and handles control inputs depending on the 
        current controlState. Must be called once to begin animating the scene.
    */
    animate() {
        // Queue the next frame
        requestAnimationFrame(this.animate.bind(this));
        
        // Update the controls
        this.controls.update();

        // Change update behavior depending on current controlState
        switch(this.controlState) {
            case controlStates.ORBIT:
                break;
            case controlStates.PAN:
                break;
            case controlStates.PAINT:
                if (this.pointerDownViewport) {
                    
                    this.populateColorOnVertices(new THREE.Color("#ffffff"),
                                                    vertices);
                }
                break;
            case controlStates.ERASE:
                break;
        }

        // Render the scene as seen from the camera
        this.renderer.render(this.scene, this.camera);
    }

    /* CONTROLS */

    /*  toOrbit
        Configures the control object to allow the user to rotate the camera
        with the left mouse button or a single-finger touch. Also updates the 
        controlState object to "camera".
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
        Configures the control object to allow the user to pan the camera with 
        the left mouse button or a single-finger touch. Also updates the 
        controlState object to "panning".
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
        var rect = this.parentElement.getBoundingClientRect();
        var width = parseInt(style.getPropertyValue("width"));
        var height = parseInt(style.getPropertyValue("height"));
        this.pointer.x = (((event.clientX - rect.left) / width)
                            * 2 - 1);
	    this.pointer.y = -((event.clientY - rect.top) / height) 
                            * 2 + 1;
    }

    /*  onPointerDownViewport
        Behavior for when the user's pointer goes down on the viewport
    */
    onPointerDownViewport() {
        this.pointerDownViewport = true;
    }

    /*  onPointerUp
        Behavior for when the user's pointer goes up anywhere on the document
    */
    onPointerUp() { 
        this.pointerDownViewport = false;
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

        this.currentModelFile = null;
    }

    /*  unloadCurrentMesh
        Unloads the current mesh
    */
    unloadCurrentMesh() {
        this.scene.remove(this.mesh);
        this.currentModelFile = null;
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
        if (filename != this.currentModelFile) {
            return new Promise(function(resolve, reject) {
                var modelPath = "/3dmodels/" + filename;
        
                // Load the model, and pull the geometry out and create a mesh 
                // from that. This step is necessary because vertex colors 
                // only work with three.js geometry
                var loader = new GLTFLoader();
                loader.load(modelPath, function(gltf) {
                    var geometry = gltf.scene.children[0].geometry.toNonIndexed();
                    const count = geometry.attributes.position.count;
                    geometry.setAttribute('color', new THREE.BufferAttribute(
                                            new Float32Array(count * 3), 3));
                    that.mesh = new THREE.Mesh(geometry, meshMaterial);
                    that.mesh.geometry.computeBoundsTree();
                    that.scene.add(that.mesh);
                    that.currentModelFile = filename;
                    that.populateColor(that.defaultColor);
                    resolve();
                }, undefined, function() {
                    alert("Could not load model " + filename 
                            + ", please notify experiment team.")
                    reject();
                });
            }.bind(that))
        }
        else {
            this.populateColor(this.defaultColor);
            return null;
        }
    }

    /*  replaceCurrentMesh
        Replaces the current mesh object with a new mesh
    */
    replaceCurrentMesh(filename) {
        return;
        //TODO - implement replaceCurrentMesh
    }

    /* MESH MANIPULATION */

    /*  getVerticesFromFaces
        Iterates through a list of faces received from a raycast and returns
        all vertices which make up those faces

        Inputs:
            faces: list of faces
                The faces from which the vertices will be extracted

        Outputs:
            vertices: list of int
                A list of the vertex numbers which make up the faces
    */
    getVerticesFromFaces(faces) {
        var vertices = [];
        for (var i = 0; i < faces.length; i++) {
            vertices.push(faces[i].a, faces[i].b, faces[i].c);
        }
        return vertices;
    }
    
    /*  populateColorOnFaces
        Takes a color and a list of vertices, then makes those vertices the 
        chosen color

        Inputs:
            color: THREE.Color
                The color to be put onto the faces
            vertices: list of ints corresponding to vertices
                The vertices whose colors are to be changed
    */ 
    populateColorOnVertices(color, vertices) {
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