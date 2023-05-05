$(function () {
  const speakerDevices = document.getElementById("speaker-devices");
  const ringtoneDevices = document.getElementById("ringtone-devices");
  const outputVolumeBar = document.getElementById("output-volume");
  const inputVolumeBar = document.getElementById("input-volume");
  const volumeIndicators = document.getElementById("volume-indicators");
  const callButton = document.getElementById("button-call");
  const holdDiv = document.getElementById("hold");
  const outgoingCallHangupButton = document.getElementById("button-hangup-outgoing");
  const holdButton = document.getElementById("button-hold-call");
  const unholdButton = document.getElementById("button-unhold-call");
  const mergeButton = document.getElementById("button-merge-incoming");
  const callControlsDiv = document.getElementById("call-controls");
  const audioSelectionDiv = document.getElementById("output-selection");
  const getAudioDevicesButton = document.getElementById("get-devices");
  const logDiv = document.getElementById("log");
  const incomingCallDiv = document.getElementById("incoming-call");
  const incomingCallHangupButton = document.getElementById(
    "button-hangup-incoming"
  );
  const incomingCallAcceptButton = document.getElementById(
    "button-accept-incoming"
  );
  const incomingCallRejectButton = document.getElementById(
    "button-reject-incoming"
  );
  const phoneNumberInput = document.getElementById("phone-number");
  const incomingPhoneNumberEl = document.getElementById("incoming-number");
  const startupButton = document.getElementById("startup-button");

  let device;
  let token;

  // Event Listeners

  callButton.onclick = (e) => {
    e.preventDefault();
    makeOutgoingCall();
  };
  getAudioDevicesButton.onclick = getAudioDevices;
  speakerDevices.addEventListener("change", updateOutputDevice);
  ringtoneDevices.addEventListener("change", updateRingtoneDevice);


  // SETUP STEP 1:
  // Browser client should be started after a user gesture
  // to avoid errors in the browser console re: AudioContext
  startupButton.addEventListener("click", startupClient);

  // SETUP STEP 2: Request an Access Token
  async function startupClient() {
    console.log("Requesting Access Token...");

    try {
      const data = await $.getJSON("/token");
      console.log("Got a token.");
      token = data.token;
      setClientNameUI(data.identity);
      intitializeDevice();

    } catch (err) {
      console.log(err);
      console.log("An error occurred. See your browser console for more information.");
    }
  }

  // SETUP STEP 3:
  // Instantiate a new Twilio.Device
  function intitializeDevice() {

    //Clear local call data
    localStorage.clear();

    logDiv.classList.remove("hide");
    console.log("Initializing device");
    device = new Twilio.Device(token, {
      logLevel: 1,
      // Set Opus as our preferred codec. Opus generally performs better, requiring less bandwidth and
      // providing better audio quality in restrained network conditions.
      codecPreferences: ["opus", "pcmu"],
      //Allows for call waiting request
      allowIncomingWhileBusy: "true"
    });


    addDeviceListeners(device);

    // Device must be registered in order to receive incoming calls
    device.register();
  }

  // SETUP STEP 4:
  // Listen for Twilio.Device states
  function addDeviceListeners(device) {
    device.on("registered", function () {
      console.log("Twilio.Device Ready to make and receive calls!");
      callControlsDiv.classList.remove("hide");
    });

    device.on("error", function (error) {
      console.log("Twilio.Device Error: " + error.message);
    });

    device.on("incoming", handleIncomingCall);

    device.audio.on("deviceChange", updateAllAudioDevices.bind(device));

    // Show audio selection UI if it is supported by the browser.
    if (device.audio.isOutputSelectionSupported) {
      audioSelectionDiv.classList.remove("hide");
    }
  }

  // MAKE AN OUTGOING CALL

  async function makeOutgoingCall() {
    var params = {
      // get the phone number to call from the DOM
      To: phoneNumberInput.value,
    };

    if (device) {
      console.log(`Attempting to call ${params.To} ...`);

      // Twilio.Device.connect() returns a Call object
      const call = await device.connect({ params });

      console.log("## outgoing call object", call);
      holdButton.classList.remove("hide"); //unhide hold button
      // add listeners to the Call
      // "accepted" means the call has finished connecting and the state is now "open"
      call.on("accept", updateUIAcceptedOutgoingCall);
      call.on("disconnect", updateUIDisconnectedOutgoingCall);
      call.on("cancel", updateUIDisconnectedOutgoingCall);

      outgoingCallHangupButton.onclick = () => {
        console.log("Hanging up ...");
        call.disconnect();

      };

      holdButton.onclick = () => {
        onClickHoldButton(call.parameters.CallSid, params.To);
      };

    } else {
      console.log("Unable to make call.");
    }
  }


  //place user on hold or mute
  async function changeUserState(payload) {
    console.log("## User state change request payload", payload);

    $.ajax({
      type: 'POST',
      url: '/userstateupdate',
      data: payload,
      success: function (data) {
        console.log('## User state change Response:', data.status);
      },
      error: function (error) {
        console.error('## User state change Error:', error);
      }
    });

  }

  //merge users
  async function mergeCalls(payload) {
    console.log("## Merge calls request payload", payload);

    $.ajax({
      type: 'POST',
      url: '/mergecalls',
      data: payload,
      success: function (data) {
        console.log('## Merge calls Response:', data.status);
      },
      error: function (error) {
        console.error('## Merge calls Error:', error);
      }
    });
  }

  //get Sync map state
  async function getSyncStatus(token, callSID) {
    console.log("## get Sync call SID ", '_' + callSID);

    //initialize sync client
    const syncClient = new Twilio.Sync.Client(token);

    ///Subscribe to conference state updates

    //On map item addition
    await syncClient.map('_' + callSID).then(function (map) {

      map.on('itemAdded', function (item) {
        console.log('## item added');
        const data = item.item.descriptor.data;
        console.dir(JSON.stringify(data), { 'maxArrayLength': null });
        console.log('## key', item.item.descriptor.key);

        //store call status in local storage
        storeObjectInLocalStorage("callStatus", JSON.stringify(data));
      });

      //On map item updates
      map.on('itemUpdated', function (item) {
        console.log(`## item updated for ${item.item.descriptor.key}`);
        const data = item.item.descriptor.data;
        console.dir(JSON.stringify(data), { 'maxArrayLength': null });

        //if user has left the call
        if (data.StatusCallbackEvent == "participant-leave") {
          console.log("## participant left");
          deleteObjectInLocalStorage("callstatus"); //clear local call status

          return;
        }

        //get last set values in local storage for comparison
        const localCallStatus = getObjectFromLocalStorage("callStatus");
        console.log("## Local storage state: ", localCallStatus);
        console.log("## Hold state in local storage", localCallStatus.Hold);
        console.log("## Hold state in sync", data.Hold);

        //if call is placed on hold
        if (data.Hold == "true" && localCallStatus.Hold == 'false') {
          console.log('## Call is on hold');
          $(holdDiv).append("<p class='warning'>Your call has been placed on hold</p>");
          holdButton.classList.add("hide"); //hide hold button for this user
        }

        //if call hold is removed
        else if (data.Hold == "false" && localCallStatus.Hold == 'true') {
          console.log('## Hold removed');
          $(holdDiv).find("p").filter(":first").remove();
          holdButton.classList.remove("hide"); //hide hold button for this user
        }

        //override call status in local storage
        storeObjectInLocalStorage("callStatus", JSON.stringify(data));
      });

    });

  }

  function updateUIAcceptedOutgoingCall(call) {

    console.log("## outoing call event", call);
    console.log("## outoing to friendly name", call.customParameters.get('To'));
    //add call to local storage
    currentCallData = [{ callsid: call.parameters.CallSid, friendlyName: call.customParameters.get('To') }];
    storeObjectInLocalStorage("currentCalls", JSON.stringify(currentCallData));

    //get conf sync map status
    const syncStateOutgoingCall = getSyncStatus(token, call.parameters.CallSid);

    console.log("## Call in progress ...");
    callButton.disabled = true;
    outgoingCallHangupButton.classList.remove("hide");
    volumeIndicators.classList.remove("hide");
    holdButton.classList.remove("hide"); //unhide hold button
    bindVolumeIndicators(call);
  }

  function updateUIDisconnectedOutgoingCall() {
    console.log("## Call disconnected.");
    callButton.disabled = false;
    outgoingCallHangupButton.classList.add("hide");
    volumeIndicators.classList.add("hide");
    holdButton.classList.add("hide"); //hide hold button
    $(holdDiv).find("p").filter(":first").remove();

  }

  // HANDLE INCOMING CALL

  function handleIncomingCall(call) {
    console.log(`Incoming call from ${call.parameters.From}`);

    //show incoming call div and incoming phone number
    incomingCallDiv.classList.remove("hide");
    incomingPhoneNumberEl.innerHTML = call.parameters.From;

    //add event listeners for Accept, Reject, and Hangup buttons
    incomingCallAcceptButton.onclick = () => {
      acceptIncomingCall(call);
    };

    incomingCallRejectButton.onclick = () => {
      rejectIncomingCall(call);
    };

    incomingCallHangupButton.onclick = () => {
      hangupIncomingCall(call);
    };

    // add event listener to call object
    call.on("cancel", handleDisconnectedIncomingCall);
    call.on("disconnect", handleDisconnectedIncomingCall);
    call.on("reject", handleDisconnectedIncomingCall);
  }

  // ACCEPT INCOMING CALL

  function acceptIncomingCall(call) {

    const currentCalls = getObjectFromLocalStorage("currentCalls");
    console.log("## Current calls before accepting: ", currentCalls);

    //place existing call on hold before accepting call in waiting
    if (currentCalls != null) {
      onClickHoldButton(currentCalls[0].callsid, currentCalls[0].friendlyName);
      mergeButton.classList.remove("hide"); //show merge button

      mergeButton.onclick = () => {
        onClickMergeButton(call.parameters.CallSid, currentCalls[0].friendlyName);
      };
    }

    call.accept();


    console.log("## Incoming call object: ", call);

    //add call to local storage
    currentCallData = [{ callsid: call.parameters.CallSid, friendlyName: call.parameters.From.split(":")[1] }];
    storeObjectInLocalStorage("currentCalls", JSON.stringify(currentCallData));

    //get sync map status
    const syncStateIncomingCall = getSyncStatus(token, call.parameters.CallSid);

    //update UI
    console.log("Accepted incoming call.");
    holdButton.classList.remove("hide"); //unhide hold button
    incomingCallAcceptButton.classList.add("hide");
    incomingCallRejectButton.classList.add("hide");
    incomingCallHangupButton.classList.remove("hide");

    holdButton.onclick = () => {
      onClickHoldButton(call.parameters.CallSid, call.parameters.From.split(":")[1]);
    };
  }

  //Place call on hold
  async function onClickHoldButton(callSid, targetNumber) {
    console.log("## Hold button clicked ...");

    const payload = {
      target: targetNumber,
      callSid: callSid,
      userStateType: "hold",
      userStateValue: "true"
    };
    await changeUserState(payload);
    holdButton.classList.add("hide"); //hide hold button
    unholdButton.classList.remove("hide"); //show unhold button

    unholdButton.onclick = () => {
      onClickUnHoldButton(callSid, targetNumber);
    };

  }

  //Place call on hold
  async function onClickUnHoldButton(callSid, targetNumber) {
    console.log("## UnHold button clicked ...");

    const payload = {
      target: targetNumber,
      callSid: callSid,
      userStateType: "hold",
      userStateValue: "false"
    };
    await changeUserState(payload);
    holdButton.classList.remove("hide"); //show hold button
    unholdButton.classList.add("hide"); //hide unhold button    

  }

  //Merge calls
  async function onClickMergeButton(callSid, targetNumber) {
    console.log("## Merge button clicked ...");

    const payload = {
      targetFriendlyName: targetNumber,
      hostCallSid: callSid
    };

    await mergeCalls(payload);

    mergeButton.classList.add("hide"); //hide merge button

  }
  // REJECT INCOMING CALL

  function rejectIncomingCall(call) {
    call.reject();
    console.log("## Rejected incoming call");
    resetIncomingCallUI();
  }

  // HANG UP INCOMING CALL

  function hangupIncomingCall(call) {
    call.disconnect();
    console.log("## Hanging up incoming call");
    resetIncomingCallUI();
  }

  // HANDLE CANCELLED INCOMING CALL

  function handleDisconnectedIncomingCall() {
    console.log("## Incoming call handler.");
    resetIncomingCallUI();
  }

  // MISC USER INTERFACE

  // Activity log
  // function log(message) {
  //   logDiv.innerHTML += `<p class="log-entry">&gt;&nbsp; ${message} </p>`;
  //   logDiv.scrollTop = logDiv.scrollHeight;
  //   console.log(message);
  // }

  function setClientNameUI(clientName) {
    var div = document.getElementById("client-name");
    div.innerHTML = `Your client name: <strong>${clientName}</strong>`;
  }

  function resetIncomingCallUI() {
    incomingPhoneNumberEl.innerHTML = "";
    incomingCallAcceptButton.classList.remove("hide");
    incomingCallRejectButton.classList.remove("hide");
    incomingCallHangupButton.classList.add("hide");
    incomingCallDiv.classList.add("hide");
    holdButton.classList.add("hide"); //hide hold button
    $(holdDiv).find("p").filter(":first").remove();

  }

  // AUDIO CONTROLS

  async function getAudioDevices() {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    updateAllAudioDevices.bind(device);
  }

  function updateAllAudioDevices() {
    if (device) {
      updateDevices(speakerDevices, device.audio.speakerDevices.get());
      updateDevices(ringtoneDevices, device.audio.ringtoneDevices.get());
    }
  }

  function updateOutputDevice() {
    const selectedDevices = Array.from(speakerDevices.children)
      .filter((node) => node.selected)
      .map((node) => node.getAttribute("data-id"));

    device.audio.speakerDevices.set(selectedDevices);
  }

  function updateRingtoneDevice() {
    const selectedDevices = Array.from(ringtoneDevices.children)
      .filter((node) => node.selected)
      .map((node) => node.getAttribute("data-id"));

    device.audio.ringtoneDevices.set(selectedDevices);
  }

  function bindVolumeIndicators(call) {
    call.on("volume", function (inputVolume, outputVolume) {
      var inputColor = "red";
      if (inputVolume < 0.5) {
        inputColor = "green";
      } else if (inputVolume < 0.75) {
        inputColor = "yellow";
      }

      inputVolumeBar.style.width = Math.floor(inputVolume * 300) + "px";
      inputVolumeBar.style.background = inputColor;

      var outputColor = "red";
      if (outputVolume < 0.5) {
        outputColor = "green";
      } else if (outputVolume < 0.75) {
        outputColor = "yellow";
      }

      outputVolumeBar.style.width = Math.floor(outputVolume * 300) + "px";
      outputVolumeBar.style.background = outputColor;
    });
  }

  // Update the available ringtone and speaker devices
  function updateDevices(selectEl, selectedDevices) {
    selectEl.innerHTML = "";

    device.audio.availableOutputDevices.forEach(function (device, id) {
      var isActive = selectedDevices.size === 0 && id === "default";
      selectedDevices.forEach(function (device) {
        if (device.deviceId === id) {
          isActive = true;
        }
      });

      var option = document.createElement("option");
      option.label = device.label;
      option.setAttribute("data-id", id);
      if (isActive) {
        option.setAttribute("selected", "selected");
      }
      selectEl.appendChild(option);
    });
  }


  function storeObjectInLocalStorage(key, object) {
    localStorage.setItem(key, object);
  }

  function getObjectFromLocalStorage(key) {
    const objectString = localStorage.getItem(key);
    return JSON.parse(objectString);
  }

  function deleteObjectInLocalStorage(key) {
    localStorage.removeItem(key);
    console.log(`## ${key} removed from local storage`);
  }

  function removeCallFromLocalStorage(callSidToRemove) {
    //Get current call SIDs from call status
    const currentCalls = getObjectFromLocalStorage('currentCalls') || [];

    // Find the index of the call SID to remove
    const index = currentCalls.indexOf(callSidToRemove);

    // If the call SID was found, remove it from the array
    if (index !== -1) {
      currentCalls.splice(index, 1);
      storeObjectInLocalStorage("currentCalls", JSON.stringify(currentCalls))
    }
  }





});