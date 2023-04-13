const VoiceResponse = require("twilio").twiml.VoiceResponse;
const AccessToken = require("twilio").jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const SyncGrant = AccessToken.SyncGrant;

const nameGenerator = require("../name_generator");
const config = require("../config");
const client = require('twilio')(config.accountSid, config.authToken);

const { User, Conference, Call } = require('./dbClasses');

let identity;


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
  console.log("event for call SID: ", syncMapID);
  console.log("conference event: ", event);

  //if a participant joined the conference, create sync map
  if (event.StatusCallbackEvent == "participant-join") {
    console.log(`New participant joined conference ${event.ConferenceSid}`);

    try {
      //create sync map for this call sid
      await client.sync.v1.services(config.syncServiceSid)
        .syncMaps
        .create({ uniqueName: syncMapID, ttl: "14400" })
        .then(sync_map => console.log("sync_map sid", sync_map.sid));

      //add key to the map
      await client.sync.v1.services(config.syncServiceSid)
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
        })
        .then(sync_map_item => console.log(sync_map_item.key));
    }

    catch (err) {
      console.log("Adding sync map creation failed", err);
    }
  }

  else {
    try {
      //if event is for a call leg, update map corresponding to that call leg
      if (typeof event.CallSid !== 'undefined') {
        await client.sync.v1.services(config.syncServiceSid)
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

  // console.log("participant event rcvd by function: ", event);

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

    // Include identity and token in a JSON response
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

//creates conference and adds participants
async function startConference(twiml, fromLabel, to) {

  try {
    console.log("Starting conference...");

    const dial = twiml.dial();
    const roomName = generateRoomName();

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
    const participant2 = await client.conferences(roomName)
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

    //Add conference to database
    const newConference = new Conference(participant2.conferenceSid, roomName);

    newConference.save((err) => {
      if (err) {
        console.error(`Error saving conference ${participant2.conferenceSid}: ${err}`);
      } else {
        console.log(`Conference ${participant2.conferenceSid} saved successfully`);
      }
    });

    //Add 2nd participant to database
    const call2 = new Call(participant2.callSid, participant2.label, participant2.conferenceSid);

    call2.save((err) => {
      if (err) {
        console.error(`Error saving call ${participant2.callSid}: ${err}`);
      } else {
        console.log(`Call ${participant2.callSid} saved successfully`);
      }
    });

    ////Retrieve callSid and add 1st participant to database
    const participant1 = await client.conferences(participant2.conferenceSid)
      .participants(fromLabel)
      .fetch();

    console.log("participant1: ", participant1);

    const call1 = new Call(participant1.callSid, participant1.label, participant1.conferenceSid);

    call1.save((err) => {
      if (err) {
        console.error(`Error saving call ${participant1.callSid}: ${err}`);
      } else {
        console.log(`Call ${participant1.callSid} saved successfully`);
      }
    });

  } catch (err) { console.log("Error establishing conference: ", err); }

}


function generateRoomName() {
  const randString = Array.from(Array(34), () => Math.floor(Math.random() * 36).toString(36)).join('');

  return "CR" + randString;
}