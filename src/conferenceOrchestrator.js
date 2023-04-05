const VoiceResponse = require("twilio").twiml.VoiceResponse;
const AccessToken = require("twilio").jwt.AccessToken;
const config = require("../config");
const client = require('twilio')(config.accountSid, config.authToken);
const SYNCSERVICEID = "IS9f06d3e79daa611bb94c63b1e9843b5d";


//Handles conference status callback events
exports.eventHandler = async function eventHandler(event, destinationNum) {
  const syncMapID = "_" + event.CallSid; //changed temporarily from event.ConferenceSid
  console.log("event for call SID: ", syncMapID);
  console.log("conference event: ", event);
  // console.log("destination number: ", destinationNum);


  //if 1st participant joined the conference, create sync map and add the other participant to the conference
  if (event.SequenceNumber == 1 && event.StatusCallbackEvent == "participant-join") {
    console.log("1st participant joined");

    try {
      //create sync map for this call sid
      await client.sync.v1.services(SYNCSERVICEID)
        .syncMaps
        .create({ uniqueName: syncMapID, ttl: "604800" })
        .then(sync_map => console.log("sync_map sid", sync_map.sid));

      //add key to the map
      await client.sync.v1.services(SYNCSERVICEID)
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
          muted: 'false'
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
      await client.sync.v1.services(SYNCSERVICEID)
        .syncMaps
        .create({ uniqueName: syncMapID, ttl: "604800" })
        .then(sync_map => console.log("sync_map sid", sync_map.sid));

      //add key to the map
      await client.sync.v1.services(SYNCSERVICEID)
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
        client.sync.v1.services(SYNCSERVICEID)
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
exports.holdParticipant = async function holdParticipant(event) {

  console.log("holdParticipant event rcvd by function: ", event);
  try {
    client.conferences(event.conferenceSID)
      .participants(event.callSID)
      .update({ hold: true })
      .then(participant => console.log(participant.callSid));

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


