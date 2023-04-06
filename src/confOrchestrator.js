const VoiceResponse = require("twilio").twiml.VoiceResponse;
const AccessToken = require("twilio").jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const SyncGrant = AccessToken.SyncGrant;

const nameGenerator = require("../name_generator");
const config = require("../config");
const client = require('twilio')(config.accountSid, config.authToken);
let identity;

const jsonDB = require('simple-json-db')
const db = new jsonDB('./../assets/storage.json', {}); //initialize DB

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

exports.voiceResponse = function voiceResponse(requestBody) {
  console.log("requestBody to voiceResponse: ", JSON.stringify(requestBody));
  const toNumberOrClientName = requestBody.To;
  const callerId = config.callerId;
  let twiml = new VoiceResponse();

  // If the request to the /voice endpoint is TO your Twilio Number, 
  // then it is an incoming call towards your Twilio.Device.
  if (toNumberOrClientName == callerId) {
    let dial = twiml.dial();

    // This will connect the caller with your Twilio.Device/client 
    dial.client(identity);

  } else if (requestBody.To) {

    //CONF - Start a conference
    startConference(twiml, requestBody.From.split(":")[1], requestBody.To);
    updateConfDB();

  }
  return twiml.toString();
};

//Handles conference status callback events
exports.confEventHandler = async function confEventHandler(event, destinationNum) {
  const syncMapID = "_" + event.CallSid; //changed temporarily from event.ConferenceSid
  console.log("event for call SID: ", syncMapID);
  console.log("conference event: ", event);
  // console.log("destination number: ", destinationNum);


  //if 1st participant joined the conference, create sync map and add the other participant to the conference
  if (event.SequenceNumber == 1 && event.StatusCallbackEvent == "participant-join") {
    console.log("1st participant joined");

    try {
      //create sync map for this call sid
      await client.sync.v1.services(config.syncServiceSid)
        .syncMaps
        .create({ uniqueName: syncMapID, ttl: "604800" })
        .then(sync_map => console.log("sync_map sid", sync_map.sid));

      //add key to the map
      await client.sync.v1.services(config.syncServiceSid)
        .syncMaps(syncMapID)
        .syncMapItems
        .create({
          key: event.CallSid, data: {
            Coaching: event.Coaching,
            FriendlyName: event.FriendlyName,
            SequenceNumber: event.SequenceNumber,
            ConferenceSid: event.ConferenceSid,
            EndConferenceOnExit: event.EndConferenceOnExit,
            CallSid: event.CallSid,
            StatusCallbackEvent: event.StatusCallbackEvent,
            Timestamp: event.Timestamp,
            StartConferenceOnEnter: event.StartConferenceOnEnter,
            Hold: event.Hold,
            AccountSid: event.AccountSid,
            Muted: event.Muted
          }
        })
        .then(sync_map_item => console.log(sync_map_item.key));

      // add another participant to conference
      await client.conferences(event.ConferenceSid)
        .participants
        .create({
          earlyMedia: true,
          beep: 'onEnter',
          endConferenceOnExit: "true",
          statusCallback: 'https://3eb9-2607-9880-3297-ffd2-7820-eb28-381-80ed.ngrok.io/participantEvents',
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          record: false,
          from: config.callerId,
          to: `client:${destinationNum}`,
          muted: 'false',
          label:`${destinationNum}`
        })
        .then(participant => console.log(participant.callSid));
    }

    catch (err) {
      console.log("Adding participant/sync map creation failed", err);
    }
  }


  //if 2nd participant joined the conference, create sync map 
  else if (event.SequenceNumber > 1 && event.StatusCallbackEvent == "participant-join") {
    console.log("2nd participant joined");

    try {
      //create sync map for this call sid
      await client.sync.v1.services(config.syncServiceSid)
        .syncMaps
        .create({ uniqueName: syncMapID, ttl: "604800" })
        .then(sync_map => console.log("sync_map sid", sync_map.sid));

      //add key to the map
      await client.sync.v1.services(config.syncServiceSid)
        .syncMaps(syncMapID)
        .syncMapItems
        .create({
          key: event.CallSid, data: {
            Coaching: event.Coaching,
            FriendlyName: event.FriendlyName,
            SequenceNumber: event.SequenceNumber,
            ConferenceSid: event.ConferenceSid,
            EndConferenceOnExit: event.EndConferenceOnExit,
            CallSid: event.CallSid,
            StatusCallbackEvent: event.StatusCallbackEvent,
            Timestamp: event.Timestamp,
            StartConferenceOnEnter: event.StartConferenceOnEnter,
            Hold: event.Hold,
            AccountSid: event.AccountSid,
            Muted: event.Muted
          }
        })
        .then(sync_map_item => console.log(sync_map_item.key));

    }

    catch (err) {
      console.log("Adding participant/sync map creation failed", err);
    }
  }

  else {
    try {
      console.log("Else...");
      //if event is for a call leg, update map corresponding to that call leg
      if (typeof event.CallSid !== 'undefined') {
        console.log("If callSID");
        //update sync map of call SID for current conference event
        client.sync.v1.services(config.syncServiceSid)
          .syncMaps(syncMapID)
          .syncMapItems(event.CallSid)
          .update({
            data: {
              Coaching: event.Coaching,
              FriendlyName: event.FriendlyName,
              SequenceNumber: event.SequenceNumber,
              ConferenceSid: event.ConferenceSid,
              EndConferenceOnExit: event.EndConferenceOnExit,
              CallSid: event.CallSid,
              StatusCallbackEvent: event.StatusCallbackEvent,
              Timestamp: event.Timestamp,
              StartConferenceOnEnter: event.StartConferenceOnEnter,
              Hold: event.Hold,
              AccountSid: event.AccountSid,
              Muted: event.Muted
            }
          })
          .then(sync_map_item => console.log(sync_map_item.key));
      }
    }

    catch (err) {
      console.log("error creating sync map: ", err);
    }
  };

  //Include identity and token in a JSON response
  return {
    'status': "received"
  };
};

//Handles participant status callback events
exports.participantEventsHandler = async function participantEventsHandler(event) {

  console.log("participant event rcvd by function: ", event);

  //Include identity and token in a JSON response
  return {
    'status': "received"
  };
};


//Updates participant's hold status
exports.holdParticipant = async function holdParticipant(reqCallSID) {

  console.log("hold request rcvd from call SID: ", reqCallSID);

  // const conf= getConferenceDeets(reqCallSID); //Read Twilio Asset to get Conf SID and other participant's SID.

  try {
    // client.conferences(conf.conferenceSID)
    //   .participants(conf.callSID)
    //   .update({ hold: true })
    //   .then(participant => console.log(participant.callSid));

    //Include identity and token in a JSON response
    return {
      'status': "hold_success"
    };
  }
  catch (err) {
    console.log("error placing participant on hold", err);
    return {
      'status': "hold_failed"
    };
  }
};


/**
 * Checks if the given value is valid as phone number
 * @param {Number|String} number
 * @return {Boolean}
 */
function isAValidPhoneNumber(number) {
  return /^[\d\+\-\(\) ]+$/.test(number);
}

async function startConference(twiml, fromLabel, to) {

  try {
    console.log("Starting conference...");

    const dial = twiml.dial();

    await dial.conference({
      statusCallback: `https://3eb9-2607-9880-3297-ffd2-7820-eb28-381-80ed.ngrok.io/confEvents?to=${encodeURIComponent(to)}`,
      statusCallbackEvent: 'start end join leave mute hold modify',
      startConferenceOnEnter: 'true',
      endConferenceOnExit: 'true',
      participantLabel: fromLabel
    }, "Room007");

    console.log("Conference started ");

  } catch (err) { console.log("Error starting conference: ", err); }

}

async function updateConfDB(twiml, fromLabel, to) {
  
  try {
    console.log("Starting conference...");

    client.serverless.v1.services(config.assetServiceSid)
      .assets
      .create({ friendlyName: 'confState' })
      .then(asset => console.log(asset.sid));

    console.log("Conference started ", twiml.toString());

  } catch (err) { console.log("Error starting conference: ", err); }

}