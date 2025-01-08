import * as THREE from 'three';
import * as VP from '../scripts/surveyViewport'
import * as SVY from '../scripts/survey'
import * as COM from '../scripts/common'

document.title = "Participant - SensorySurvey3D"

var viewport;
var surveyManager;
var surveyTable;
var cameraController;

var waitingInterval;
var submissionTimeoutInterval;
var updateServerInterval;

/* WEBSOCKET */

const socketURL = COM.socketURL + "participant-ws";
var socket;

/**
 * Connect to the survey's backend via websocket to enable data transfer. 
 * Surveys are unable to start unless the backend is connected as the 
 * survey begins. Attempts to reconnect every second if not connected.
 */
function socketConnect() {
    socket = new WebSocket(socketURL);

	socket.onopen = function() { 
		console.log("Socket connected!") 
		updateServerInterval = setInterval(function() {
			if (surveyManager.survey) {
				surveyManager.updateSurveyOnServer(socket);
			}
		}, 1000);
	};

	socket.onmessage = function(event) {
		const msg = JSON.parse(event.data);

		switch (msg.type) {
			case "survey":
				const percepts = []
				for (let i = 0; i < msg.survey.percepts.length; i++) {
					var percept = msg.survey.percepts[i];
					percept = new SVY.Percept(percept.vertices, percept.model,
						percept.intensity, percept.naturalness,
						percept.pain, percept.type, percept.name);
					percepts.push(percept);
				}
				surveyManager.survey = new SVY.Survey(
					msg.survey.participant,
					msg.survey.config,
					msg.survey.date,
					msg.survey.startTime,
					msg.survey.endTime,
					percepts
				);
				if (surveyManager.survey.config.hideScaleValues) {
					document.getElementById("intensityValue").innerHTML = "";
					document.getElementById("naturalnessValue").innerHTML = "";
					document.getElementById("painValue").innerHTML = "";
				}
				if (waitingInterval) {
					const modelSelect = document.getElementById("modelSelect");
					populateSelect(modelSelect, 
									Object.keys(msg.survey.config.models));
					populateSelect(document.getElementById("typeSelect"), 
									msg.survey.config.typeList);
					viewport.replaceCurrentMesh(surveyManager.survey.config.
										models[modelSelect.value]);
					cameraController.reset();
					endWaiting();
					if (percepts) {
						surveyTable.update(surveyManager.survey);
						const eyeButtons = 
							document.getElementsByClassName("eyeButton");
						if (eyeButtons[0]) {
							eyeButtons[0].dispatchEvent(new Event("pointerup"));
						}
					}
				}
				break;
			case "submitResponse":
				if (msg.success) {
					surveyManager.clearSurvey();
					surveyTable.clear();
					viewport.unloadCurrentMesh();
					startWaiting();
					endSubmissionTimeout(msg.success);
				}
				else if (submissionTimeoutInterval) {
					endSubmissionTimeout(msg.success);
				}
				else {
					alert("Received submitSuccess without making a submission!");
				}
				break;
		}
	}

	socket.onclose = function() {
		console.log("Connection to websocket @ ", socketURL, 
					" closed. Attempting reconnection in 1 second.");
		clearInterval(updateServerInterval);
		setTimeout(function() {
			socketConnect();
		}, 1000);
	}

	socket.onerror = function(error) {
		console.error("Websocket error: ", error.message);
		socket.close();
	}
}

/* USER INTERFACE */

/**
 * Find all button elements and enable or disable them, depending on input
 * @param {boolean} enabled - Determines if the buttons are enabled
 */
function toggleButtons(enabled) {
	const sidebar = document.getElementById("sidebar");

	var buttons = sidebar.querySelectorAll("button");
	for (var i = 0; i < buttons.length; i++) {
		buttons[i].disabled = !enabled;
		if (!enabled) {
			buttons[i].style.pointerEvents = "none";
		}
		else {
			buttons[i].style.pointerEvents = "auto";
		}
	}
}

/**
 * Enables or disables the undo and redo buttons depending on input
 * @param {boolean} enabled - Determines if the buttons are enabled
 */
function toggleUndoRedo(enabled) {
	document.getElementById("undoButton").disabled = !enabled;
	document.getElementById("redoButton").disabled = !enabled;
}

/**
 * Display the projected field editor menu
 */
function openFieldEditor() {
	toggleUndoRedo(false);
	COM.openSidebarTab("fieldTab");
}

/**
 * Display the quality editor menu
 */
function openQualityEditor() {
	toggleUndoRedo(false);
	COM.openSidebarTab("qualifyTab");
}

/**
 * Display the list menu
 */
function openList() {
	document.getElementById("orbitButton").dispatchEvent(
		new Event("pointerup"));
	surveyManager.survey.renamePercepts();
	surveyTable.update(surveyManager.survey);
	toggleUndoRedo(true);
	COM.openSidebarTab("listTab");
}

/**
 * Clear all children of a <select> element, then use a given list to create 
 * <option> elements for each element in the list as children of the select 
 * element 	
 * @param {Element} selectElement - The <select> element which the options 
 * 		should be childen of
 * @param {Array} optionList - The names of each option to be added to the 
 * 		selectElement
 */
function populateSelect(selectElement, optionList) {
	selectElement.innerHTML = "";

	for (var i = 0; i < optionList.length; i++) {
		const newOption = document.createElement("option");
        newOption.innerHTML = (optionList[i].charAt(0).toUpperCase() 
								+ optionList[i].slice(1));
        newOption.value = optionList[i];

        selectElement.appendChild(newOption);
	}
}

/**
 * Put the data from the given projected field into the editor UI
 * @param {ProjectedField} field - the ProjectedField whose data is to
 * 		be displayed
 */
function populateFieldEditor(field) {
	const modelSelect = document.getElementById("modelSelect");
	if (field.model) {
		modelSelect.value = field.model;
		if (viewport.replaceCurrentMesh(
			surveyManager.survey.config.models[modelSelect.value],
			field.vertices, new THREE.Color("#abcabc"))) {
			cameraController.reset();
		}
	}

	surveyManager.currentField = field;
}

/**
 * Take the values in the relevant editor elements and save them to the
 * corresponding fields in the surveyManager's currentField
 */
function saveFieldFromEditor() {
	const modelSelect = document.getElementById("modelSelect");
	surveyManager.currentField.model = modelSelect.value;

	const vertices = viewport.getNonDefaultVertices(viewport.currentMesh);
	surveyManager.currentField.vertices = vertices;
}

/**
 * Take a Quality and populate its data in the quality editor
 * @param {Quality} quality - the quality whose data will be populated in the
 * 		editor
 */
function populateQualityEditor(quality) {
	const typeSelect = document.getElementById("typeSelect");
	if (quality.type) {
		typeSelect.value = quality.type;
	}

	switch(quality.depth) {
		case "belowSkin":
			document.getElementById("belowSkinRadio").checked = true;
			break;
		case "atSkin":
			document.getElementById("atSkinRadio").checked = true;
			break;
		case "aboveSkin":
			document.getElementById("aboveSkinRadio").checked = true;
			break;
	}

	const intensitySlider = document.getElementById("intensitySlider");
	intensitySlider.value = quality.intensity;
	intensitySlider.dispatchEvent(new Event("input"));

	const naturalnessSlider = document.getElementById("naturalnessSlider");
	naturalnessSlider.value = quality.naturalness;
	naturalnessSlider.dispatchEvent(new Event("input"));

	const painSlider = document.getElementById("painSlider");
	painSlider.value = quality.pain;
	painSlider.dispatchEvent(new Event("input"));
}

/**
 * Take the values in the relevant editor elements and save them to the
 * corresponding fields in the surveyManager's currentQuality
 */
function saveQualityFromEditor() {
	const intensitySlider = document.getElementById("intensitySlider");
	surveyManager.currentQuality.intensity = parseFloat(intensitySlider.value);

	const naturalnessSlider = document.getElementById("naturalnessSlider");
	surveyManager.currentQuality.naturalness = parseFloat(
		naturalnessSlider.value);

	const painSlider = document.getElementById("painSlider");
	surveyManager.currentQuality.pain = parseFloat(painSlider.value);

	const depthSelected = 
		document.querySelector("input[name=\"skinLevelRadioSet\"]:checked");
	surveyManager.currentQuality.depth = depthSelected.value;

	const typeSelect = document.getElementById("typeSelect");
	surveyManager.currentQuality.type = typeSelect.value;
}

/*  startWaiting
	Sets the waitingInterval variable to a new interval which polls the
	websocket for a new survey. Also opens the waitingTab
*/
function startWaiting() {
	waitingInterval = setInterval(function() {
		if (socket.readyState == WebSocket.OPEN) {
			socket.send(JSON.stringify({type: "waiting"}));
		}
	}, 1000);
	COM.openSidebarTab("waitingTab");
}

/*  endWaiting
	Clears the waitingInterval, and opens the tab for the new survey
*/
function endWaiting() {
	waitingInterval = clearInterval(waitingInterval);
	COM.openSidebarTab("listTab");
}

/*  startSubmissionTimeout
	Sets an interval which times out after 5 seconds, alerting the user
	that the submission did not go through
*/
function startSubmissionTimeout() {
	var timeoutCount = 0;
	submissionTimeoutInterval = setInterval(function() {
		if (timeoutCount == 10) {
			endSubmissionTimeout(false);
		}
		timeoutCount += 1;
	}.bind(timeoutCount), 500);
}

/*  endSubmissionTimeout
	Clears the timeout interval, displays a successful or unsuccessful
	alert for the user, and restores button functionality

	Inputs:
		success: bool
			A boolean representing if the submission was a success, determines
			which alert is displayed
*/
function endSubmissionTimeout(success) {
	submissionTimeoutInterval = clearInterval(submissionTimeoutInterval);

	if (success) {
		alert("Submission was successful!")
	}
	else {
		alert("Submission failed!");
	}

	toggleButtons(false);
}

/* BUTTON CALLBACKS */

/**
 * Request the surveyManager to submit the survey. Resets the interface and 
 * starts the wait for a new survey to begin.
 */
function submitCallback() {
	if (surveyManager.submitSurveyToServer(socket)) {
		toggleButtons(true);
		startSubmissionTimeout();
	}
	else {
		alert("Survey submission failed -- socket is not connected!");
	}
}

/**
 * Loads a given field and opens the tab for it to be edited
 * @param {ProjectedField} field - the field to be edited
 */
function editFieldCallback(field) {
	populateFieldEditor(field);
	openFieldEditor();
}

/**
 * Loads a given field, allowing it to be viewed in the viewport
 * @param {ProjectedField} field - the field to be viewed
 */
function viewFieldCallback(field) {
	populateFieldEditor(field);
}

/**
 * Populates the quality editor with a given Quality's data, then opens the 
 * quality editor menu
 * @param {ProjectedField} field - the projected field which has the quality to 
 * 		be edited as one of its "qualities"
 * @param {Quality} quality - the quality to be edited 
 */
function editQualityCallback(field, quality) {
	viewFieldCallback(field);
	populateQualityEditor(field, quality);
	openQualityEditor();
}

/**
 * Add a quality to the given field, then open the quality editor to edit
 * that new quality
 * @param {ProjectedField} field 
 */
function addQualityCallback(field) {
	field.addQuality();
	editQualityCallback(field, field.qualities[field.qualities.length - 1]);
}

/**
 * Add a new ProjectedField, then open the edit menu for that field. Set the 
 * model and type values using whatever values were previously selected
 */
function addFieldCallback() {
	surveyManager.survey.addField();
	const fields = surveyManager.survey.projectedFields;
	const newField = fields[fields.length - 1];

	const modelSelect = document.getElementById("modelSelect");
	newField.model = modelSelect.value;

	const typeSelect = document.getElementById("typeSelect");
	newField.type = typeSelect.value; 

	editFieldCallback(newField);
}

/**
 * Finish working with the surveyManager's currentField and return to the 
 * main menu
 */
function fieldDoneCallback() {
	saveFieldFromEditor();
	surveyManager.currentField = null;
	openList();
}

/**
 * Finish working with the surveyManager's currentField and return to the 
 * main menu
 */
function qualifyDoneCallback() {
	saveQualityFromEditor();
	surveyManager.currentQuality = null;
	openList();
}

/**
 * Return to the list without saving changes from the current editor
 */
function cancelCallback() {
	openList();
}

/**
 * Delete the currentField from the current survey
 */
function fieldDeleteCallback() {
	// TODO - maybe add a confirm dialogue to this step?
	surveyManager.survey.deleteField(surveyManager.currentField);
	openList();
}

/**
 * Delete the currentField from the current survey
 */
function qualifyDeleteCallback() {
	// TODO - maybe add a confirm dialogue to this step?
	surveyManager.survey.currentField.deleteQuality(
		surveyManager.currentQuality);
	openList();
}

/**
 * Call for the model corresponding to the selected option to be loaded
 */
function modelSelectChangeCallback() {
	const modelSelect = document.getElementById("modelSelect");
	viewport.replaceCurrentMesh(
		surveyManager.survey.config.models[modelSelect.value]);
	cameraController.reset();
}

/**
 * Update the drawing color on the mesh to reflect the newly selected type
 */
function typeSelectChangeCallback() {
	const typeSelect = document.getElementById("typeSelect");
	// TODO - take the value of typeSelect and use it to change the color on the mesh
}

/**
 * Call for the viewport to "undo" the last action
 */
function undoCallback() {
	viewport.undo();
}

/**
 * Call for the viewport to "redo" the next action
 */
function redoCallback() {
	viewport.redo();
}

/* STARTUP CODE */

window.onload = function() {
    // Initialize required classes
    viewport = new VP.SurveyViewport(document.getElementById("3dContainer"),
										new THREE.Color(0xffffff),
										new THREE.Color(0x535353),
										20);

	cameraController = new VP.CameraController(viewport.controls, 
		viewport.renderer.domElement, 2, 20);
	cameraController.createZoomSlider(document.getElementById(
		"cameraControlContainer"));
	cameraController.createCameraReset(document.getElementById(
		"cameraControlContainer"));

    surveyManager = new SVY.SurveyManager(); 

	surveyTable = new SVY.SurveyTable(document.getElementById("senseTable"), 
										true, 
										viewFieldCallback, 
										editFieldCallback,
										editQualityCallback,
										addQualityCallback
									);

    // Start the websocket
    socketConnect();
	startWaiting();

	/* ARRANGE USER INTERFACE */
	COM.placeUI(COM.uiPositions.LEFT, COM.uiPositions.TOP);
	toggleEditorTabs();

    /* EVENT LISTENERS */
	const newFieldButton = document.getElementById("newFieldButton");
	newFieldButton.onpointerup = addFieldCallback;

	const submitButton = document.getElementById("submitButton");
	submitButton.onpointerup = submitCallback;

	const orbitButton = document.getElementById("orbitButton");
	orbitButton.onpointerup = function() {
		viewport.toOrbit();
		COM.activatePaletteButton("orbitButton");
	}

	const panButton = document.getElementById("panButton");
	panButton.onpointerup = function() {
		viewport.toPan();
		COM.activatePaletteButton("panButton");
	}

	const paintButton = document.getElementById("paintButton");
	paintButton.onpointerup = function() {
		viewport.toPaint();
		COM.activatePaletteButton("paintButton");
	}

	const eraseButton = document.getElementById("eraseButton");
	eraseButton.onpointerup = function() {
		viewport.toErase();
		COM.activatePaletteButton("eraseButton");
	}

	const brushSizeSlider = document.getElementById("brushSizeSlider");
	brushSizeSlider.oninput = function() {
		document.getElementById("brushSizeValue").innerHTML = 
		(brushSizeSlider.value / brushSizeSlider.max).toFixed(2);
		viewport.brushSize = brushSizeSlider.value;
	}
	brushSizeSlider.dispatchEvent(new Event("input"));

	const drawTabButton = document.getElementById("drawTabButton");
	const qualifyTabButton = document.getElementById("qualifyTabButton");
	drawTabButton.onpointerup = function() {
		
		drawTabButton.classList.add('active');
		qualifyTabButton.classList.remove('active');
	}
	qualifyTabButton.onpointerup = function() {
		COM.openSidebarTab("qualifyTab");
		drawTabButton.classList.remove('active');
		qualifyTabButton.classList.add('active');
	}

	const fieldDoneButton = document.getElementById("fieldDoneButton");
	fieldDoneButton.onpointerup = fieldDoneCallback;

	const fieldCancelButton = document.getElementById("fieldCancelButton");
	fieldCancelButton.onpointerup = cancelCallback;

	const fieldDeleteButton = document.getElementById("fieldDeleteButton");
	fieldDeleteButton.onpointerup = fieldDeleteCallback;

	const qualifyDoneButton = document.getElementById("qualifyDoneButton");
	qualifyDoneButton.onpointerup = qualifyDoneCallback;

	const qualifyCancelButton = document.getElementById("qualifyCancelButton");
	qualifyCancelButton.onpointerup = cancelCallback;

	const qualifyDeleteButton = document.getElementById("qualifyDeleteButton");
	qualifyDeleteButton.onpointerup = qualifyDeleteCallback;

	const modelSelect = document.getElementById("modelSelect");
	modelSelect.onchange = modelSelectChangeCallback;

	const typeSelect = document.getElementById("typeSelect");
	typeSelect.onchange = typeSelectChangeCallback;

	const undoButton = document.getElementById("undoButton");
	undoButton.onpointerup = undoCallback;

	const redoButton = document.getElementById("redoButton");
	redoButton.onpointerup = redoCallback;

	const intensitySlider = document.getElementById("intensitySlider");
	intensitySlider.oninput = function() {
		if (surveyManager.survey 
			&& !surveyManager.survey.config.hideScaleValues) {
			document.getElementById("intensityValue").innerHTML = 
				intensitySlider.value;
		}
	}
	intensitySlider.dispatchEvent(new Event("input"));

	const naturalnessSlider = document.getElementById("naturalnessSlider");
	naturalnessSlider.oninput = function() {
		if (surveyManager.survey 
			&& !surveyManager.survey.config.hideScaleValues) {
			document.getElementById("naturalnessValue").innerHTML = 
				naturalnessSlider.value;
		}
		
	}
	naturalnessSlider.dispatchEvent(new Event("input"));

	const painSlider = document.getElementById("painSlider");
	painSlider.oninput = function() {
		if (surveyManager.survey 
				&& !surveyManager.survey.config.hideScaleValues) {
			document.getElementById("painValue").innerHTML = painSlider.value;
		}
	}
	painSlider.dispatchEvent(new Event("input"));

	toggleUndoRedo(true);
	viewport.animate();
}