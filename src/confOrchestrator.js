const VoiceResponse = require("twilio").twiml.VoiceResponse;
const AccessToken = require("twilio").jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const SyncGrant = AccessToken.SyncGrant;

const nameGenerator = require("../name_generator");
const config = require("../config");
const client = require('twilio')(config.accountSid, config.authToken);

const { User, Conference, Call } = require('./conferenceDBInterface');

let identity;

//Generates tokens for voice clients
exports.tokenGenerator = function tokenGenerator() {
  identity = nameGenerator();

  const accessToken = new AccessToken(
    config.accountSid,
    config.apiKey,
    config.apiSecret
  );
  accessToken.identity = identity;
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: config.twimlAppSid,
    incomingAllow: true,
  });

  const syncGrant = new SyncGrant({
    serviceSid: config.syncServiceSid
  });
  accessToken.addGrant(voiceGrant);
  accessToken.addGrant(syncGrant);

  // Include identity and token in a JSON response
  return {
    identity: identity,
    token: accessToken.toJwt(),
  };
};

//Twiml app that creates conference
exports.createConference = function createConference(requestBody) {
  // console.log("requestBody to voiceResponse: ", JSON.stringify(requestBody));
  const toNumberOrClientName = requestBody.To;
  const callerId = config.callerId;
  let twiml = new VoiceResponse();

  // If the request to the /voice endpoint is TO your Twilio Number, 
  // then it is an incoming call towards your Twilio.Device.
  if (toNumberOrClientName == callerId) {
    let dial = twiml.dial();

    // This will connect the caller with your Twilio.Device/client 
    dial.client(identity);

  }

  else if (requestBody.To) {

    //CONF - Start a conference
    startConference(twiml, requestBody.From.split(":")[1], requestBody.To);
  }
  return twiml.toString();
};

//Handles conference status callback events
exports.confEventHandler = async function confEventHandler(event) {
  const syncMapID = "_" + event.CallSid;


  //if a participant joined the conference, create sync map
  if (event.StatusCallbackEvent == "participant-join") {
    console.log(`New participant call SID ${syncMapID} joined conference ${event.ConferenceSid}`);
    // console.log("event: ", event);

    try {
      //create sync map for this call sid
      const newSyncMap = await client.sync.v1.services(config.syncServiceSid)
        .syncMaps
        .create({ uniqueName: syncMapID, ttl: "600" });

      console.log(`New sync map created: ${newSyncMap.sid} for ${syncMapID}`);
    }

    catch (err) {
      console.log(`Sync map creation for ${syncMapID} failed: ${err}`);
    }

    try {
      //add key to the map
      const newKey = await client.sync.v1.services(config.syncServiceSid)
        .syncMaps(syncMapID)
        .syncMapItems
        .create({
          key: event.CallSid, data: {
            StatusCallbackEvent: event.StatusCallbackEvent,
            AccountSid: event.AccountSid,
            ConferenceSid: event.ConferenceSid,
            CallSid: event.CallSid,
            Timestamp: event.Timestamp,
            Coaching: event.Coaching,
            Hold: event.Hold,
            Muted: event.Muted,
            EndConferenceOnExit: event.EndConferenceOnExit,
            StartConferenceOnEnter: event.StartConferenceOnEnter
          }
        });

      console.log(`new key ${newKey.key} added to ${syncMapID}`);
    }

    catch (err) {
      console.error(`Key creation ${event.CallSid} for map ${syncMapID} failed: ${err}`);
    }
  }
  //if this is an update about a participant, update map corresponding to that call leg
  else if (typeof event.CallSid !== 'undefined') {
    console.log(`Update sync map for participant call SID ${syncMapID} joined conference ${event.ConferenceSid}`);
    console.log("callsid event: ", event);
    try {
      const sync_map_item = await client.sync.v1.services(config.syncServiceSid)
        .syncMaps(syncMapID)
        .syncMapItems(event.CallSid)
        .update({
          data: {
            StatusCallbackEvent: event.StatusCallbackEvent,
            AccountSid: event.AccountSid,
            ConferenceSid: event.ConferenceSid,
            CallSid: event.CallSid,
            Timestamp: event.Timestamp,
            Coaching: event.Coaching,
            Hold: event.Hold,
            Muted: event.Muted,
            EndConferenceOnExit: event.EndConferenceOnExit,
            StartConferenceOnEnter: event.StartConferenceOnEnter
          }
        });
      console.log(`Sync map updated: ${sync_map_item.key}`);

    }
    catch (err) {
      console.error(`error updating sync map for ${syncMapID}: ${err}`);
    }

    //update database
    if(event.StatusCallbackEvent == "participant-leave") {

      await inactiveCallStatusUpdate(event.CallSid);

    }
  }

  else {
    console.log("non callSID event");
  }

  //Include identity and token in a JSON response
  return {
    'status': "received"
  };
};

//Handles participant status callback events
exports.participantEventsHandler = async function participantEventsHandler(event) {

  // console.log("participant event: ", event);

  //Include identity and token in a JSON response
  return {
    'status': "received"
  };
};

//Updates participant's hold status
exports.holdParticipant = async function holdParticipant(event) {

  console.log("hold request rcvd: ", event);

  const targetCall = await findCall(event.target); //Read Twilio Asset to get Conf SID and other participant's SID.
  console.log(`Received call details for ${event.target}: ${targetCall}`);

  try {
    await client.conferences(targetCall.conferencesid)
      .participants(targetCall.callsid)
      .update({ hold: true });

    console.log(`${event.target} has been placed on hold`);

    return {
      'status': "hold_success"
    };
  }
  catch (err) {
    console.error(`Hold request for ${event.target} has failed.`);
    return {
      'status': "hold_failed"
    };
  }
};

//creates conference and adds participants
async function startConference(twiml, fromLabel, to) {

  const roomName = generateRoomName();
  let participant2;


  try {
    console.log("Starting conference...");

    const dial = twiml.dial();

    //create conference with 1st participant
    const confRes = await dial.conference({
      statusCallback: `${config.ngrokURL}/confEvents?to=${encodeURIComponent(to)}`,
      statusCallbackEvent: 'start end join leave mute hold modify',
      startConferenceOnEnter: 'true',
      endConferenceOnExit: 'true',
      participantLabel: fromLabel
    }, roomName);

    console.log("Conference started!");

    // add another participant to conference
    participant2 = await client.conferences(roomName)
      .participants
      .create({
        earlyMedia: true,
        beep: 'onEnter',
        endConferenceOnExit: "true",
        statusCallback: `${config.ngrokURL}/participantEvents`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        record: false,
        from: "client:" + fromLabel,
        to: `client:${to}`,
        muted: 'false',
        label: `${to}`
      });

    console.log("Participant 2: ", participant2);

  }

  catch (err) { console.error("Error establishing conference: ", err); }

  //Add conference to database
  const newConference = new Conference(participant2.conferenceSid, roomName);

  try {
    await newConference.save();
    console.log(`Conference ${participant2.conferenceSid} saved successfully`);
  }

  catch (err) {
    console.error(`Error saving conference ${participant2.conferenceSid}: ${err}`);
  }

  //Add 2nd participant to database
  const call2 = new Call(participant2.callSid, participant2.label, participant2.conferenceSid, 'Y');
  try {
    await call2.save();
    console.log(`Call ${participant2.callSid} saved successfully`);
  }

  catch (err) {
    console.error(`Error saving call ${participant2.callSid}: ${err}`);
  }


  ////Retrieve callSid and add 1st participant to database
  const participant1 = await client.conferences(participant2.conferenceSid)
    .participants(fromLabel)
    .fetch();

  console.log("participant1: ", participant1);

  const call1 = new Call(participant1.callSid, participant1.label, participant1.conferenceSid,'Y');

  try {
    await call1.save();
    console.log(`Call ${participant1.callSid} saved successfully`);
  }

  catch (err) {
    console.error(`Error saving call ${participant1.callSid}: ${err}`);
  }

}

function generateRoomName() {
  const randString = Array.from(Array(34), () => Math.floor(Math.random() * 36).toString(36)).join('');

  return "CR" + randString;
}

//find a call based on participant label
async function findCall(participantLabel) {

  try {
    const result = await Call.findByParticipantLabel(participantLabel);
    console.log(`Found the call: ${result}`);
    return (result);
  }

  catch (err) {
    console.error(`Error in finding call for participant ${targetLabel}`);
  }

}

//update call status to inactive in DB 
async function inactiveCallStatusUpdate(callSid) {

  try {
    const result = await Call.updateCallStatus(callSid,'N');
    console.log(`Call status updated ${result}`);
    return (result);
  }

  catch (err) {
    console.error(`Error in updating call status for ${callSid}`);
  }

}