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
    logDiv.classList.remove("hide");
    console.log("Initializing device");
    device = new Twilio.Device(token, {
      logLevel: 1,
      // Set Opus as our preferred codec. Opus generally performs better, requiring less bandwidth and
      // providing better audio quality in restrained network conditions.
      codecPreferences: ["opus", "pcmu"],
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
        console.log("## Hold button clicked ...");

        const payload = {
          target: params.To,
          callSid: call.parameters.CallSid
        };
        holdCall(payload);
      };

    } else {
      console.log("Unable to make call.");
    }
  }


  //place call on hold
  async function holdCall(payload) {
    console.log("## hold request payload", payload);

    $.ajax({
      type: 'POST',
      url: '/hold',
      data: payload,
      success: function (data) {
        console.log('## Hold Response:', data);
      },
      error: function (error) {
        console.error('## Hold Error:', error);
      }
    });

    // const holdResp = await $.post("/hold", payload);
    // console.log("## Hold response", holdResp);

    //Add call to update participant API call to place call on hold

  }

  //get Sync map state
  async function getSyncStatus(token, callSID) {
    console.log("## get Sync call SID ", '_' + callSID);

    //initialize sync client
    const syncClient = new Twilio.Sync.Client(token);
    // console.log("## syncClient: ", syncClient);

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
        console.log('## item updated');
        const data = item.item.descriptor.data;
        console.dir(JSON.stringify(data), { 'maxArrayLength': null });
        console.log('## key', item.item.descriptor.key);
        
        //get last set values in local storage for comparison
        const localCallStatus = getObjectFromLocalStorage("callStatus");
        console.log("calCallStatus before update: ",localCallStatus);

        console.log("data.Hold" ,data.Hold);

        console.log("localCallStatus.Hold",localCallStatus.Hold);
        
        //if calls is placed on hold
        if (data.Hold == "true" && localCallStatus.Hold=='false') {
          console.log('## Call is on hold');
          $("div#hold").append("<p>Your call has been placed on hold</p>");
          $('div#hold p').css('color', 'red');
          holdButton.classList.add("hide"); //hide hold button for this user
        }

        //if call hold is removed
        else if (data.Hold == "false" && localCallStatus.Hold=='true') {
          console.log('## Hold removed');
          $("div#hold").empty();
          holdButton.classList.remove("hide"); //hide hold button for this user
        }

        //store current call status in local storage
        storeObjectInLocalStorage("callStatus", JSON.stringify(data));
      });

    });

  }

  function updateUIAcceptedOutgoingCall(call) {
    //get conf sync map status
    const syncStateOutgoingCall = getSyncStatus(token, call.parameters.CallSid);

    console.log("## Call in progress ...");
    callButton.disabled = true;
    outgoingCallHangupButton.classList.remove("hide");
    volumeIndicators.classList.remove("hide");
    bindVolumeIndicators(call);
  }

  function updateUIDisconnectedOutgoingCall() {
    console.log("Call disconnected.");
    callButton.disabled = false;
    outgoingCallHangupButton.classList.add("hide");
    volumeIndicators.classList.add("hide");
    holdButton.classList.add("hide"); //hide hold button
    $("div#hold").empty();
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
    call.accept();

    console.log("## Incoming call object: ", call);

    //get sync map status
    const syncStateIncomingCall = getSyncStatus(token, call.parameters.CallSid);

    //update UI
    console.log("Accepted incoming call.");
    holdButton.classList.remove("hide"); //unhide hold button
    incomingCallAcceptButton.classList.add("hide");
    incomingCallRejectButton.classList.add("hide");
    incomingCallHangupButton.classList.remove("hide");

    holdButton.onclick = () => {
      console.log("## Hold button clicked ...");

      const payload = {
        target: call.parameters.From.split(":")[1],
        callSid: call.parameters.CallSid
      };
      holdCall(payload);
    };
  }

  // REJECT INCOMING CALL

  function rejectIncomingCall(call) {
    call.reject();
    console.log("Rejected incoming call");
    resetIncomingCallUI();
  }

  // HANG UP INCOMING CALL

  function hangupIncomingCall(call) {
    call.disconnect();
    console.log("Hanging up incoming call");
    resetIncomingCallUI();
  }

  // HANDLE CANCELLED INCOMING CALL

  function handleDisconnectedIncomingCall() {
    console.log("Incoming call ended.");
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
    $("div#hold").empty();
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



});